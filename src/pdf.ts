import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import shelljs from 'shelljs';
import terminalLink from 'terminal-link';
import url from 'url';
import { Meta, Payload, TOCItem } from './broker';
import { MergedConfig, ParsedEntry } from './config';
import { PostProcess } from './postprocess';
import { getBrokerUrl, launchSourceAndBrokerServer } from './server';
import {
  debug,
  findEntryPointFile,
  launchBrowser,
  logError,
  logInfo,
  logSuccess,
  logUpdate,
  startLogging,
  statFile,
} from './util';

export interface BuildPdfOptions extends MergedConfig {
  input: string;
  entries: ParsedEntry[];
}

export async function buildPDF({
  input,
  distDir,
  outputPath,
  size,
  loadMode,
  executableChromium,
  sandbox,
  verbose,
  timeout,
  pressReady,
  entryContextDir,
  entries,
}: BuildPdfOptions) {
  logUpdate(`Launching build environment`);
  const stat = await statFile(input);
  const root = distDir || (stat.isDirectory() ? input : path.dirname(input));

  const sourceIndex = await findEntryPointFile(input, root);

  const outputFile =
    fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()
      ? path.resolve(outputPath, 'output.pdf')
      : outputPath;
  const outputSize = size;

  const [source, broker] = await launchSourceAndBrokerServer(root);
  const sourcePort = source.port;
  const brokerPort = broker.port;

  const navigateURL = getBrokerUrl({
    sourcePort,
    sourceIndex,
    brokerPort,
    loadMode,
    outputSize,
  });
  debug('brokerURL', navigateURL);

  debug(`Executing Chromium path: ${executableChromium}`);
  const browser = await launchBrowser({
    headless: true,
    executablePath: executableChromium,
    // Why `--no-sandbox` flag? Running Chrome as root without --no-sandbox is not supported. See https://crbug.com/638180.
    args: [sandbox ? '' : '--no-sandbox'],
  });
  const version = await browser.version();
  debug(chalk.green('success'), `version=${version}`);

  logUpdate('Building pages');

  const page = await browser.newPage();

  page.on('pageerror', (error) => {
    logError(chalk.red(error.message));
  });

  page.on('console', (msg) => {
    if (/time slice/.test(msg.text())) return;
    if (!verbose) return;
    logInfo(msg.text());
  });

  let lastEntry: ParsedEntry | undefined;

  function stringifyEntry(entry: ParsedEntry) {
    const formattedSourcePath = chalk.bold.cyan(
      path.relative(entryContextDir, entry.source.path),
    );
    return `${terminalLink(formattedSourcePath, 'file://' + entry.source.path, {
      fallback: () => formattedSourcePath,
    })} ${entry.title ? chalk.gray(entry.title) : ''}`;
  }

  const building = (e: ParsedEntry) => `${stringifyEntry(e)}`;
  const built = (e: ParsedEntry) => `${stringifyEntry(e)}`;

  function handleEntry(response: puppeteer.Response) {
    const entry = entries.find(
      (entry) =>
        path.relative(distDir, entry.target.path) ===
        url.parse(response.url()).pathname!.substring(1),
    );
    if (entry) {
      if (!lastEntry) {
        lastEntry = entry;
        return logUpdate(building(entry));
      }
      logSuccess(built(lastEntry));
      startLogging(building(entry));
      lastEntry = entry;
    }
  }

  page.on('response', (response) => {
    debug(
      chalk.gray('broker:response'),
      chalk.green(response.status().toString()),
      response.url(),
    );

    handleEntry(response);

    if (300 > response.status() && 200 <= response.status()) return;

    // NOTE: suppress unwanted 404 message
    // logError(chalk.red(`${response.status()}`, response.url()));
    debug(chalk.red(`${response.status()}`, response.url()));
  });

  await page.goto(navigateURL, { waitUntil: 'networkidle0' });
  await page.waitFor(() => !!window.coreViewer);

  const metadata = await loadMetadata(page);
  const toc = await loadTOC(page);

  await page.emulateMediaType('print');
  await page.waitForFunction(
    () => window.coreViewer.readyState === 'complete',
    {
      polling: 1000,
      timeout,
    },
  );

  logSuccess(built(lastEntry!));
  startLogging('Building PDF');

  const pdf = await page.pdf({
    margin: {
      top: 0,
      bottom: 0,
      right: 0,
      left: 0,
    },
    printBackground: true,
    preferCSSPageSize: true,
  });

  logUpdate('Processing PDF');

  await browser.close();
  debug(path.dirname(outputFile));
  shelljs.mkdir('-p', path.dirname(outputFile));

  const post = await PostProcess.load(pdf);
  await post.metadata(metadata);
  await post.toc(toc);
  await post.save(outputFile, { pressReady });

  return outputFile;
}

async function loadMetadata(page: puppeteer.Page): Promise<Meta> {
  return page.evaluate(() => window.coreViewer.getMetadata());
}

// Show and hide the TOC in order to read its contents.
// Chromium needs to see the TOC links in the DOM to add
// the PDF destinations used during postprocessing.
async function loadTOC(page: puppeteer.Page): Promise<TOCItem[]> {
  return page.evaluate(
    () =>
      new Promise<TOCItem[]>((resolve) => {
        function listener(payload: Payload) {
          if (payload.a !== 'toc') {
            return;
          }
          window.coreViewer.removeListener('done', listener);
          window.coreViewer.showTOC(false);
          resolve(window.coreViewer.getTOC());
        }
        window.coreViewer.addListener('done', listener);
        window.coreViewer.showTOC(true);
      }),
  );
}
