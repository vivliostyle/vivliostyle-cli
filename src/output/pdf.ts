import fs from 'node:fs';
import { pathToFileURL, URL } from 'node:url';

import terminalLink from 'terminal-link';
import upath from 'upath';
import { cyan, gray, green, red } from 'yoctocolors';

import type { WorkerPdfRenderer } from '../browser-worker/client.js';
import {
  launchPreview,
  pdfTiming,
  runBrowserOperationWithAbort,
} from '../browser.js';
import type {
  ParsedEntry,
  PdfOutput,
  ResolvedTaskConfig,
} from '../config/resolve.js';
import { Logger } from '../logger.js';
import { getViewerFullUrl } from '../server.js';
import { pathEquals } from '../util.js';
import { postProcessPDF } from './pdf-postprocess.js';
import { createPdfRenderer, type PdfRenderProgress } from './pdf-render.js';

export async function buildPDF({
  target,
  config,
  signal,
  renderWithWorker,
}: {
  target: PdfOutput;
  config: ResolvedTaskConfig;
  signal?: AbortSignal;
  renderWithWorker?: WorkerPdfRenderer;
}): Promise<string | null> {
  Logger.logUpdate(`Launching PDF build environment`);

  const viewerFullUrl = await getViewerFullUrl(config);
  Logger.debug('viewerFullUrl', viewerFullUrl);

  let lastEntry: ParsedEntry | undefined;
  let paginationProgress: { pages: number; fraction: number } | undefined;
  let typesettingFinished = false;

  function stringifyEntry(entry: ParsedEntry) {
    const title = entry.title ? gray(entry.title) : '';
    const source = entry.source ?? entry.template;
    const fileLink = (file: string) => ({
      path: upath.relative(config.entryContextDir, file),
      href: pathToFileURL(file).href,
    });
    let input: { path: string; href: string } | undefined;
    if (source?.type === 'file') {
      input = fileLink(source.pathname);
    } else if (source) {
      // remote (uri) source
      input = { path: source.href, href: source.href };
    } else if ('coverImageSrc' in entry) {
      input = fileLink(entry.coverImageSrc);
    }
    if (!input) {
      // generated entry with no input (auto-generated TOC)
      return title;
    }
    const label = cyan(input.path);
    const link = terminalLink(label, input.href, { fallback: () => label });
    return title ? `${link} ${title}` : link;
  }

  function entryText() {
    return lastEntry ? stringifyEntry(lastEntry) : 'Building pages';
  }

  function renderBuildingText() {
    const base = entryText();
    if (!paginationProgress) {
      return base;
    }
    const percent = Math.min(
      100,
      Math.round(paginationProgress.fraction * 100),
    );
    const suffix = `(${paginationProgress.pages} pages, ${percent}%)`;
    return `${base} ${gray(suffix)}`;
  }

  function findEntryByHref(href: string): ParsedEntry | undefined {
    if (!URL.canParse(href)) {
      return;
    }
    const url = new URL(href);
    return config.entries.find((candidate) => {
      if (url.protocol === 'file:') {
        return pathEquals(candidate.target, decodeURI(url.pathname));
      }
      // Served documents are mounted under the base path (default: /vivliostyle)
      const basePrefix = `${config.base}/`;
      return (
        url.pathname.startsWith(basePrefix) &&
        pathEquals(
          upath.relative(config.workspaceDir, candidate.target),
          decodeURI(url.pathname.slice(basePrefix.length)),
        )
      );
    });
  }

  function handlePaginationProgress(
    pages: number,
    fraction: number,
    href?: string,
  ) {
    if (
      typesettingFinished ||
      !Number.isFinite(pages) ||
      !Number.isFinite(fraction)
    ) {
      return;
    }
    paginationProgress = { pages, fraction };

    const entry = href ? findEntryByHref(href) : undefined;
    if (entry && entry !== lastEntry) {
      if (lastEntry) {
        Logger.logInfo(stringifyEntry(lastEntry));
      }
      lastEntry = entry;
    }

    Logger.logUpdateProgress(renderBuildingText());
  }

  const report = (event: PdfRenderProgress) => {
    switch (event.type) {
      case 'pagination':
        handlePaginationProgress(event.pages, event.fraction, event.href);
        break;
      case 'typeset':
        typesettingFinished = true;
        if (lastEntry) {
          Logger.logInfo(stringifyEntry(lastEntry));
        }
        break;
      case 'printing':
        Logger.logUpdate('Building PDF');
        break;
      case 'browser':
        pdfTiming('PDF browser pid=%d launchMs=%d', event.pid, event.launchMs);
        Logger.logUpdate('Building pages');
        break;
      case 'error':
        Logger.logError(red(event.message));
        break;
      case 'debug':
        Logger.debug(event.message);
        break;
      case 'console':
        Logger.logVerbose(gray(`console.${event.level}()`), event.message);
        break;
      case 'response':
        Logger.debug(
          gray('viewer:response'),
          green(String(event.status)),
          event.url,
        );
        if (
          !(event.status >= 200 && event.status < 400) &&
          !(event.url.startsWith('file://') && event.ok)
        ) {
          Logger.logError(red(String(event.status)), event.url);
        }
        break;
    }
  };
  const browserResult = renderWithWorker
    ? await renderWithWorker(config, viewerFullUrl, !!target.cmyk, report)
    : await renderLocally(config, viewerFullUrl, !!target.cmyk, report, signal);
  signal?.throwIfAborted();

  Logger.logUpdate('Processing PDF');
  fs.mkdirSync(upath.dirname(target.path), { recursive: true });

  await postProcessPDF({
    pdf: browserResult.pdf,
    output: target.path,
    metadata: browserResult.metadata,
    metadataOptions: {
      pageProgression: browserResult.pageProgression,
      browserVersion: browserResult.browserVersion,
      viewerCoreVersion: browserResult.viewerCoreVersion,
      // If custom viewer is set and its version info is not available,
      // there is no guarantee that the default creator option is correct.
      disableCreatorOption: !!config.viewer && !browserResult.viewerCoreVersion,
    },
    tocItems: browserResult.toc,
    pageSizeData: browserResult.pageSizeData,
    preflight: target.preflight,
    preflightOption: target.preflightOption,
    image: config.image,
    cmyk: target.cmyk,
    cmykMap: browserResult.cmykMap,
    replaceImage: target.replaceImage,
    defaultRgbProfile: target.defaultRgbProfile,
    pdfx: target.pdfx,
    signal,
  });

  return target.path;
}

async function renderLocally(
  config: ResolvedTaskConfig,
  url: string,
  cmyk: boolean,
  report: (event: PdfRenderProgress) => void,
  signal?: AbortSignal,
) {
  const renderer = createPdfRenderer({
    timeout: config.timeout,
    cmyk: cmyk,
    report,
  });
  let readyAt = performance.now();
  const { browser, page, closeBrowser } = await launchPreview({
    mode: 'build',
    url: url,
    signal,
    config,
    onBrowserOpen: () => {
      readyAt = performance.now();
      Logger.logUpdate('Building pages');
    },
    onPageOpen: renderer.onPageOpen,
  });
  let closing: Promise<void> | undefined;
  const close = () => (closing ??= closeBrowser());
  try {
    const result = await runBrowserOperationWithAbort({
      signal,
      closeBrowser: close,
      operation: () => renderer.render(browser, page, signal),
    });
    pdfTiming(
      'PDF render renderMs=%d',
      Math.round(performance.now() - readyAt),
    );
    return result;
  } finally {
    await close();
  }
}
