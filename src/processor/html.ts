import jsdom, {
  ResourceLoader as BaseResourceLoader,
  JSDOM,
} from '@vivliostyle/jsdom';
import chalk from 'chalk';
import cheerio from 'cheerio';
import toHTML from 'hast-util-to-html';
import h from 'hastscript';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import prettier from 'prettier';
import { ManuscriptEntry } from '../input/config.js';
import type { PublicationManifest } from '../schema/publication.schema.js';
import {
  DetailError,
  assertPubManifestSchema,
  debug,
  isUrlString,
  logWarn,
  upath,
} from '../util.js';

const virtualConsole = new jsdom.VirtualConsole();
/* c8 ignore start */
virtualConsole.on('error', (message) => {
  debug('[JSDOM Console] error:', message);
});
virtualConsole.on('warn', (message) => {
  debug('[JSDOM Console] warn:', message);
});
virtualConsole.on('log', (message) => {
  debug('[JSDOM Console] log:', message);
});
virtualConsole.on('info', (message) => {
  debug('[JSDOM Console] info:', message);
});
virtualConsole.on('dir', (message) => {
  debug('[JSDOM Console] dir:', message);
});
virtualConsole.on('jsdomError', (error) => {
  // Most of CSS using Paged media will be failed to run CSS parser of JSDOM.
  // We just ignore it because we don't use CSS parse results.
  // https://github.com/jsdom/jsdom/blob/a39e0ec4ce9a8806692d986a7ed0cd565ec7498a/lib/jsdom/living/helpers/stylesheets.js#L33-L44
  // see also: https://github.com/jsdom/jsdom/issues/2005
  if (error.message === 'Could not parse CSS stylesheet') {
    return;
  }
  throw new DetailError(
    'Error occurred when loading HTML',
    error.stack ?? error.message,
  );
});
/* c8 ignore end */

export class ResourceLoader extends BaseResourceLoader {
  fetcherMap = new Map<string, jsdom.AbortablePromise<Buffer>>();

  fetch(url: string, options?: jsdom.FetchOptions) {
    debug(`[JSDOM] Fetching resource: ${url}`);
    const fetcher = super.fetch(url, options);
    if (fetcher) {
      this.fetcherMap.set(url, fetcher);
    }
    return fetcher;
  }
}

export async function getJsdomFromUrlOrFile(
  src: string,
  resourceLoader?: ResourceLoader,
): Promise<{
  dom: JSDOM;
}> {
  const url = isUrlString(src) ? new URL(src) : pathToFileURL(src);
  let dom: JSDOM;
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    dom = await JSDOM.fromURL(src, {
      virtualConsole,
      resources: resourceLoader,
    });
  } else if (url.protocol === 'file:') {
    if (resourceLoader) {
      const file = resourceLoader._readFile(fileURLToPath(url));
      resourceLoader.fetcherMap.set(url.href, file);
    }
    dom = await JSDOM.fromFile(fileURLToPath(url), {
      virtualConsole,
      resources: resourceLoader,
      contentType: 'text/html; charset=UTF-8',
    });
  } else {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }
  return { dom };
}

const getTocHtmlStyle = ({
  bodyBreakBefore,
}: {
  bodyBreakBefore: 'page' | 'recto' | 'verso';
}) => /* css */ `
body {
  break-before: ${bodyBreakBefore};
}
`;
export function generateTocHtml({
  entries,
  manifestPath,
  distDir,
  title,
  tocTitle,
  style,
}: {
  entries: Pick<ManuscriptEntry, 'target' | 'title'>[];
  manifestPath: string;
  distDir: string;
  title?: string;
  tocTitle: string;
  style?: string[];
}): string {
  const items = entries.map((entry) =>
    h(
      'li',
      h(
        'a',
        { href: encodeURI(upath.relative(distDir, entry.target)) },
        entry.title || upath.basename(entry.target, '.html'),
      ),
    ),
  );
  const toc = h(
    'html',
    h(
      'head',
      ...[
        h('meta', { charset: 'utf-8' }),
        h('title', title ?? ''),
        h('style', getTocHtmlStyle({ bodyBreakBefore: 'page' })),
        h('link', {
          href: encodeURI(upath.relative(distDir, manifestPath)),
          rel: 'publication',
          type: 'application/ld+json',
        }),
        ...(style || []).map((s) => h('link', { href: s, rel: 'stylesheet' })),
      ].filter((n) => !!n),
    ),
    h(
      'body',
      h('h1', title || ''),
      h('nav#toc', { role: 'doc-toc' }, h('h2', tocTitle), h('ol', items)),
    ),
  );
  return prettier.format(toHTML(toc), { parser: 'html' });
}

