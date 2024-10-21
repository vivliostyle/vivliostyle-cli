import chokidar from 'chokidar';
import {
  checkBrowserAvailability,
  downloadBrowser,
  isPlaywrightExecutable,
  launchBrowser,
} from './browser.js';
import {
  CliFlags,
  collectVivliostyleConfig,
  mergeConfig,
} from './input/config.js';
import {
  cleanupWorkspace,
  compile,
  copyAssets,
  prepareThemeDirectory,
} from './processor/compile.js';
import { prepareServer } from './server.js';
import {
  cwd,
  debug,
  gracefulError,
  isUrlString,
  logSuccess,
  logUpdate,
  pathContains,
  pathEquals,
  runExitHandlers,
  setLogLevel,
  startLogging,
  upath,
} from './util.js';

let timer: NodeJS.Timeout;

export interface PreviewCliFlags extends CliFlags {}

/**
 * Open a preview of the publication.
 *
 * @param cliFlags
 * @returns
 */
export async function preview(cliFlags: PreviewCliFlags) {
  setLogLevel(cliFlags.logLevel);

  const stopLogging = startLogging('Collecting preview config');

  const loadedConf = await collectVivliostyleConfig(cliFlags);
  const { vivliostyleConfig, vivliostyleConfigPath } = loadedConf;
  cliFlags = loadedConf.cliFlags;

  const context = vivliostyleConfig
    ? upath.dirname(vivliostyleConfigPath)
    : cwd;

  if (!cliFlags.input && !vivliostyleConfig) {
    // Empty input, open Viewer start page
    cliFlags.input = 'data:,';
  }

  let config = await mergeConfig(
    cliFlags,
    // Only show preview of first entry
    vivliostyleConfig?.[0],
    context,
  );

  logUpdate('Preparing preview');

  // build artifacts
  if (config.manifestPath) {
    await cleanupWorkspace(config);
    await prepareThemeDirectory(config);
    await compile(config);
    await copyAssets(config);
  }

  const { viewerFullUrl } = await prepareServer({
    input: (config.manifestPath ??
      config.webbookEntryUrl ??
      config.epubOpfPath) as string,
    workspaceDir: config.workspaceDir,
    httpServer: config.httpServer,
    viewer: config.viewer,
    viewerParam: config.viewerParam,
    size: config.size,
    cropMarks: config.cropMarks,
    bleed: config.bleed,
    cropOffset: config.cropOffset,
    css: config.css,
    style: config.customStyle,
    userStyle: config.customUserStyle,
    singleDoc: config.singleDoc,
    quick: config.quick,
  });

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

  const watcher = !isUrlString(config.input.entry)
    ? chokidar.watch('**', {
        ignored: (path: string) => {
          if (/^node_modules$|^\.git/.test(upath.basename(path))) {
            return true;
          }
          if (
            !pathEquals(config.entryContextDir, config.workspaceDir) &&
            pathContains(config.workspaceDir, path)
          ) {
            return true; // ignore saved intermediate files
          }
          if (
            config.needToGenerateManifest &&
            pathEquals(path, config.manifestPath)
          ) {
            return true; // ignore generated pub-manifest
          }
          if (
            config.entries.length &&
            /\.(md|markdown|html?|xhtml|xht)$/i.test(path) &&
            !config.entries.some(
              (entry) =>
                (entry.source && pathEquals(path, entry.source)) ||
                (entry.template && pathEquals(path, entry.template.source)),
            )
          ) {
            return true; // ignore md or html files not in entries source
          }
          if (pathContains(config.themesDir, path)) {
            return true; // ignore theme packages
          }
          return false;
        },
        cwd: config.entries.length ? context : config.entryContextDir,
        ignoreInitial: true,
      })
    : null;

  let reload: (() => void) | null = null;
  let closePreview: (() => void) | null = null;
  async function openPreview() {
    closePreview?.();

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

    // Terminate preview when the previewing page is closed
    function onPageClose() {
      watcher?.close();
      runExitHandlers();
    }
    page.on('close', onPageClose);

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

    watcher?.on('all', handleFileChange);
    reload = () => page.reload();
    closePreview = () => {
      watcher?.off('all', handleFileChange);
      page.off('close', onPageClose);
      browser.close();
      reload = null;
      closePreview = null;
    };
  }

  await openPreview();

  // note: runExitHandlers() is not necessary here
  stopLogging('Up and running ([ctrl+c] to quit)', '🚀');

  async function reloadConfig(path: string) {
    const stopLogging = startLogging(
      `Config file change detected. Reloading ${path}`,
    );
    closePreview?.();
    // reload vivliostyle config
    const loadedConf = await collectVivliostyleConfig(cliFlags);
    const { vivliostyleConfig } = loadedConf;
    config = await mergeConfig(cliFlags, vivliostyleConfig?.[0], context);
    // build artifacts
    if (config.manifestPath) {
      await prepareThemeDirectory(config);
      await compile(config);
      await copyAssets(config);
    }
    await openPreview();
    logSuccess(`Reloaded ${path}`);
    stopLogging();
  }

  async function rebuildFile(path: string) {
    const stopLogging = startLogging(`Rebuilding ${path}`);
    // update mergedConfig
    config = await mergeConfig(
      cliFlags,
      vivliostyleConfig?.[0],
      context,
      config,
    );
    // build artifacts
    if (config.manifestPath) {
      await prepareThemeDirectory(config);
      await compile(config);
      await copyAssets(config);
    }
    reload?.();
    logSuccess(`Built ${path}`);
    stopLogging();
  }

  function handleFileChange(event: unknown, path: string) {
    const handleError = (error: Error) => {
      console.log(); // print newline
      gracefulError(error);
    };
    if (
      pathEquals(
        upath.join(config.entryContextDir, path),
        config.input.entry,
      ) ||
      /\.(md|markdown|html?|xhtml|xht|css|jpe?g|png|gif|svg)$/i.test(path)
    ) {
      clearTimeout(timer);
      timer = setTimeout(() => rebuildFile(path).catch(handleError), 2000);
    } else if (
      vivliostyleConfigPath &&
      pathEquals(path, upath.basename(vivliostyleConfigPath))
    ) {
      clearTimeout(timer);
      timer = setTimeout(() => reloadConfig(path).catch(handleError), 0);
    }
  }
}
