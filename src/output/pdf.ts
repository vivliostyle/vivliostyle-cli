import chalk from 'chalk';
import fs from 'node:fs';
import { URL } from 'node:url';
import { Page } from 'playwright-core';
import terminalLink from 'terminal-link';
import {
  checkBrowserAvailability,
  downloadBrowser,
  getFullBrowserName,
  isPlaywrightExecutable,
  launchBrowser,
} from '../browser.js';
import {
  collectVolumeArgs,
  runContainer,
  toContainerPath,
} from '../container.js';
import { Meta, Payload, TOCItem } from '../global-viewer.js';
import { ManuscriptEntry, MergedConfig } from '../input/config.js';
import { prepareServer } from '../server.js';
import {
  checkContainerEnvironment,
  debug,
  logError,
  logInfo,
  logSuccess,
  logUpdate,
  pathEquals,
  startLogging,
  upath,
} from '../util.js';
import type { PdfOutput } from './output-types.js';
import { PageSizeData, PostProcess } from './pdf-postprocess.js';

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
      upath.dirname(option.target.path),
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
  cropMarks,
  bleed,
  cropOffset,
  css,
  customStyle,
  customUserStyle,
  singleDoc,
  executableBrowser,
  proxy,
  browserType,
  image,
  sandbox,
  timeout,
  entryContextDir,
  entries,
  httpServer,
  viewer,
  viewerParam,
  logLevel,
  ignoreHttpsErrors,
}: BuildPdfOptions): Promise<string | null> {
  const isInContainer = checkContainerEnvironment();
  logUpdate(`Launching build environment`);

  const { viewerFullUrl } = await prepareServer({
    input,
    workspaceDir,
    httpServer,
    viewer,
    viewerParam,
    size,
    cropMarks,
    bleed,
    cropOffset,
    css,
    style: customStyle,
    userStyle: customUserStyle,
    singleDoc,
    quick: false,
  });
  debug('viewerFullUrl', viewerFullUrl);

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
    headless: true,
    noSandbox: !sandbox,
    disableWebSecurity: !viewer,
    disableDevShmUsage: isInContainer,
  });
  const browserName = getFullBrowserName(browserType);
  const browserVersion = `${browserName}/${await browser.version()}`;
  debug(chalk.green('success'), `browserVersion=${browserVersion}`);

  logUpdate('Building pages');

  const page = await browser.newPage({
    // This viewport size important to detect headless environment in Vivliostyle viewer
    // https://github.com/vivliostyle/vivliostyle.js/blob/73bcf323adcad80126b0175630609451ccd09d8a/packages/core/src/vivliostyle/vgen.ts#L2489-L2500
    viewport: {
      width: 800,
      height: 600,
    },
    ignoreHTTPSErrors: ignoreHttpsErrors,
  });

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
    if (logLevel === 'silent' || logLevel === 'info') {
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
      upath.relative(entryContextDir, entry.source),
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
        ? pathEquals(entry.target, url.pathname)
        : pathEquals(
            upath.relative(workspaceDir, entry.target),
            url.pathname.substring(1),
          );
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
      chalk.gray('viewer:response'),
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

  let remainTime = timeout;
  const startTime = Date.now();

  await page.setDefaultTimeout(timeout);
  await page.goto(viewerFullUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.coreViewer);

  await page.emulateMedia({ media: 'print' });
  await page.waitForFunction(
    /* v8 ignore next */
    () => window.coreViewer.readyState === 'complete',
    undefined,
    { polling: 1000 },
  );

  if (lastEntry) {
    logSuccess(stringifyEntry(lastEntry));
  }

  const pageProgression = await page.evaluate(() =>
    /* v8 ignore next 5 */
    document
      .querySelector('#vivliostyle-viewer-viewport')
      ?.getAttribute('data-vivliostyle-page-progression') === 'rtl'
      ? 'rtl'
      : 'ltr',
  );
  const viewerCoreVersion = await page.evaluate(() =>
    /* v8 ignore next 3 */
    document
      .querySelector('#vivliostyle-menu_settings .version')
      ?.textContent?.replace(/^.*?: (\d[-+.\w]+).*$/, '$1'),
  );
  const metadata = await loadMetadata(page);
  const toc = await loadTOC(page);
  const pageSizeData = await loadPageSizeData(page);

  remainTime -= Date.now() - startTime;
  if (remainTime <= 0) {
    throw new Error('Typesetting process timed out');
  }
  debug('Remaining timeout:', remainTime);

  logUpdate('Building PDF');

  const pdf = await page.pdf({
    margin: {
      top: 0,
      bottom: 0,
      right: 0,
      left: 0,
    },
    printBackground: true,
    preferCSSPageSize: true,
    // timeout: remainTime,
  });

  await browser.close();

  logUpdate('Processing PDF');
  fs.mkdirSync(upath.dirname(target.path), { recursive: true });

  const post = await PostProcess.load(pdf);
  await post.metadata(metadata, {
    pageProgression,
    browserVersion,
    viewerCoreVersion,
    // If custom viewer is set and its version info is not available,
    // there is no guarantee that the default creator option is correct.
    disableCreatorOption: !!viewer && !viewerCoreVersion,
  });
  await post.toc(toc);
  await post.setPageBoxes(pageSizeData);
  await post.save(target.path, {
    preflight: target.preflight,
    preflightOption: target.preflightOption,
    image,
  });

  return target.path;
}

async function loadMetadata(page: Page): Promise<Meta> {
  return page.evaluate(() => window.coreViewer.getMetadata());
}

// Show and hide the TOC in order to read its contents.
// Chromium needs to see the TOC links in the DOM to add
// the PDF destinations used during postprocessing.
async function loadTOC(page: Page): Promise<TOCItem[]> {
  /* v8 ignore start */
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
  /* v8 ignore stop */
}

async function loadPageSizeData(page: Page): Promise<PageSizeData[]> {
  /* v8 ignore start */
  return page.evaluate(() => {
    const sizeData: PageSizeData[] = [];
    const pageContainers = document.querySelectorAll(
      '#vivliostyle-viewer-viewport > div > div > div[data-vivliostyle-page-container]',
    ) as NodeListOf<HTMLElement>;

    for (const pageContainer of pageContainers) {
      const bleedBox = pageContainer.querySelector(
        'div[data-vivliostyle-bleed-box]',
      ) as HTMLElement;
      sizeData.push({
        mediaWidth: parseFloat(pageContainer.style.width) * 0.75,
        mediaHeight: parseFloat(pageContainer.style.height) * 0.75,
        bleedOffset: parseFloat(bleedBox?.style.left) * 0.75,
        bleedSize: parseFloat(bleedBox?.style.paddingLeft) * 0.75,
      });
    }
    return sizeData;
  });
  /* v8 ignore stop */
}