const getCoverHtmlStyle = () => /* css */ `
body {
  margin: 0;
}
[role="doc-cover"] {
  width: 100vw;
  height: 100vh;
  object-fit: cover;
}
@page {
  margin: 0;
}
`;
export function generateCoverHtml({
  imageSrc,
  imageAlt,
  title,
  style,
}: {
  imageSrc: string;
  imageAlt: string;
  title?: string;
  style?: string[];
}): string {
  const cover = h(
    'html',
    h(
      'head',
      ...[
        h('meta', { charset: 'utf-8' }),
        h('title', title ?? ''),
        h('style', getCoverHtmlStyle()),
        ...(style || []).map((s) => h('link', { href: s, rel: 'stylesheet' })),
      ].filter((n) => !!n),
    ),
    h(
      'body',
      h(
        'section',
        { role: 'region', ariaLabel: 'Cover' },
        h('img', { src: imageSrc, alt: imageAlt, role: 'doc-cover' }),
      ),
    ),
  );
  return prettier.format(toHTML(cover), { parser: 'html' });
}

export function processManuscriptHtml(
  filepath: string,
  {
    title,
    style,
    contentType,
    language,
  }: {
    title?: string;
    style?: string[];
    contentType?: 'text/html' | 'application/xhtml+xml';
    language?: string | null;
  },
): string {
  const $ = cheerio.load(fs.readFileSync(filepath, 'utf8'), {
    xmlMode: contentType === 'application/xhtml+xml',
  });
  if (title) {
    if (!$('title')) {
      $('head').append($('<title></title>'));
    }
    $('title').text(title);
  }
  for (const s of style ?? []) {
    $('head').append(`<link rel="stylesheet" />`);
    $('head > *:last-child').attr('href', s);
  }
  if (language) {
    if (contentType === 'application/xhtml+xml') {
      if (!$('html').attr('xml:lang')) {
        $('html').attr('lang', language);
        $('html').attr('xml:lang', language);
      }
    } else {
      if (!$('html').attr('lang')) {
        $('html').attr('lang', language);
      }
    }
  }
  let processed = $.html();
  return processed;
}

export function isTocHtml(filepath: string): boolean {
  try {
    const $ = cheerio.load(fs.readFileSync(filepath, 'utf8'));
    return (
      $('[role="doc-toc"], [role="directory"], nav, .toc, #toc').length > 0
    );
  } catch (err) {
    // seems not to be a html file
    return false;
  }
}

export function isCovertHtml(filepath: string): boolean {
  try {
    const $ = cheerio.load(fs.readFileSync(filepath, 'utf8'));
    return $('[role="doc-cover"]').length > 0;
  } catch (err) {
    // seems not to be a html file
    return false;
  }
}

export async function fetchLinkedPublicationManifest({
  dom,
  resourceLoader,
  baseUrl,
}: {
  dom: JSDOM;
  resourceLoader: ResourceLoader;
  baseUrl: string;
}): Promise<PublicationManifest | null> {
  const { document } = dom.window;

  const linkEl = document.querySelector('link[href][rel="publication"]');
  if (!linkEl) {
    return null;
  }
  const href = linkEl.getAttribute('href')!.trim();
  let manifest: PublicationManifest;
  let manifestJson: string;
  if (href.startsWith('#')) {
    const scriptEl = document.getElementById(href.slice(1));
    if (scriptEl?.getAttribute('type') !== 'application/ld+json') {
      return null;
    }
    debug(`Found embedded publication manifest: ${href}`);
    try {
      manifest = JSON.parse(scriptEl.innerHTML);
    } catch (error) {
      const thrownError = error as Error;
      throw new DetailError(
        'Failed to parse manifest data',
        typeof thrownError.stack ?? thrownError.message,
      );
    }
    manifestJson = JSON.stringify(manifest, null, 2);
  } else {
    debug(`Found linked publication manifest: ${href}`);
    const url = new URL(href, baseUrl);
    const buffer = await resourceLoader.fetch(url.href);
    if (!buffer) {
      throw new Error(`Failed to fetch manifest JSON file: ${url.href}`);
    }
    manifestJson = buffer.toString();
    try {
      manifest = JSON.parse(manifestJson);
    } catch (error) {
      const thrownError = error as Error;
      throw new DetailError(
        'Failed to parse manifest data',
        typeof thrownError.stack ?? thrownError.message,
      );
    }
  }

  try {
    assertPubManifestSchema(manifest, { json: manifestJson });
  } catch (error) {
    logWarn(
      `${chalk.yellowBright(
        'Publication manifest validation failed. Processing continues, but some problems may occur.',
      )}\n${error}`,
    );
  }
  return manifest;
}

