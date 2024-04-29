import jsdom, {
  ResourceLoader as BaseResourceLoader,
  JSDOM,
} from '@vivliostyle/jsdom';
import chalk from 'chalk';
import cheerio from 'cheerio';
import { toHtml } from 'hast-util-to-html';
import { h } from 'hastscript';
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

export interface StructuredDocument {
  title: string;
  href: string;
  sections?: StructuredSection[];
  children: StructuredDocument[];
}

export interface StructuredSection {
  headingText: string;
  level?: number;
  id?: string;
  children: StructuredSection[];
}

export async function getStructuredSectionFromHtml(htmlPath: string) {
  const { dom } = await getJsdomFromUrlOrFile(htmlPath);
  const { document } = dom.window;
  const allSectionHeaders = [
    ...document.querySelectorAll(
      'section > :is(h1, h2, h3, h4, h5, h6, hgroup):first-child',
    ),
  ].sort((a, b) => {
    const position = a.compareDocumentPosition(b);
    return position & 2 /* DOCUMENT_POSITION_PRECEDING */
      ? 1
      : position & 4 /* DOCUMENT_POSITION_FOLLOWING */
      ? -1
      : 0;
  });

  function traverse(headers: Element[]): StructuredSection[] {
    if (headers.length === 0) {
      return [];
    }
    const [head, ...tail] = headers;
    const section = head.parentElement!;
    let i = tail.findIndex((s) => !section.contains(s));
    i = i === -1 ? tail.length : i;
    return [
      {
        headingText: head.textContent?.trim().replace(/\s+/g, ' ') || '',
        level: /^h[1-6]$/i.test(head.tagName)
          ? Number(head.tagName.slice(1))
          : undefined,
        id: head.id || undefined,
        children: traverse(tail.slice(0, i)),
      },
      ...traverse(tail.slice(i)),
    ];
  }
  return traverse(allSectionHeaders);
}

const getTocHtmlStyle = ({
  pageBreakBefore,
  pageCounterReset,
}: {
  pageBreakBefore?: 'recto' | 'verso' | 'left' | 'right';
  pageCounterReset?: number;
}) => {
  if (!pageBreakBefore && typeof pageCounterReset !== 'number') {
    return null;
  }
  return /* css */ `
${
  pageBreakBefore
    ? `:root {
  break-before: ${pageBreakBefore};
}`
    : ''
}
${
  typeof pageCounterReset === 'number'
    ? `@page :nth(1) {
  counter-reset: page ${Math.floor(pageCounterReset - 1)};
}`
    : ''
}
`;
};

export const defaultTocNodeRenderer = {
  docList: (_nodeList: StructuredDocument[]) => (children: any) => {
    return h('ol', [children].flat());
  },
  docListItem: (node: StructuredDocument) => (children: any) => {
    const { href, title } = node;
    return h('li', [h('a', { href }, title), ...[children].flat()]);
  },
  sectionList:
    (_nodeList: (StructuredSection & { href: string | null })[]) =>
    (children: any) => {
      return h('ol', [children].flat());
    },
  sectionListItem:
    (node: StructuredSection & { href: string | null }) => (children: any) => {
      const { headingText, href, level } = node;
      return h('li', { dataSectionLevel: level }, [
        href ? h('a', { href }, headingText) : headingText,
        ...[children].flat(),
      ]);
    },
};

