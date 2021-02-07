import chokidar from 'chokidar';
import puppeteer from 'puppeteer';
import path from 'upath';
import { compile, copyAssets } from '../builder';
import { collectVivliostyleConfig, mergeConfig } from '../config';
import { getBrokerUrl } from '../server';
import {
  debug,
  gracefulError,
  launchBrowser,
  logSuccess,
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
    ? path.dirname(vivliostyleConfigPath)
    : process.cwd();

  const config = await mergeConfig(cliFlags, vivliostyleConfig, context);

  // build artifacts
  if (config.manifestPath) {
    await compile(config);
    await copyAssets(config);
  }

  const url = getBrokerUrl({
    sourceIndex: (config.manifestPath ??
      config.webbookEntryPath ??
      config.epubOpfPath) as string,
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
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 0, height: 0 });
  await page.goto(url);

  stopLogging('Up and running ([ctrl+c] to quit)', '🚀');

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

  chokidar
    .watch('**', {
      ignored: (p: string) => {
        return (
          /node_modules|\.git/.test(p) || p.startsWith(config.workspaceDir)
        );
      },
      cwd: context,
    })
    .on('all', (event, path) => {
      if (!/\.(md|markdown|html?|css|jpe?g|png|gif|svg)$/i.test(path)) return;
      handleChangeEvent(path);
    });
}
