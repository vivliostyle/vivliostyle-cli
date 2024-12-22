import chalk from 'chalk';
import fs from 'node:fs';
import { URL } from 'node:url';
import { Page } from 'playwright-core';
import terminalLink from 'terminal-link';
import upath from 'upath';
import { getFullBrowserName, launchPreview } from '../browser.js';
import {
  ManuscriptEntry,
  PdfOutput,
  ResolvedTaskConfig,
} from '../config/resolve.js';
import { Meta, Payload, TOCItem } from '../global-viewer.js';
import { getViewerFullUrl } from '../server.js';
import {
  debug,
  logError,
  logInfo,
  logSuccess,
  logUpdate,
  pathEquals,
  startLogging,
} from '../util.js';
import { PageSizeData, PostProcess } from './pdf-postprocess.js';

export async function buildPDF({
  target,
  config,
}: {
  target: PdfOutput;
  config: ResolvedTaskConfig;
}): Promise<string | null> {
  logUpdate(`Launching build environment`);

  const viewerFullUrl = getViewerFullUrl(config);
  debug('viewerFullUrl', viewerFullUrl);

  let lastEntry: ManuscriptEntry | undefined;

  function stringifyEntry(entry: ManuscriptEntry) {
    const formattedSourcePath = chalk.bold.cyan(
      entry.source.type === 'file'
        ? upath.relative(config.entryContextDir, entry.source.pathname)
        : entry.source.href,
    );
    return `${terminalLink(
      formattedSourcePath,
      entry.source.type === 'file'
        ? `file://${entry.source.pathname}`
        : entry.source.href,
      {
        fallback: () => formattedSourcePath,
      },
    )} ${entry.title ? chalk.gray(entry.title) : ''}`;
  }

  function handleEntry(response: any) {
    const entry = config.entries.find((entry): entry is ManuscriptEntry => {
      if (!('source' in entry)) {
        return false;
      }
      const url = new URL(response.url());
      return url.protocol === 'file:'
        ? pathEquals(entry.target, url.pathname)
        : pathEquals(
            upath.relative(config.workspaceDir, entry.target),
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

  const { browser, page } = await launchPreview({
    mode: 'build',
    url: viewerFullUrl,
    config,
    onBrowserOpen: () => {
      logUpdate('Building pages');
    },
    onPageOpen: async (page) => {
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
        if (config.logLevel === 'silent' || config.logLevel === 'info') {
          return;
        }
        if (msg.type() === 'error') {
          logError(msg.text());
        } else {
          logInfo(msg.text());
        }
      });

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
      });

      await page.setDefaultTimeout(config.timeout);
    },
  });

  const browserName = getFullBrowserName(config.browserType);
  const browserVersion = `${browserName}/${await browser.version()}`;
  debug(chalk.green('success'), `browserVersion=${browserVersion}`);

  let remainTime = config.timeout;
  const startTime = Date.now();

  await page.waitForLoadState('networkidle');
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
    tagged: true,
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
    disableCreatorOption: !!config.viewer && !viewerCoreVersion,
  });
  await post.toc(toc);
  await post.setPageBoxes(pageSizeData);
  await post.save(target.path, {
    preflight: target.preflight,
    preflightOption: target.preflightOption,
    image: config.image,
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
