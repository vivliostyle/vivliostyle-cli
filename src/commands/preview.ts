import path from 'path';
import program from 'commander';
import puppeteer from 'puppeteer';
import chokidar from 'chokidar';

import { getBrokerUrl, launchSourceAndBrokerServer, LoadMode } from '../server';
import { debug, launchBrowser, gracefulError } from '../util';
import {
  getVivliostyleConfigPath,
  collectVivliostyleConfig,
  ParsedTheme,
  Entry,
  mergeConfig,
} from '../config';
import { buildArtifacts } from '../builder';

export interface PreviewOption {
  configPath?: string;
  input: string;
  rootDir?: string;
  sandbox?: boolean;
  executableChromium?: string;
}

program
  .name('vivliostyle preview')
  .description('launch preview server')
  .arguments('<input>')
  .option('-c, --config <config_file>', 'path to vivliostyle.config.js')
  .option(
    '-r, --root <root_directory>',
    `specify assets root path (default directory of input file)`,
  )
  .option(
    '--no-sandbox',
    `launch chrome without sandbox (use this option to avoid ECONNREFUSED error)`,
  )
  .option(
    '--executable-chromium <path>',
    'specify a path of executable Chrome(Chromium) you installed',
  )
  .parse(process.argv);

let timer: NodeJS.Timeout;

preview({
  configPath: program.config,
  rootDir: program.root,
  input: program.args?.[0] || program.input,
  sandbox: program.sandbox,
  executableChromium: program.executableChromium,
}).catch(gracefulError);

export default async function preview(cliFlags: PreviewOption) {
  const vivliostyleConfigPath = getVivliostyleConfigPath(cliFlags.configPath);
  const vivliostyleConfig = collectVivliostyleConfig(vivliostyleConfigPath);

  const context = vivliostyleConfig
    ? path.dirname(vivliostyleConfigPath)
    : process.cwd();

  const {
    contextDir,
    distDir,
    artifactDir,
    projectTitle,
    projectAuthor,
    rawEntries,
    themeIndex,
    language,
    toc,
    loadMode,
    sandbox,
    executableChromium,
  }: {
    contextDir: string;
    artifactDir: string;
    projectTitle: any;
    themeIndex: ParsedTheme[];
    rawEntries: (string | Entry)[];
    distDir: string;
    projectAuthor: any;
    language: string;
    toc: string | boolean;
    outFile: string;
    size: string | number | undefined;
    pressReady: boolean;
    verbose: boolean;
    timeout: number;
    loadMode: LoadMode;
    sandbox: boolean;
    executableChromium: string | undefined;
  } = await mergeConfig(cliFlags, vivliostyleConfig, context);

  // build artifacts
  const manifestPath = buildArtifacts({
    contextDir,
    distDir,
    artifactDir,
    rawEntries,
    toc,
    themeIndex,
    projectTitle,
    projectAuthor,
    language,
  });

  const [source, broker] = await launchSourceAndBrokerServer(distDir);
  const sourcePort = source.port;
  const brokerPort = broker.port;
  const url = getBrokerUrl({
    sourceIndex: path.relative(distDir, manifestPath),
    sourcePort,
    brokerPort,
    loadMode,
  });

  debug(url);
  console.log(`🚀 Launching preview ...`);
  debug(
    `Executing Chromium path: ${
      executableChromium || puppeteer.executablePath()
    }`,
  );
  const browser = await launchBrowser({
    headless: false,
    executablePath: executableChromium || puppeteer.executablePath(),
    args: [sandbox ? '' : '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 0, height: 0 });
  await page.goto(url);

  function handleChangeEvent() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log('Rebuilding ...');
      // build artifacts
      buildArtifacts({
        contextDir,
        distDir,
        artifactDir,
        rawEntries,
        toc,
        themeIndex,
        projectTitle,
        projectAuthor,
        language,
      });
      page.reload();
    }, 2000);
  }

  chokidar
    .watch('**', {
      ignored: (p: string) => {
        return /node_modules|\.git/.test(p) || p.startsWith(distDir);
      },
      cwd: context,
    })
    .on('all', (event, path) => {
      if (!/\.(md|markdown|html?|css|jpe?g|png|gif|svg)$/i.test(path)) return;
      handleChangeEvent();
    });
}
