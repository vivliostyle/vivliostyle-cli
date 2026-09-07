import type * as vite from 'vite';

import { launchPreview, runBrowserOperationWithAbort } from '../browser.js';
import type { ResolvedTaskConfig } from '../config/resolve.js';
import type { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { Logger } from '../logger.js';
import { getViewerFullUrl } from '../server.js';
import { getOsLocale, runCleanupHandlers } from '../util.js';
import { reloadConfig } from './plugin-util.js';

export function vsBrowserPlugin({
  config: _config,
  inlineConfig,
}: {
  config: ResolvedTaskConfig;
  inlineConfig: ParsedVivliostyleInlineConfig;
}): vite.Plugin {
  let config = _config;
  let server: vite.ViteDevServer | undefined;
  let closeBrowser: (() => Promise<void>) | undefined;

  function handlePageClose() {
    void (async () => {
      await server?.close();
      await runCleanupHandlers();
    })();
  }

  async function openPreviewPage() {
    const locale = getOsLocale();
    const url = await getViewerFullUrl(config);
    let localeScriptId: string | undefined;
    const {
      page,
      browser,
      closeBrowser: closeLaunchedBrowser,
    } = await launchPreview({
      mode: 'preview',
      url,
      signal: inlineConfig.signal,
      config,
      onPageOpen: async (openedPage) => {
        // Terminate preview when the previewing page is closed
        openedPage.on('close', handlePageClose);
        try {
          ({ identifier: localeScriptId } =
            await openedPage.evaluateOnNewDocument((lng) => {
              // Vivliostyle Viewer uses `i18nextLng` in localStorage for UI language
              window.localStorage.setItem('i18nextLng', lng);
            }, locale));
        } catch (error) {
          if (inlineConfig.signal?.aborted) {
            throw error;
          }
          Logger.debug('Failed to set up the viewer UI language', error);
        }
      },
    });

    closeBrowser = () => {
      page.off('close', handlePageClose);
      return closeLaunchedBrowser();
    };

    await runBrowserOperationWithAbort({
      signal: inlineConfig.signal,
      closeBrowser,
      operation: async () => {
        const continueUnlessPreviewIsEnding = async (
          description: string,
          setup: () => Promise<unknown>,
        ) => {
          try {
            await setup();
          } catch (error) {
            if (
              inlineConfig.signal?.aborted ||
              (!browser.connected && !page.isClosed())
            ) {
              throw error;
            }
            Logger.debug(`Failed to ${description}`, error);
          }
        };
        const registeredLocaleScriptId = localeScriptId;
        if (registeredLocaleScriptId !== undefined) {
          await continueUnlessPreviewIsEnding('remove the locale script', () =>
            page.removeScriptToEvaluateOnNewDocument(registeredLocaleScriptId),
          );
        }
        // Move focus from the address bar to the page
        await continueUnlessPreviewIsEnding('bring the page to front', () =>
          page.bringToFront(),
        );
        // Focus to the URL input box if available.
        // `waitForFunction` re-runs in the new document when a navigation
        // destroys the execution context
        await continueUnlessPreviewIsEnding('focus the URL input box', () =>
          page.waitForFunction(
            () => {
              const urlInput = document.querySelector<HTMLInputElement>(
                '#vivliostyle-input-url',
              );
              if (urlInput) {
                urlInput.focus();
                return true;
              }
              return document.readyState === 'complete';
            },
            { polling: 1000, signal: inlineConfig.signal },
          ),
        );
      },
    });
  }

  return {
    name: 'vivliostyle:browser',
    apply: () => Boolean(inlineConfig.openViewer),
    configureServer(viteServer) {
      server = viteServer;

      const originalListen = viteServer.listen.bind(viteServer);
      viteServer.listen = async (...args) => {
        const startedServer = await originalListen(...args);
        config = await reloadConfig(config, inlineConfig, startedServer.config);
        await openPreviewPage();
        return startedServer;
      };
    },
    async closeBundle() {
      await closeBrowser?.();
    },
  };
}