export type TocResourceTreeItem = {
  element: HTMLElement;
  label: HTMLElement;
  children?: TocResourceTreeItem[];
};
export type TocResourceTreeRoot = {
  element: HTMLElement;
  heading?: HTMLElement;
  children: TocResourceTreeItem[];
};

export function parseTocDocument(dom: JSDOM): TocResourceTreeRoot | null {
  const { document } = dom.window;

  const docTocEl = document.querySelectorAll('[role="doc-toc"]');
  if (docTocEl.length === 0) {
    return null;
  }
  const tocRoot = docTocEl.item(0);

  const parseTocItem = (element: Element): TocResourceTreeItem | null => {
    if (element.tagName !== 'LI') {
      return null;
    }
    const label = element.children.item(0);
    const ol = element.children.item(1);
    if (!label || (label.tagName !== 'A' && label.tagName !== 'SPAN')) {
      return null;
    }
    if (!ol || ol.tagName !== 'OL') {
      return { element: element as HTMLElement, label: label as HTMLElement };
    }
    const children = Array.from(ol.children).reduce<
      TocResourceTreeItem[] | null
    >((acc, val) => {
      if (!acc) {
        return acc;
      }
      const res = parseTocItem(val);
      return res && [...acc, res];
    }, []);
    return (
      children && {
        element: element as HTMLElement,
        label: label as HTMLElement,
        children,
      }
    );
  };

  let heading: HTMLElement | undefined;
  for (let child of Array.from(tocRoot.children)) {
    if (child.tagName === 'OL') {
      const children = Array.from(child.children).reduce<
        TocResourceTreeItem[] | null
      >((acc, val) => {
        if (!acc) {
          return acc;
        }
        const res = parseTocItem(val);
        return res && [...acc, res];
      }, []);
      return children && { element: tocRoot as HTMLElement, heading, children };
    } else if (
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HGROUP'].includes(child.tagName)
    ) {
      heading = child as HTMLElement;
    } else {
      return null;
    }
  }
  return null;
}

export type PageListResourceTreeItem = {
  element: HTMLElement;
};
export type PageListResourceTreeRoot = {
  element: HTMLElement;
  heading?: HTMLElement;
  children: PageListResourceTreeItem[];
};

export function parsePageListDocument(
  dom: JSDOM,
): PageListResourceTreeRoot | null {
  const { document } = dom.window;

  const docPageListEl = document.querySelectorAll('[role="doc-pagelist"]');
  if (docPageListEl.length === 0) {
    return null;
  }
  const pageListRoot = docPageListEl.item(0);

  let heading: HTMLElement | undefined;
  for (let child of Array.from(pageListRoot.children)) {
    if (child.tagName === 'OL') {
      const children = Array.from(child.children).reduce<
        PageListResourceTreeItem[] | null
      >((acc, element) => {
        return (
          acc &&
          (element.tagName === 'LI'
            ? [...acc, { element: element as HTMLElement }]
            : null)
        );
      }, []);
      return (
        children && { element: pageListRoot as HTMLElement, heading, children }
      );
    } else if (
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HGROUP'].includes(child.tagName)
    ) {
      heading = child as HTMLElement;
    } else {
      return null;
    }
  }
  return null;
}
