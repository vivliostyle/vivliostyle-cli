import fs from 'node:fs';

import {
  launchBrowser,
  openViewerPage,
  runBrowserOperationWithAbort,
} from '../browser.js';
import { Logger } from '../logger.js';
import {
  createPdfRenderer,
  type PdfRenderProgress,
  type PdfRenderResult,
} from '../output/pdf-render.js';
import { toError } from '../util.js';
import type { RenderInputs } from './protocol.js';

const cleanupTimeout = 5000;

export class WorkerBrowser {
  readonly #shutdownSignal: AbortSignal;
  #current?: Awaited<ReturnType<typeof launchBrowser>> & { key: string };

  constructor(shutdownSignal: AbortSignal) {
    this.#shutdownSignal = shutdownSignal;
  }

  async #getBrowser(inputs: RenderInputs) {
    const { settings, browserTag } = inputs;
    const { executablePath } = settings;
    const executable = fs.statSync(executablePath);
    try {
      if (!executable.isFile()) {
        throw new Error('Expected a file.');
      }
      fs.accessSync(executablePath, fs.constants.X_OK);
    } catch (error) {
      throw new Error(
        `Chromium path is not an executable file: ${executablePath}`,
        {
          cause: error,
        },
      );
    }
    const key = JSON.stringify([
      settings,
      browserTag,
      executable.dev,
      executable.ino,
      executable.size,
      executable.mtimeMs,
    ]);
    if (this.#current?.key === key && this.#current.browser.connected) {
      return { browser: this.#current.browser, launchMs: 0 };
    }
    await this.close();

    this.#shutdownSignal.throwIfAborted();
    const controller = new AbortController();
    const abortLaunch = () => controller.abort(this.#shutdownSignal.reason);
    this.#shutdownSignal.addEventListener('abort', abortLaunch, { once: true });
    const timer = setTimeout(
      () => controller.abort(new Error('Chromium launch timed out.')),
      30_000,
    );
    try {
      const start = performance.now();
      const launched = await launchBrowser({
        settings,
        signal: controller.signal,
        pipe: true,
        // The connection is shared. The renderer enforces its own deadline.
        protocolTimeout: 0,
      });
      this.#current = { ...launched, key };
      return {
        browser: launched.browser,
        launchMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      controller.signal.throwIfAborted();
      throw new Error(
        `Failed to launch Chromium at ${executablePath}: ${toError(error).message}`,
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
      this.#shutdownSignal.removeEventListener('abort', abortLaunch);
    }
  }

  async close(force = false): Promise<void> {
    const current = this.#current;
    this.#current = undefined;
    if (!current) {
      return;
    }
    const child = current.browser.process();
    const killBrowser = () => {
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        try {
          // Puppeteer launches Chromium in its own process group on POSIX.
          process.kill(-child.pid, 'SIGKILL');
        } catch (error) {
          Logger.debug('Failed to kill Chromium', error);
          child.kill('SIGKILL');
        }
      }
    };
    if (force) {
      killBrowser();
    }
    const timer = setTimeout(killBrowser, cleanupTimeout);
    try {
      await current.closeBrowser();
    } finally {
      clearTimeout(timer);
    }
  }

  async render(
    inputs: RenderInputs,
    report: (event: PdfRenderProgress) => void,
    clientSignal: AbortSignal,
  ): Promise<{ result: PdfRenderResult; renderMs: number }> {
    clientSignal.throwIfAborted();
    const { browser, launchMs } = await this.#getBrowser(inputs);
    clientSignal.throwIfAborted();

    const { timeout, url, cmyk, credentials } = inputs;
    const start = performance.now();
    const deadline = new AbortController();
    const crashed = new AbortController();
    const onCrash = () =>
      crashed.abort(new Error('Chromium disconnected during PDF rendering.'));
    browser.once('disconnected', onCrash);
    const timer = setTimeout(
      () =>
        deadline.abort(
          new Error(`PDF rendering timed out after ${timeout / 1000} s.`),
        ),
      Math.min(timeout, 2 ** 31 - 1),
    );
    const signal = AbortSignal.any([
      clientSignal,
      deadline.signal,
      crashed.signal,
    ]);
    const renderer = createPdfRenderer({ timeout, cmyk, report });
    const context = browser.createBrowserContext();
    let closing: Promise<void> | undefined;
    const closeContext = () =>
      (closing ??= (async () => {
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            context.then(
              (created) => created.close(),
              () => {},
            ),
            new Promise<never>((_, reject) => {
              watchdog = setTimeout(() => {
                reject(
                  new Error(
                    'Chromium could not close the PDF render context within five seconds.',
                  ),
                );
              }, cleanupTimeout);
            }),
          ]);
        } catch (error) {
          await this.close(true);
          throw error;
        } finally {
          clearTimeout(watchdog);
        }
      })());

    const finishContext = async () => {
      clearTimeout(timer);
      try {
        await closeContext();
        if (!browser.connected) {
          await this.close(true);
          throw new Error('Chromium disconnected during PDF rendering.');
        }
      } catch (error) {
        signal.throwIfAborted();
        throw error;
      } finally {
        browser.off('disconnected', onCrash);
      }
    };

    try {
      report({ type: 'browser', pid: browser.process()?.pid ?? 0, launchMs });
      return await runBrowserOperationWithAbort({
        signal,
        closeBrowser: closeContext,
        operation: async () => {
          try {
            const page = await openViewerPage({
              browserContext: await context,
              mode: 'build',
              url,
              credentials,
              signal,
              onPageOpen: renderer.onPageOpen,
            });
            const result = await renderer.render(browser, page, signal);
            return { result, renderMs: Math.round(performance.now() - start) };
          } finally {
            clearTimeout(timer);
          }
        },
      });
    } finally {
      await finishContext();
    }
  }
}
