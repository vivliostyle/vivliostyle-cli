import chokidar from 'chokidar';
import upath from 'upath';
import {
  checkBrowserAvailability,
  downloadBrowser,
  isPlaywrightExecutable,
  launchBrowser,
} from './browser';
import { compile, copyAssets } from './builder';
import { CliFlags, collectVivliostyleConfig, mergeConfig } from './config';
import { prepareServer } from './server';
import {
  cwd,
  debug,
  isUrlString,
  logSuccess,
  pathStartsWith,
  startLogging,
  stopLogging,
} from './util';

let timer: NodeJS.Timeout;

export interface PreviewCliFlags extends CliFlags {}

export async function preview(cliFlags: PreviewCliFlags) {
  startLogging('Collecting preview config');

  const loadedConf = collectVivliostyleConfig(cliFlags);
  const { vivliostyleConfig, vivliostyleConfigPath } = loadedConf;
  cliFlags = loadedConf.cliFlags;

  const context = vivliostyleConfig
    ? upath.dirname(vivliostyleConfigPath)
    : cwd;

  let config = await mergeConfig(
    cliFlags,
    // Only show preview of first entry
    vivliostyleConfig?.[0],
    context,
  );

  startLogging('Preparing preview');

  // build artifacts
  if (config.manifestPath) {
    await compile(config);
    await copyAssets(config);
  }

  const { viewerFullUrl } = await prepareServer({
    input: (config.manifestPath ??
      config.webbookEntryPath ??
      config.epubOpfPath) as string,
    workspaceDir: config.workspaceDir,
    httpServer: config.httpServer,
    viewer: config.viewer,
    size: config.size,
    style: config.customStyle,
    userStyle: config.customUserStyle,
    singleDoc: config.singleDoc,
    quick: config.quick,
  });

  const { browserType, executableBrowserPath } = config;
  debug(`Executing browser path: ${executableBrowserPath}`);
  if (!checkBrowserAvailability(executableBrowserPath)) {
    if (isPlaywrightExecutable(executableBrowserPath)) {
      // The browser isn't downloaded first time starting CLI so try to download it
      await downloadBrowser(browserType);
    } else {
      // executableBrowserPath seems to be specified explicitly
      throw new Error(
        `Cannot find the browser. Please check the executable browser path: ${executableBrowserPath}`,
      );
    }
  }
  const browser = await launchBrowser({
    browserType,
    executablePath: executableBrowserPath,
    headless: false,
    noSandbox: !config.sandbox,
    disableWebSecurity: !config.viewer,
  });
  const page = await browser.newPage();
  await page.goto(viewerFullUrl);

  stopLogging('Up and running ([ctrl+c] to quit)', '🚀');

  function reloadConfig(path: string) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      startLogging(`Config file change detected. Reloading ${path}`);
      // reload vivliostyle config
      const loadedConf = collectVivliostyleConfig(cliFlags);
      const { vivliostyleConfig } = loadedConf;
      config = await mergeConfig(cliFlags, vivliostyleConfig?.[0], context);
      // build artifacts
      if (config.manifestPath) {
        await compile(config, { reload: true });
        await copyAssets(config);
      }
      page.reload();
      logSuccess(`Reloaded ${path}`);
    }, 2000);
  }

  function handleChangeEvent(path: string) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      startLogging(`Rebuilding ${path}`);
      // build artifacts
      if (config.manifestPath) {
        await compile(config, { reload: true });
        await copyAssets(config);
      }
      page.reload();
      logSuccess(`Built ${path}`);
    }, 2000);
  }

  if (isUrlString(config.input.entry)) {
    return;
  }

  chokidar
    .watch('**', {
      ignored: (path: string) => {
        if (/^node_modules$|^\.git/.test(upath.basename(path))) {
          return true;
        }
        if (
          config.entryContextDir !== config.workspaceDir &&
          pathStartsWith(path, config.workspaceDir)
        ) {
          return true; // ignore saved intermediate files
        }
        if (config.manifestAutoGenerate && path === config.manifestPath) {
          return true; // ignore generated pub-manifest
        }
        if (
          config.entries.length &&
          /\.(md|markdown|html?|xhtml|xht)$/i.test(path) &&
          !config.entries.find(
            (entry) => path === (entry as { source: string }).source,
          )
        ) {
          return true; // ignore md or html files not in entries source
        }
        if (
          config.themeIndexes.find(
            (theme) =>
              (theme.type === 'file' || theme.type === 'package') &&
              theme.destination !== theme.location &&
              (theme.type === 'file'
                ? path === theme.destination
                : pathStartsWith(path, theme.destination)),
          )
        ) {
          return true; // ignore copied theme files
        }
        return false;
      },
      cwd: config.entries.length ? context : config.entryContextDir,
      ignoreInitial: true,
    })
    .on('all', (event, path) => {
      if (
        upath.join(config.entryContextDir, path) === config.input.entry ||
        /\.(md|markdown|html?|xhtml|xht|css|jpe?g|png|gif|svg)$/i.test(path)
      ) {
        handleChangeEvent(path);
      } else if (path === upath.basename(vivliostyleConfigPath)) {
        reloadConfig(path);
      }
    });
}
