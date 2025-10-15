import * as vite from 'vite';
import { launchPreview } from '../browser.js';
import { ResolvedTaskConfig } from '../config/resolve.js';
import { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { getViewerFullUrl } from '../server.js';
import { getOsLocale, runExitHandlers } from '../util.js';
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
  let closeBrowser: (() => void) | undefined;

  async function handlePageClose() {
    await server?.close();
    runExitHandlers();
  }

  async function openPreviewPage() {
    const locale = await getOsLocale();
    const url = await getViewerFullUrl(config);
    const { page, browser } = await launchPreview({
      mode: 'preview',
      url,
      config,
      onPageOpen: async (page) => {
        // Terminate preview when the previewing page is closed
        page.on('close', handlePageClose);

        // Vivliostyle Viewer uses `i18nextLng` in localStorage for UI language
        await page.addInitScript(
          `window.localStorage.setItem('i18nextLng', '${locale}');`,
        );
      },
    });

    // Move focus from the address bar to the page
    await page.bringToFront();
    // Focus to the URL input box if available
    await page.locator('#vivliostyle-input-url').focus({ timeout: 0 });

    closeBrowser = () => {
      page.off('close', handlePageClose);
      browser.close();
    };
  }

  return {
    name: 'vivliostyle:browser',
    apply: () => Boolean(inlineConfig.openViewer),
    configureServer(viteServer) {
      server = viteServer;

      const _listen = viteServer.listen;
      viteServer.listen = async (...args) => {
        const server = await _listen(...args);
        config = await reloadConfig(config, inlineConfig, server.config);
        await openPreviewPage();
        return server;
      };
    },
    closeBundle() {
      closeBrowser?.();
    },
  };
}
