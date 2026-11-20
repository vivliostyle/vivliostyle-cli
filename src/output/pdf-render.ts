import type { Browser, Page } from 'puppeteer-core';

import type { CmykMap, Meta, Payload, TOCItem } from '../global-viewer.js';
import { toError } from '../util.js';
import type { PageSizeData } from './pdf-document.js';

export type PdfRenderProgress =
  | { type: 'pagination'; pages: number; fraction: number; href?: string }
  | { type: 'console'; level: string; message: string }
  | { type: 'response'; status: number; url: string; ok: boolean }
  | { type: 'error' | 'debug'; message: string }
  | { type: 'browser'; pid: number; launchMs: number }
  | { type: 'typeset' | 'printing' };

export interface PdfRenderMetadata {
  browserVersion: string;
  pageProgression: 'ltr' | 'rtl';
  viewerCoreVersion?: string;
  metadata: Meta;
  toc: TOCItem[];
  pageSizeData: PageSizeData[];
  cmykMap: CmykMap;
}

export interface PdfRenderResult extends PdfRenderMetadata {
  pdf: Uint8Array;
}

export function createPdfRenderer({
  timeout,
  cmyk,
  report,
}: {
  timeout: number;
  cmyk: boolean;
  report: (event: PdfRenderProgress) => void;
}): {
  onPageOpen: (page: Page) => Promise<void>;
  render: (
    browser: Browser,
    page: Page,
    signal?: AbortSignal,
  ) => Promise<PdfRenderResult>;
} {
  let viewerError: Error | undefined;
  let rejectViewerError: ((error: Error) => void) | undefined;

  async function onPageOpen(openedPage: Page) {
    openedPage.on('pageerror', (error) => {
      report({ type: 'error', message: toError(error).message });
    });

    openedPage.on('console', (msg) => {
      switch (msg.type()) {
        case 'error':
          if (msg.location().url?.endsWith('/vivliostyle-viewer.js')) {
            report({ type: 'error', message: msg.text() });
            viewerError = new Error(msg.text());
            rejectViewerError?.(viewerError);
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
      report({ type: 'console', level: msg.type(), message: msg.text() });
    });

    openedPage.on('response', (response) => {
      report({
        type: 'response',
        status: response.status(),
        url: response.url(),
        ok: response.ok(),
      });
    });

    try {
      await openedPage.exposeFunction(
        '__vsCliReportPaginationProgress',
        (pages: number, fraction: number, href?: unknown) => {
          if (Number.isFinite(pages) && Number.isFinite(fraction)) {
            report({
              type: 'pagination',
              pages,
              fraction,
              href: typeof href === 'string' ? href : undefined,
            });
          }
        },
      );
      await openedPage.evaluateOnNewDocument(() => {
        /* v8 ignore start */
        let tick = 0;
        const timer = setInterval(() => {
          if (!window.coreViewer) {
            // Give up if the viewer never appears
            if (++tick > 600) {
              clearInterval(timer);
            }
            return;
          }
          clearInterval(timer);
          window.coreViewer.addListener('paginationprogress', (payload) => {
            // oxlint-disable-next-line no-underscore-dangle -- exposed function name prefixed to avoid page global collisions
            window.__vsCliReportPaginationProgress?.(
              payload.pages ?? 0,
              payload.fraction ?? 0,
              payload.href,
            );
          });
        }, 100);
        /* v8 ignore stop */
      });
    } catch (error) {
      report({
        type: 'debug',
        message: `Failed to set up pagination progress reporting: ${toError(error).message}`,
      });
    }

    openedPage.setDefaultTimeout(timeout);
  }

  async function render(browser: Browser, page: Page, signal?: AbortSignal) {
    if (viewerError) {
      throw toError(viewerError);
    }
    const failure = new Promise<never>((_, reject) => {
      rejectViewerError = reject;
    });
    try {
      return await Promise.race([failure, print(browser, page, signal)]);
    } finally {
      rejectViewerError = undefined;
    }
  }

  async function print(
    browser: Browser,
    page: Page,
    signal?: AbortSignal,
  ): Promise<PdfRenderResult> {
    const browserVersion = await browser.version();
    report({ type: 'debug', message: `browserVersion=${browserVersion}` });

    let remainTime = timeout;
    const startTime = Date.now();

    await page.waitForNetworkIdle({ signal });
    await page.waitForFunction(() => !!window.coreViewer, { signal });

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- read the undocumented `protocol` field puppeteer-core sets on the browser
    const { protocol } = browser as Browser & {
      protocol: 'cdp' | 'webDriverBiDi';
    };
    await page.waitForFunction(
      /* v8 ignore next */
      () => window.coreViewer.readyState === 'complete',
      { polling: 1000, signal },
    );
    report({ type: 'typeset' });

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
    const cmykMap = cmyk ? await loadCmykMap(page) : {};

    remainTime -= Date.now() - startTime;
    if (remainTime <= 0) {
      throw new Error('Typesetting process timed out');
    }
    report({ type: 'debug', message: `Remaining timeout: ${remainTime}` });

    report({ type: 'printing' });

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
  }

  return { onPageOpen, render };
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
