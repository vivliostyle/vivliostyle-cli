import { fileURLToPath, pathToFileURL } from 'node:url';
import upath from 'upath';
import * as vite from 'vite';
import {
  checkBrowserAvailability,
  downloadBrowser,
  isPlaywrightExecutable,
  launchBrowser,
} from '../browser.js';
import { MergedConfig } from '../input/config.js';
import { getViewerFullUrl } from '../server.js';
import { debug, isUrlString, runExitHandlers } from '../util.js';
import { viewerRootPath } from './vite-plugin-viewer.js';

async function openPreview(
  { listenUrl, handleClose }: { listenUrl: string; handleClose: () => void },
  config: MergedConfig,
) {
  const input = (config.manifestPath ??
    config.webbookEntryUrl ??
    config.epubOpfPath) as string;
  const inputUrl = isUrlString(input) ? new URL(input) : pathToFileURL(input);
  viewerRootPath;
  const viewerUrl = new URL(`${viewerRootPath}/index.html`, listenUrl);
  const sourceUrl = new URL(listenUrl);
  sourceUrl.pathname = upath.join(
    '/',
    upath.relative(config.workspaceDir, fileURLToPath(inputUrl)),
  );
  const viewerFullUrl = getViewerFullUrl(
    {
      size: config.size,
      cropMarks: config.cropMarks,
      bleed: config.bleed,
      cropOffset: config.cropOffset,
      css: config.css,
      style: config.customStyle,
      userStyle: config.customUserStyle,
      singleDoc: config.singleDoc,
      quick: config.quick,
      viewerParam: config.viewerParam,
    },
    { viewerUrl, sourceUrl },
  );

  const { browserType, proxy, executableBrowser } = config;
  debug(`Executing browser path: ${executableBrowser}`);
  if (!checkBrowserAvailability(executableBrowser)) {
    if (isPlaywrightExecutable(executableBrowser)) {
      // The browser isn't downloaded first time starting CLI so try to download it
      await downloadBrowser(browserType);
    } else {
      // executableBrowser seems to be specified explicitly
      throw new Error(
        `Cannot find the browser. Please check the executable browser path: ${executableBrowser}`,
      );
    }
  }

  const browser = await launchBrowser({
    browserType,
    proxy,
    executablePath: executableBrowser,
    headless: false,
    noSandbox: !config.sandbox,
    disableWebSecurity: !config.viewer,
  });
  const page = await browser.newPage({
    viewport: null,
    ignoreHTTPSErrors: config.ignoreHttpsErrors,
  });

  page.on('close', handleClose);

  // Vivliostyle Viewer uses `i18nextLng` in localStorage for UI language
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  await page.addInitScript(
    `window.localStorage.setItem('i18nextLng', '${locale}');`,
  );

  // Prevent confirm dialog from being auto-dismissed
  page.on('dialog', () => {});

  await page.goto(viewerFullUrl);

  // Move focus from the address bar to the page
  await page.bringToFront();
  // Focus to the URL input box if available
  await page.locator('#vivliostyle-input-url').focus({ timeout: 0 });

  return {
    reload: () => page.reload(),
    close: () => {
      page.off('close', handleClose);
      browser.close();
    },
  };
}

export function vsBrowserPlugin({
  config,
}: {
  config: MergedConfig;
}): vite.Plugin {
  let server: vite.ViteDevServer | undefined;

  return {
    name: 'vivliostyle:browser',
    configureServer(viteServer) {
      server = viteServer;

      const _listen = viteServer.listen;
      viteServer.listen = async (...args) => {
        const server = await _listen(...args);

        // Terminate preview when the previewing page is closed
        async function handleClose() {
          await server?.close();
          runExitHandlers();
        }

        if (server.resolvedUrls?.local.length) {
          openPreview(
            {
              listenUrl: server.resolvedUrls.local[0],
              handleClose,
            },
            config,
          );
        }
        return server;
      };
    },
  };
}
