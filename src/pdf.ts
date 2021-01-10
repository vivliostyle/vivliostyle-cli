import chalk from 'chalk';
import puppeteer from 'puppeteer';
import shelljs from 'shelljs';
import terminalLink from 'terminal-link';
import path from 'upath';
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
} from './util';

export type BuildPdfOptions = Omit<MergedConfig, 'outputs'> & {
  input: string;
  output: string;
};

export async function buildPDF({
  input,
  output,
  workspaceDir,
  size,
  executableChromium,
  sandbox,
  verbose,
  timeout,
  pressReady,
  entryContextDir,
  entries,
}: BuildPdfOptions) {
  logUpdate(`Launching build environment`);
  const root = workspaceDir;

  const sourceIndex = await findEntryPointFile(input, root);

  const outputSize = size;

  const [source, broker] = await launchSourceAndBrokerServer(root);
  const sourcePort = source.port;
  const brokerPort = broker.port;

  const navigateURL = getBrokerUrl({
    sourcePort,
    sourceIndex,
    brokerPort,
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
      path.relative(entryContextDir, entry.source),
    );
    return `${terminalLink(formattedSourcePath, 'file://' + entry.source, {
      fallback: () => formattedSourcePath,
    })} ${entry.title ? chalk.gray(entry.title) : ''}`;
  }

  function handleEntry(response: puppeteer.Response) {
    const entry = entries.find(
      (entry) =>
        path.relative(workspaceDir, entry.target) ===
        url.parse(response.url()).pathname!.substring(1),
    );
    if (entry) {
      if (!lastEntry) {
        lastEntry = entry;
        return logUpdate(stringifyEntry(entry));
      }
      logSuccess(stringifyEntry(lastEntry));
      startLogging(stringifyEntry(entry));
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

    logError(chalk.red(`${response.status()}`, response.url()));
    startLogging();
    // debug(chalk.red(`${response.status()}`, response.url()));
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

  logSuccess(stringifyEntry(lastEntry!));
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

  await browser.close();

  logUpdate('Processing PDF');
  shelljs.mkdir('-p', path.dirname(output));

  const post = await PostProcess.load(pdf);
  await post.metadata(metadata);
  await post.toc(toc);
  await post.save(output, { pressReady });

  return output;
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
