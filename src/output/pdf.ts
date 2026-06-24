import fs from 'node:fs';
import { URL } from 'node:url';

import type { Browser, HTTPResponse, Page } from 'puppeteer-core';
import terminalLink from 'terminal-link';
import upath from 'upath';
import { cyan, gray, green, red } from 'yoctocolors';

import { launchPreview, runBrowserOperationWithAbort } from '../browser.js';
import type {
  ManuscriptEntry,
  PdfOutput,
  ResolvedTaskConfig,
} from '../config/resolve.js';
import type { CmykMap, Meta, Payload, TOCItem } from '../global-viewer.js';
import { Logger } from '../logger.js';
import { getViewerFullUrl } from '../server.js';
import { pathEquals, toError } from '../util.js';
import { type PageSizeData, PostProcess } from './pdf-postprocess.js';

export async function buildPDF({
  target,
  config,
  signal,
}: {
  target: PdfOutput;
  config: ResolvedTaskConfig;
  signal?: AbortSignal;
}): Promise<string | null> {
  Logger.logUpdate(`Launching PDF build environment`);

  const viewerFullUrl = await getViewerFullUrl(config);
  Logger.debug('viewerFullUrl', viewerFullUrl);

  let lastEntry: ManuscriptEntry | undefined;

  function stringifyEntry(entry: ManuscriptEntry) {
    const formattedSourcePath = cyan(
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
    )} ${entry.title ? gray(entry.title) : ''}`;
  }

  function handleEntry(response: HTTPResponse) {
    const entry = config.entries.find(
      (candidate): candidate is ManuscriptEntry => {
        if (!('source' in candidate)) {
          return false;
        }
        const url = new URL(response.url());
        return url.protocol === 'file:'
          ? pathEquals(candidate.target, url.pathname)
          : pathEquals(
              upath.relative(config.workspaceDir, candidate.target),
              url.pathname.slice(1),
            );
      },
    );
    if (entry) {
      if (!lastEntry) {
        lastEntry = entry;
        Logger.logUpdate(stringifyEntry(entry));
        return;
      }
      Logger.logSuccess(stringifyEntry(lastEntry));
      Logger.startLogging(stringifyEntry(entry));
      lastEntry = entry;
    }
  }

  const { browser, page, closeBrowser } = await launchPreview({
    mode: 'build',
    url: viewerFullUrl,
    signal,
    config,
    onBrowserOpen: () => {
      Logger.logUpdate('Building pages');
    },
    onPageOpen: (openedPage) => {
      openedPage.on('pageerror', (error) => {
        Logger.logError(red(toError(error).message));
      });

      openedPage.on('console', (msg) => {
        switch (msg.type()) {
          case 'error':
            if (msg.location().url?.endsWith('/vivliostyle-viewer.js')) {
              Logger.logError(msg.text());
              throw new Error(msg.text());
            }
            return;
          case 'debug':
            if (/time slice/v.test(msg.text())) {
              return;
            }
            break;
          default:
            break;
        }
        if (msg.type() === 'error') {
          Logger.logVerbose(red('console.error()'), msg.text());
        } else {
          Logger.logVerbose(gray(`console.${msg.type()}()`), msg.text());
        }
      });

      openedPage.on('response', (response) => {
        Logger.debug(
          gray('viewer:response'),
          green(response.status().toString()),
          response.url(),
        );

        handleEntry(response);

        if (400 > response.status() && 200 <= response.status()) {
          return;
        }
        // file protocol doesn't have status code
        if (response.url().startsWith('file://') && response.ok()) {
          return;
        }

        Logger.logError(red(`${response.status()}`), response.url());
      });

      openedPage.setDefaultTimeout(config.timeout);
    },
  });

  const browserResult = await runBrowserOperationWithAbort({
    signal,
    closeBrowser,
    operation: async () => {
      const browserVersion = await browser.version();
      Logger.debug(green('success'), `browserVersion=${browserVersion}`);

      let remainTime = config.timeout;
      const startTime = Date.now();

      await page.waitForNetworkIdle({ signal });
      await page.waitForFunction(() => !!window.coreViewer, { signal });

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- read the undocumented `protocol` field puppeteer-core sets on the browser
      const { protocol } = browser as Browser & {
        protocol: 'cdp' | 'webDriverBiDi';
      };
      // Only CDP supports emulateMediaType
      if (protocol === 'cdp') {
        await page.emulateMediaType('print');
      }
      await page.waitForFunction(
        /* v8 ignore next */
        () => window.coreViewer.readyState === 'complete',
        { polling: 1000, signal },
      );

      if (lastEntry) {
        Logger.logSuccess(stringifyEntry(lastEntry));
      }

      const pageProgression = await page.evaluate((): 'ltr' | 'rtl' =>
        /* v8 ignore next 5 */
        document.querySelector<HTMLElement>('#vivliostyle-viewer-viewport')
          ?.dataset.vivliostylePageProgression === 'rtl'
          ? 'rtl'
          : 'ltr',
      );
      const viewerCoreVersion = await page.evaluate(() =>
        /* v8 ignore next 3 */
        document
          .querySelector('#vivliostyle-menu_settings .version')
          ?.textContent?.replace(/^.*?: (\d[\-+.\w]+).*$/v, '$1'),
      );
      const metadata = await loadMetadata(page);
      const toc = await loadTOC(page);
      const pageSizeData = await loadPageSizeData(page);
      const cmykMap = target.cmyk ? await loadCmykMap(page) : {};

      remainTime -= Date.now() - startTime;
      if (remainTime <= 0) {
        throw new Error('Typesetting process timed out');
      }
      Logger.debug('Remaining timeout:', remainTime);

      Logger.logUpdate('Building PDF');

      // For Firefox WebDriver BiDi, explicitly set width and height
      // because page.pdf() doesn't support for the preferCSSPageSize option.
      // Use a sufficiently large value to accommodate user-defined page sizes.
      const dimensionSizeForWebDriverBiDi =
        Number.parseInt(process.env.VS_CLI_PDF_BUILD_PDF_PAGE_SIZE || '', 10) ||
        // 1000mm
        3780;
      const pdf = await page.pdf({
        margin: {
          top: 0,
          bottom: 0,
          right: 0,
          left: 0,
        },
        printBackground: true,
        tagged: true,
        // timeout: remainTime,
        ...(protocol === 'webDriverBiDi'
          ? {
              width: dimensionSizeForWebDriverBiDi,
              height: dimensionSizeForWebDriverBiDi,
            }
          : {
              preferCSSPageSize: true,
            }),
      });

      return {
        browserVersion,
        pageProgression,
        viewerCoreVersion,
        metadata,
        toc,
        pageSizeData,
        cmykMap,
        pdf,
      };
    },
  });

  await closeBrowser();
  signal?.throwIfAborted();

  Logger.logUpdate('Processing PDF');
  fs.mkdirSync(upath.dirname(target.path), { recursive: true });

  const post = await PostProcess.load(browserResult.pdf);
  await post.metadata(browserResult.metadata, {
    pageProgression: browserResult.pageProgression,
    browserVersion: browserResult.browserVersion,
    viewerCoreVersion: browserResult.viewerCoreVersion,
    // If custom viewer is set and its version info is not available,
    // there is no guarantee that the default creator option is correct.
    disableCreatorOption: !!config.viewer && !browserResult.viewerCoreVersion,
  });
  await post.toc(browserResult.toc);
  post.setPageBoxes(browserResult.pageSizeData);
  await post.save(target.path, {
    preflight: target.preflight,
    preflightOption: target.preflightOption,
    image: config.image,
    cmyk: target.cmyk,
    cmykMap: browserResult.cmykMap,
    replaceImage: target.replaceImage,
    signal,
  });

  return target.path;
}

function loadMetadata(page: Page): Promise<Meta> {
  return page.evaluate(() => window.coreViewer.getMetadata());
}

// Show and hide the TOC in order to read its contents.
// Chromium needs to see the TOC links in the DOM to add
// the PDF destinations used during postprocessing.
function loadTOC(page: Page): Promise<TOCItem[]> {
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

function loadPageSizeData(page: Page): Promise<PageSizeData[]> {
  /* v8 ignore start */
  return page.evaluate(() => {
    const sizeData: PageSizeData[] = [];
    const pageContainers = document.querySelectorAll<HTMLElement>(
      '#vivliostyle-viewer-viewport > div > div > div[data-vivliostyle-page-container]',
    );

    for (const pageContainer of pageContainers) {
      const bleedBox = pageContainer.querySelector<HTMLElement>(
        'div[data-vivliostyle-bleed-box]',
      );
      sizeData.push({
        mediaWidth: Number.parseFloat(pageContainer.style.width) * 0.75,
        mediaHeight: Number.parseFloat(pageContainer.style.height) * 0.75,
        bleedOffset: Number.parseFloat(bleedBox?.style.left ?? '') * 0.75,
        bleedSize: Number.parseFloat(bleedBox?.style.paddingLeft ?? '') * 0.75,
      });
    }
    return sizeData;
  });
  /* v8 ignore stop */
}

function loadCmykMap(page: Page): Promise<CmykMap> {
  /* v8 ignore next 3 */
  return page.evaluate(() => window.coreViewer.getCmykMap?.() ?? {});
}
