import type { Socket } from 'node:net';
import path from 'node:path';

import { pdfTiming, resolveBrowserLaunchSettings } from '../browser.js';
import type { ResolvedTaskConfig } from '../config/resolve.js';
import { Logger } from '../logger.js';
import type {
  PdfRenderProgress,
  PdfRenderResult,
} from '../output/pdf-render.js';
import {
  decodePageSize,
  protocolVersion,
  WorkerConnection,
  type RenderInputs,
  type WorkerMessage,
} from './protocol.js';
import { workerUnavailable } from './socket.js';

export type WorkerPdfRenderer = (
  config: ResolvedTaskConfig,
  url: string,
  cmyk: boolean,
  report: (event: PdfRenderProgress) => void,
) => Promise<PdfRenderResult>;

export async function withBrowserWorker(
  socket: Socket,
  socketPath: string,
  signal: AbortSignal,
  build: (render: WorkerPdfRenderer) => Promise<void>,
): Promise<void> {
  signal.throwIfAborted();
  const connection = new WorkerConnection(socket);
  let leased = false;
  let rendering = false;
  const abort = () => {
    if (!leased) {
      socket.destroy();
    } else if (rendering && !socket.destroyed) {
      connection.send({ type: 'cancel' });
    }
  };
  signal.addEventListener('abort', abort, { once: true });

  async function receive() {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- messages come from the worker in the owner-only directory
    const message = (await connection.readMessage()) as WorkerMessage;
    if (message.type === 'error') {
      throw new Error(message.message);
    }
    return message;
  }

  const render: WorkerPdfRenderer = async (config, url, cmyk, report) => {
    const settings = await resolveBrowserLaunchSettings('build', config);
    signal.throwIfAborted();
    const { browserType } = settings;
    if (browserType === 'firefox') {
      throw new Error(
        '--browser-worker requires Chrome or Chromium. Firefox is unsupported.',
      );
    }
    const { proxy } = config;
    const inputs = {
      url,
      timeout: config.timeout,
      cmyk,
      browserTag: config.browser.tag,
      settings: {
        ...settings,
        browserType,
        executablePath: path.resolve(settings.executablePath),
        headless: true,
      },
      credentials:
        proxy?.username && proxy.password
          ? { username: proxy.username, password: proxy.password }
          : undefined,
    } satisfies RenderInputs;
    if (socket.destroyed) {
      throw workerUnavailable(socketPath);
    }
    rendering = true;
    try {
      connection.send({ type: 'render', inputs });
      for (;;) {
        const message = await receive();
        switch (message.type) {
          case 'progress':
            report(message.event);
            break;
          case 'pdf': {
            const pdf = await connection.readPdf(message.size);
            signal.throwIfAborted();
            pdfTiming('PDF render renderMs=%d', message.renderMs);
            const { metadata } = message;
            return {
              ...metadata,
              pdf,
              pageSizeData: metadata.pageSizeData.map((size) =>
                decodePageSize(size),
              ),
            };
          }
          case 'leased':
          case 'queued':
            throw new Error(
              'Unexpected browser worker response during rendering.',
            );
        }
      }
    } catch (error) {
      signal.throwIfAborted();
      if (
        socket.destroyed &&
        error instanceof Error &&
        error.message === 'Browser worker connection closed.'
      ) {
        throw workerUnavailable(socketPath, error);
      }
      throw error;
    } finally {
      rendering = false;
    }
  };

  try {
    connection.send({ type: 'acquire', version: protocolVersion });
    try {
      let reply = await receive();
      if (reply.type === 'queued') {
        Logger.debug('Waiting for browser worker lease');
        reply = await receive();
      }
      if (reply.type !== 'leased') {
        throw new Error(
          'Unexpected browser worker response while acquiring a lease.',
        );
      }
    } catch (error) {
      signal.throwIfAborted();
      throw workerUnavailable(socketPath, error);
    }

    signal.throwIfAborted();
    leased = true;
    Logger.debug('Acquired browser worker lease');
    await build(render);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
