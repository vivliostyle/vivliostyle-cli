import chokidar from 'chokidar';
import puppeteer from 'puppeteer';
import upath from 'upath';
import { compile, copyAssets } from '../builder';
import { collectVivliostyleConfig, mergeConfig } from '../config';
import { getBrokerUrl } from '../server';
import {
  cwd,
  debug,
  gracefulError,
  isUrlString,
  launchBrowser,
  logSuccess,
  pathStartsWith,
  startLogging,
  stopLogging,
} from '../util';
import { PreviewCliFlags, setupPreviewParserProgram } from './preview.parser';

let timer: NodeJS.Timeout;

try {
  const program = setupPreviewParserProgram();
  program.parse(process.argv);
  const options = program.opts();
  preview({
    input: program.args?.[0],
    configPath: options.config,
    theme: options.theme,
    size: options.size,
    style: options.style,
    userStyle: options.userStyle,
    singleDoc: options.singleDoc,
    quick: options.quick,
    title: options.title,
    author: options.author,
    language: options.language,
    verbose: options.verbose,
    timeout: options.timeout,
    sandbox: options.sandbox,
    executableChromium: options.executableChromium,
  }).catch(gracefulError);
} catch (err) {
  gracefulError(err);
}

export default async function preview(cliFlags: PreviewCliFlags) {
  startLogging('Preparing preview');

  const loadedConf = collectVivliostyleConfig(cliFlags);
  const { vivliostyleConfig, vivliostyleConfigPath } = loadedConf;
  cliFlags = loadedConf.cliFlags;

  const context = vivliostyleConfig
    ? upath.dirname(vivliostyleConfigPath)
    : cwd;

  let config = await mergeConfig(cliFlags, vivliostyleConfig, context);

  // build artifacts
  if (config.manifestPath) {
    await compile(config);
    await copyAssets(config);
  }

  const url = getBrokerUrl({
    sourceIndex: (config.manifestPath ??
      config.webbookEntryPath ??
      config.epubOpfPath) as string,
    outputSize: config.size,
    style: config.customStyle,
    userStyle: config.customUserStyle,
    singleDoc: config.singleDoc,
    quick: config.quick,
  });

  debug(
    `Executing Chromium path: ${
      config.executableChromium || puppeteer.executablePath()
    }`,
  );
  const browser = await launchBrowser({
    headless: false,
    executablePath: config.executableChromium || puppeteer.executablePath(),
    args: [
      '--allow-file-access-from-files',
      config.sandbox ? '' : '--no-sandbox',
      '--disable-web-security',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 0, height: 0 });
  await page.goto(url);

  stopLogging('Up and running ([ctrl+c] to quit)', '🚀');

  function reloadConfig(path: string) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      startLogging(`Config file change detected. Reloading ${path}`);
      // reload vivliostyle config
      const loadedConf = collectVivliostyleConfig(cliFlags);
      const { vivliostyleConfig } = loadedConf;
      config = await mergeConfig(cliFlags, vivliostyleConfig, context);
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
