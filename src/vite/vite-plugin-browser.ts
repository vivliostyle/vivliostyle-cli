import upath from 'upath';
import * as vite from 'vite';
import { launchPreview } from '../browser.js';
import type { ResolvedTaskConfig } from '../config/resolve.js';
import type { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { CMYK_RESERVE_MAP_FILENAME } from '../const.js';
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
    const pdfOutput = config.outputs.find((o) => o.format === 'pdf');
    const cmykReserveMapUrl =
      pdfOutput &&
      'cmyk' in pdfOutput &&
      pdfOutput.cmyk &&
      pdfOutput.cmyk.reserveMap.length
        ? upath.posix.join(config.base, CMYK_RESERVE_MAP_FILENAME)
        : undefined;
    const url = await getViewerFullUrl({
      ...config,
      cmykReserveMapUrl,
    });
    const { page, browser } = await launchPreview({
      mode: 'preview',
      url,
      config,
      /* v8 ignore next 4 */
      onPageOpen: async (page) => {
        // Terminate preview when the previewing page is closed
        page.on('close', handlePageClose);
      },
    });

    // Vivliostyle Viewer uses `i18nextLng` in localStorage for UI language
    if (!import.meta.env?.VITEST) {
      /* v8 ignore next 4 */
      await page.evaluate((locale) => {
        window.localStorage.setItem('i18nextLng', locale);
      }, locale);
    }
    // Move focus from the address bar to the page
    await page.bringToFront();
    // Focus to the URL input box if available
    if (!import.meta.env?.VITEST) {
      /* v8 ignore next 6 */
      await page.evaluate(() => {
        document
          .querySelector<HTMLInputElement>('#vivliostyle-input-url')
          ?.focus();
      });
    }

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