export async function generateTocHtml({
  entries,
  manifestPath,
  distDir,
  language,
  title,
  tocTitle,
  sectionLevel = -1,
  stylesheets = [],
  styleOptions = {},
  nodeRenderer = defaultTocNodeRenderer,
}: {
  entries: Pick<ManuscriptEntry, 'target' | 'title'>[];
  manifestPath: string;
  distDir: string;
  language?: string;
  title?: string;
  tocTitle: string;
  sectionLevel?: number;
  stylesheets?: string[];
  styleOptions?: Parameters<typeof getTocHtmlStyle>[0];
  nodeRenderer?: typeof defaultTocNodeRenderer;
}): Promise<string> {
  const {
    docList = defaultTocNodeRenderer.docList,
    docListItem = defaultTocNodeRenderer.docListItem,
    sectionList = defaultTocNodeRenderer.sectionList,
    sectionListItem = defaultTocNodeRenderer.sectionListItem,
  } = nodeRenderer;

  const structure = await Promise.all(
    entries.map(async (entry): Promise<StructuredDocument> => {
      const sections =
        sectionLevel >= 1
          ? await getStructuredSectionFromHtml(entry.target)
          : [];
      return {
        title: entry.title || upath.basename(entry.target, '.html'),
        href: encodeURI(upath.relative(distDir, entry.target)),
        sections,
        children: [], // TODO
      };
    }),
  );
  type Element = ReturnType<typeof h>;
  const docToc = docList(structure)(
    structure.map((doc) => {
      function renderSectionList(
        sections: StructuredSection[],
      ): Element | Element[] {
        const nodeList = sections.flatMap((section) => {
          if (section.level && section.level > sectionLevel) {
            return [];
          }
          const s = section as StructuredSection & { href: string | null };
          s.href = section.id
            ? `${doc.href}#${encodeURIComponent(section.id)}`
            : null;
          return s;
        });
        if (nodeList.length === 0) {
          return [];
        }
        return sectionList(nodeList)(
          nodeList.map((node) =>
            sectionListItem(node)([renderSectionList(node.children)].flat()),
          ),
        );
      }
      return docListItem(doc)([renderSectionList(doc.sections || [])].flat());
    }),
  );

  const toc = h('html', { lang: language }, [
    h('head', [
      h('meta', { charset: 'utf-8' }),
      h('title', title ?? ''),
      ...(() => {
        const style = getTocHtmlStyle(styleOptions);
        return style ? [h('style', style)] : [];
      })(),
      h('link', {
        href: encodeURI(upath.relative(distDir, manifestPath)),
        rel: 'publication',
        type: 'application/ld+json',
      }),
      ...stylesheets.map((s) =>
        h('link', { type: 'text/css', href: s, rel: 'stylesheet' }),
      ),
    ]),
    h('body', [
      h('h1', title || ''),
      h('nav#toc', { role: 'doc-toc' }, [h('h2', tocTitle), docToc]),
    ]),
  ]);
  return prettier.format(toHtml(toc), { parser: 'html' });
}

const getCoverHtmlStyle = ({
  pageBreakBefore,
}: {
  pageBreakBefore?: 'recto' | 'verso' | 'left' | 'right';
}) => /* css */ `
${
  pageBreakBefore
    ? `:root {
  break-before: ${pageBreakBefore};
}`
    : ''
}
body {
  margin: 0;
}
[role="doc-cover"] {
  display: block;
  width: 100vw;
  height: 100vh;
  object-fit: contain;
}
@page {
  margin: 0;
}
`;
export function generateCoverHtml({
  imageSrc,
  imageAlt,
  language,
  title,
  stylesheets = [],
  styleOptions = {},
}: {
  imageSrc: string;
  imageAlt: string;
  language?: string;
  title?: string;
  stylesheets?: string[];
  styleOptions?: Parameters<typeof getCoverHtmlStyle>[0];
}): string {
  const cover = h('html', { lang: language }, [
    h('head', [
      h('meta', { charset: 'utf-8' }),
      h('title', title ?? ''),
      ...(() => {
        const style = getCoverHtmlStyle(styleOptions);
        return style ? [h('style', style)] : [];
      })(),
      ...stylesheets.map((s) =>
        h('link', { type: 'text/css', href: s, rel: 'stylesheet' }),
      ),
    ]),
    h('body', [
      h(
        'section',
        { role: 'region', ariaLabel: 'Cover' },
        h('img', { src: imageSrc, alt: imageAlt, role: 'doc-cover' }),
      ),
    ]),
  ]);
  return prettier.format(toHtml(cover), { parser: 'html' });
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
    $('head').append(`<link rel="stylesheet" type="text/css" />`);
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
