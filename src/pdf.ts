import chalk from 'chalk';
import shelljs from 'shelljs';
import terminalLink from 'terminal-link';
import path from 'upath';
import { URL } from 'url';
import { Meta, Payload, TOCItem } from './broker';
import { ManuscriptEntry, MergedConfig } from './config';
import { PostProcess } from './postprocess';
import { getBrokerUrl } from './server';
import {
  debug,
  launchBrowser,
  logError,
  logInfo,
  logSuccess,
  logUpdate,
  startLogging,
} from './util';

type PuppeteerPage = Resolved<
  ReturnType<Resolved<ReturnType<typeof launchBrowser>>['newPage']>
>;

export type BuildPdfOptions = Omit<MergedConfig, 'outputs' | 'input'> & {
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

  const navigateURL = getBrokerUrl({
    sourceIndex: input,
    outputSize: size,
  });
  debug('brokerURL', navigateURL);

  debug(`Executing Chromium path: ${executableChromium}`);
  const browser = await launchBrowser({
    headless: true,
    executablePath: executableChromium,
    // Why `--no-sandbox` flag? Running Chrome as root without --no-sandbox is not supported. See https://crbug.com/638180.
    args: ['--allow-file-access-from-files', sandbox ? '' : '--no-sandbox'],
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

  let lastEntry: ManuscriptEntry | undefined;

  function stringifyEntry(entry: ManuscriptEntry) {
    const formattedSourcePath = chalk.bold.cyan(
      path.relative(entryContextDir, entry.source),
    );
    return `${terminalLink(formattedSourcePath, 'file://' + entry.source, {
      fallback: () => formattedSourcePath,
    })} ${entry.title ? chalk.gray(entry.title) : ''}`;
  }

  function handleEntry(response: any) {
    const entry = entries.find((entry): entry is ManuscriptEntry => {
      if (!('source' in entry)) {
        return false;
      }
      const url = new URL(response.url());
      return url.protocol === 'file:'
        ? entry.target === url.pathname
        : path.relative(workspaceDir, entry.target) ===
            url.pathname.substring(1);
    });
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
    // file protocol doesn't have status code
    if (response.url().startsWith('file://') && response.ok()) return;

    logError(chalk.red(`${response.status()}`, response.url()));
    startLogging();
    // debug(chalk.red(`${response.status()}`, response.url()));
  });

  await page.goto(navigateURL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.coreViewer);

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

  if (lastEntry) {
    logSuccess(stringifyEntry(lastEntry));
  }
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

async function loadMetadata(page: PuppeteerPage): Promise<Meta> {
  return page.evaluate(() => window.coreViewer.getMetadata());
}

// Show and hide the TOC in order to read its contents.
// Chromium needs to see the TOC links in the DOM to add
// the PDF destinations used during postprocessing.
async function loadTOC(page: PuppeteerPage): Promise<TOCItem[]> {
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
