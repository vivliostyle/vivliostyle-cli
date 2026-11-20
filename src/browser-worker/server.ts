import { once } from 'node:events';
import fs from 'node:fs';
import { createServer, type Socket } from 'node:net';

import * as v from 'valibot';

import { Logger } from '../logger.js';
import type { PdfRenderProgress } from '../output/pdf-render.js';
import { registerCleanupHandler, toError } from '../util.js';
import { WorkerBrowser } from './browser.js';
import {
  ClientMessageSchema,
  encodePageSize,
  protocolVersion,
  resolveWorkerSocket,
  WorkerConnection,
  type RenderInputs,
} from './protocol.js';

interface Client {
  socket: Socket;
  connection: WorkerConnection;
  controller: AbortController;
  rendering?: Promise<void>;
}

const diagnosticLimit = 8 * 1024;
const diagnosticQueueLimit = 64 * 1024;

function truncateDiagnostic(value: string): string {
  // A UTF-8 string takes at least as many bytes as its UTF-16 length.
  const prefix = value.slice(0, diagnosticLimit);
  if (Buffer.byteLength(prefix) <= diagnosticLimit) {
    return prefix;
  }
  const bytes = Buffer.allocUnsafe(diagnosticLimit);
  // Buffer.write skips a final code point if it cannot fit in full.
  return bytes.toString('utf8', 0, bytes.write(prefix));
}

function reportProgress(client: Client, event: PdfRenderProgress): void {
  if (
    client.socket.writableLength > diagnosticQueueLimit &&
    event.type !== 'browser' &&
    event.type !== 'typeset' &&
    event.type !== 'printing'
  ) {
    return;
  }

  const send = (progress: PdfRenderProgress) =>
    client.connection.send({ type: 'progress', event: progress });
  switch (event.type) {
    case 'console':
      send({
        ...event,
        level: truncateDiagnostic(event.level),
        message: truncateDiagnostic(event.message),
      });
      break;
    case 'debug':
    case 'error':
      send({ ...event, message: truncateDiagnostic(event.message) });
      break;
    case 'response':
      send({ ...event, url: truncateDiagnostic(event.url) });
      break;
    case 'pagination': {
      const { href } = event;
      send({
        ...event,
        href:
          href !== undefined &&
          href.length <= diagnosticLimit &&
          Buffer.byteLength(href) <= diagnosticLimit
            ? href
            : undefined,
      });
      break;
    }
    default:
      send(event);
  }
}

