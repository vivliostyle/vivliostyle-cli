import chalk from 'chalk';
import shelljs from 'shelljs';
import terminalLink from 'terminal-link';
import path from 'upath';
import { URL } from 'url';
import { Meta, Payload, TOCItem } from './broker';
import {
  checkBrowserAvailability,
  downloadBrowser,
  launchBrowser,
} from './browser';
import { ManuscriptEntry, MergedConfig } from './config';
import {
  checkContainerEnvironment,
  collectVolumeArgs,
  runContainer,
  toContainerPath,
} from './container';
import { PdfOutput } from './output';
import { PostProcess } from './postprocess';
import { getBrokerUrl } from './server';
import {
  debug,
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
  target: PdfOutput;
};

export async function buildPDFWithContainer(
  option: BuildPdfOptions,
): Promise<string | null> {
  const bypassedOption = {
    ...option,
    input: toContainerPath(option.input),
    target: {
      ...option.target,
      path: toContainerPath(option.target.path),
    },
    entryContextDir: toContainerPath(option.entryContextDir),
    workspaceDir: toContainerPath(option.workspaceDir),
    customStyle: option.customStyle && toContainerPath(option.customStyle),
    customUserStyle:
      option.customUserStyle && toContainerPath(option.customUserStyle),
    sandbox: false,
  };

  await runContainer({
    image: option.image,
    userVolumeArgs: collectVolumeArgs([
      option.workspaceDir,
      path.dirname(option.target.path),
    ]),
    commandArgs: [
      'build',
      '--bypassed-pdf-builder-option',
      JSON.stringify(bypassedOption),
    ],
  });

  return option.target.path;
}

export async function buildPDF({
  input,
  target,
  workspaceDir,
  size,
  customStyle,
  customUserStyle,
  singleDoc,
  executableChromium,
  image,
  sandbox,
  verbose,
  timeout,
  entryContextDir,
  entries,
}: BuildPdfOptions): Promise<string | null> {
  const isInContainer = checkContainerEnvironment();
  logUpdate(`Launching build environment`);

  const navigateURL = getBrokerUrl({
    sourceIndex: input,
    outputSize: size,
    style: customStyle,
    userStyle: customUserStyle,
    singleDoc,
    quick: false,
  });
  debug('brokerURL', navigateURL);

  debug(`Executing Chromium path: ${executableChromium}`);
  if (!checkBrowserAvailability(executableChromium)) {
    const puppeteerDir = path.dirname(
      require.resolve('puppeteer-core/package.json'),
    );
    if (!path.relative(puppeteerDir, executableChromium).startsWith('..')) {
      // The browser on puppeteer-core isn't downloaded first time starting CLI so try to download it
      await downloadBrowser();
    } else {
      // executableChromium seems to be specified explicitly
      throw new Error(
        `Cannot find the browser. Please check the executable chromium path: ${executableChromium}`,
      );
    }
  }
  const browser = await launchBrowser({
    headless: true,
    executablePath: executableChromium,
    args: [
      '--allow-file-access-from-files',
      // FIXME: We seem have to disable sandbox now
      // https://github.com/vivliostyle/vivliostyle-cli/issues/186
      sandbox ? '' : '--no-sandbox',
      '--disable-web-security',
      isInContainer ? '--disable-dev-shm-usage' : '',
    ],
  });
  const version = await browser.version();
  debug(chalk.green('success'), `version=${version}`);

  logUpdate('Building pages');

  // FIXME: This issue was reported but all workaround didn't fix
  // https://github.com/puppeteer/puppeteer/issues/4039
  await new Promise((res) => setTimeout(res, 1000));
  const page = await browser.newPage();

  page.on('pageerror', (error) => {
    logError(chalk.red(error.message));
  });

  page.on('console', (msg) => {
    switch (msg.type()) {
      case 'error':
        if (/\/vivliostyle-viewer\.js$/.test(msg.location().url ?? '')) {
          logError(msg.text());
          throw msg.text();
        }
        return;
      case 'debug':
        if (/time slice/.test(msg.text())) {
          return;
        }
        break;
    }
    if (!verbose) {
      return;
    }
    if (msg.type() === 'error') {
      logError(msg.text());
    } else {
      logInfo(msg.text());
    }
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

  await page.setDefaultNavigationTimeout(timeout);
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
  shelljs.mkdir('-p', path.dirname(target.path));

  const post = await PostProcess.load(pdf);
  await post.metadata(metadata);
  await post.toc(toc);
  await post.save(target.path, {
    preflight: target.preflight,
    preflightOption: target.preflightOption,
    image,
  });

  return target.path;
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