export async function runBrowserWorker(
  socketPath: string,
  signal: AbortSignal,
): Promise<void> {
  const address = resolveWorkerSocket(socketPath);
  if (fs.lstatSync(address, { throwIfNoEntry: false })) {
    throw new Error(
      `Browser worker socket path already exists: ${address}. Remove a stale socket only after the previous worker has stopped.`,
    );
  }

  const browser = new WorkerBrowser(signal);
  const clients = new Set<Client>();
  const queue: Client[] = [];
  let lease: Client | undefined;
  let stopping = false;
  const stopped = Promise.withResolvers<null>();
  const shutdownError = new Error('Browser worker is shutting down.');

  function grantLease() {
    if (!lease && !stopping) {
      lease = queue.shift();
      lease?.connection.send({ type: 'leased' });
    }
  }

  async function release(client: Client) {
    clients.delete(client);
    const index = queue.indexOf(client);
    if (index !== -1) {
      queue.splice(index, 1);
    }
    client.controller.abort(new Error('Browser worker client disconnected.'));
    if (lease === client) {
      await client.rendering;
      lease = undefined;
      grantLease();
    }
  }

  async function render(
    client: Client,
    inputs: RenderInputs,
    renderController: AbortController,
  ) {
    const renderSignal = AbortSignal.any([
      client.controller.signal,
      renderController.signal,
    ]);
    try {
      const { result, renderMs } = await browser.render(
        inputs,
        (event) => {
          if (!client.socket.destroyed && !stopping && !renderSignal.aborted) {
            reportProgress(client, event);
          }
        },
        renderSignal,
      );
      renderSignal.throwIfAborted();
      if (!client.socket.destroyed && !stopping) {
        const { pdf, pageSizeData, ...metadata } = result;
        client.connection.send({
          type: 'pdf',
          size: pdf.length,
          renderMs,
          metadata: {
            ...metadata,
            pageSizeData: pageSizeData.map((size) => encodePageSize(size)),
          },
        });
        client.socket.write(pdf);
      }
    } catch (error) {
      if (!client.socket.destroyed && !stopping) {
        client.connection.send({
          type: 'error',
          message: truncateDiagnostic(toError(error).message),
        });
      }
    } finally {
      client.rendering = undefined;
    }
  }

  const server = createServer((socket) => {
    if (stopping) {
      socket.destroy();
      return;
    }
    const client: Client = {
      socket,
      connection: new WorkerConnection(socket),
      controller: new AbortController(),
    };
    clients.add(client);
    socket.on('error', () => {});
    socket.once('close', () => void release(client));
    void serve(client);
  });

  async function serve(client: Client) {
    let started = false;
    let renderController: AbortController | undefined;
    try {
      while (!client.socket.destroyed) {
        const message = v.parse(
          ClientMessageSchema,
          await client.connection.readMessage(),
        );
        if (stopping) {
          return;
        }
        if (!started && message.type === 'acquire') {
          if (message.version !== protocolVersion) {
            throw new Error(
              `Incompatible browser worker protocol. Expected version ${protocolVersion}.`,
            );
          }
          started = true;
          queue.push(client);
          if (lease) {
            client.connection.send({ type: 'queued' });
          }
          grantLease();
        } else if (
          lease === client &&
          message.type === 'render' &&
          !client.rendering
        ) {
          renderController = new AbortController();
          client.rendering = render(client, message.inputs, renderController);
        } else if (lease === client && message.type === 'cancel') {
          renderController?.abort(new Error('PDF rendering cancelled.'));
        } else {
          throw new Error('Unexpected browser worker request.');
        }
      }
    } catch (error) {
      if (!client.socket.destroyed && !stopping) {
        client.connection.send({
          type: 'error',
          message: truncateDiagnostic(toError(error).message),
        });
        client.socket.end(() => {
          client.socket.destroy();
        });
      }
    }
  }

  const listening = once(server, 'listening');
  server.once('error', (error) => stopped.reject(error));
  // The launch promise also observes bind errors.
  void stopped.promise.catch(() => {});
  server.listen(address);

  let shuttingDown: Promise<void> | undefined;
  const shutdown = () =>
    (shuttingDown ??= (async () => {
      stopping = true;
      await listening.catch(() => {});
      const closed = new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      const rendering = lease?.rendering;
      for (const client of clients) {
        client.controller.abort(shutdownError);
        if (!client.socket.destroyed && !client.socket.writableEnded) {
          client.connection.send({
            type: 'error',
            message: shutdownError.message,
          });
          client.socket.end(() => {
            client.socket.destroy();
          });
        }
      }
      const timer = setTimeout(() => {
        for (const { socket } of clients) {
          socket.destroy();
        }
      }, 5000);
      try {
        await rendering;
        await browser.close();
        await closed;
      } finally {
        clearTimeout(timer);
        for (const { socket } of clients) {
          socket.destroy();
        }
        stopped.resolve(null);
      }
    })());

  const unregister = registerCleanupHandler(
    'Stopping browser worker',
    shutdown,
  );
  const onAbort = () => {
    void shutdown().catch(stopped.reject);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    await listening;
    signal.throwIfAborted();
    fs.chmodSync(address, 0o600);
    Logger.stdout.write(`Browser worker ready at ${address}\n`);
    await stopped.promise;
  } finally {
    try {
      await shutdown();
    } finally {
      signal.removeEventListener('abort', onAbort);
      unregister();
    }
  }
}
