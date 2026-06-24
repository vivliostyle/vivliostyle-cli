import { fileURLToPath, pathToFileURL } from 'node:url';

import type { VirtualConsole } from '@vivliostyle/jsdom';
import jsdom, {
  type AbortablePromise,
  ResourceLoader as BaseResourceLoader,
  JSDOM,
} from '@vivliostyle/jsdom';
import DOMPurify, { type WindowLike } from 'dompurify';
import { toHtml } from 'hast-util-to-html';
import upath from 'upath';
import MIMEType from 'whatwg-mimetype';

import type { ManuscriptEntry } from '../config/resolve.js';
import type {
  StructuredDocument,
  StructuredDocumentSection,
} from '../config/schema.js';
import { Logger } from '../logger.js';
import { decodePublicationManifest } from '../output/webbook.js';
import type { PublicationManifest } from '../schema/publication.schema.js';
import {
  DetailError,
  assertPubManifestSchema,
  isValidUri,
  toError,
  writeFileIfChanged,
} from '../util.js';

export const createVirtualConsole = (
  onError: (error: DetailError) => void,
): VirtualConsole => {
  const virtualConsole = new jsdom.VirtualConsole();
  /* v8 ignore start */
  virtualConsole.on('error', (message) => {
    Logger.debug('[JSDOM Console] error:', message);
  });
  virtualConsole.on('warn', (message) => {
    Logger.debug('[JSDOM Console] warn:', message);
  });
  virtualConsole.on('log', (message) => {
    Logger.debug('[JSDOM Console] log:', message);
  });
  virtualConsole.on('info', (message) => {
    Logger.debug('[JSDOM Console] info:', message);
  });
  virtualConsole.on('dir', (message) => {
    Logger.debug('[JSDOM Console] dir:', message);
  });
  virtualConsole.on('jsdomError', (error) => {
    // Most of CSS using Paged media will be failed to run CSS parser of JSDOM.
    // We just ignore it because we don't use CSS parse results.
    // https://github.com/jsdom/jsdom/blob/a39e0ec4ce9a8806692d986a7ed0cd565ec7498a/lib/jsdom/living/helpers/stylesheets.js#L33-L44
    // see also: https://github.com/jsdom/jsdom/issues/2005
    if (error.message === 'Could not parse CSS stylesheet') {
      return;
    }
    onError(
      new DetailError(
        'Error occurred when loading content',
        error.stack ?? error.message,
      ),
    );
  });
  /* v8 ignore stop */
  return virtualConsole;
};

export const htmlPurify = DOMPurify(new JSDOM('').window as WindowLike);

export class ResourceLoader extends BaseResourceLoader {
  static dataUrlOrigin = 'http://localhost/' as const;

  fetcherMap = new Map<string, jsdom.AbortablePromise<Buffer>>();

  fetch(
    url: string,
    options?: jsdom.FetchOptions,
  ): AbortablePromise<Buffer> | null {
    Logger.debug(`[JSDOM] Fetching resource: ${url}`);
    const fetcher = super.fetch(url, options);
    if (fetcher) {
      this.fetcherMap.set(url, fetcher);
    }
    return fetcher;
  }

  static async saveFetchedResources({
    fetcherMap,
    rootUrl,
    outputDir,
    onError,
  }: {
    fetcherMap: Map<string, jsdom.AbortablePromise<Buffer>>;
    rootUrl: string;
    outputDir: string;
    onError?: (error: Error) => void;
  }): Promise<{ url: string; encodingFormat?: string }[]> {
    const rootHref = rootUrl.startsWith('data:')
      ? ResourceLoader.dataUrlOrigin
      : /^https?:/iv.test(rootUrl)
        ? new URL('/', rootUrl).href
        : new URL('.', rootUrl).href;

    const normalizeToLocalPath = (urlString: string, mimeType?: string) => {
      const url = new URL(urlString);
      url.hash = '';
      if (mimeType === 'text/html' && !/\.html?$/v.test(url.pathname)) {
        url.pathname = `${url.pathname.replace(/\/$/v, '')}/index.html`;
      }
      const relTarget = upath.relative(rootHref, url.href);
      return decodeURI(relTarget);
    };

    const fetchedResources: { url: string; encodingFormat?: string }[] = [];
    await Promise.allSettled(
      // oxlint-disable-next-line require-await -- Each callback must return a Promise for Promise.allSettled
      [...fetcherMap.entries()].flatMap(async ([url, fetcher]) => {
        if (!url.startsWith(rootHref)) {
          return [];
        }
        return (
          fetcher
            .then((buffer) => {
              let encodingFormat: string | undefined;
              try {
                const contentType = fetcher.response?.headers['content-type'];
                if (contentType) {
                  encodingFormat = new MIMEType(contentType).essence;
                }
                /* v8 ignore next 3 */
              } catch (e) {
                /* NOOP */
              }
              const relTarget = normalizeToLocalPath(url, encodingFormat);
              const target = upath.join(outputDir, relTarget);
              fetchedResources.push({ url: relTarget, encodingFormat });
              writeFileIfChanged(target, buffer);
            })
            /* v8 ignore next */
            .catch(onError)
        );
      }),
    );
    return fetchedResources;
  }
}

export async function getJsdomFromUrlOrFile({
  src,
  resourceLoader,
  virtualConsole = createVirtualConsole((error) => {
    throw error;
  }),
}: {
  src: string;
  resourceLoader?: ResourceLoader;
  virtualConsole?: VirtualConsole;
}): Promise<JSDOM> {
  const url = isValidUri(src) ? new URL(src) : pathToFileURL(src);
  let dom: JSDOM;
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    dom = await JSDOM.fromURL(src, {
      virtualConsole,
      resources: resourceLoader,
    });
  } else if (url.protocol === 'file:') {
    if (resourceLoader) {
      // oxlint-disable-next-line no-underscore-dangle -- jsdom ResourceLoader API
      const file = resourceLoader._readFile(fileURLToPath(url));
      resourceLoader.fetcherMap.set(url.href, file);
    }
    dom = await JSDOM.fromFile(fileURLToPath(url), {
      virtualConsole,
      resources: resourceLoader,
      contentType:
        src.endsWith('.xhtml') || src.endsWith('.xml')
          ? 'application/xhtml+xml; charset=UTF-8'
          : 'text/html; charset=UTF-8',
    });
  } else if (url.protocol === 'data:') {
    const [head, body] = url.href.split(',', 2);
    const data = decodeURIComponent(body);
    const buffer = Buffer.from(
      data,
      /;base64$/iv.test(head) ? 'base64' : 'utf8',
    );
    const dummyUrl = `${ResourceLoader.dataUrlOrigin}index.html`;
    if (resourceLoader) {
      let timeoutId: ReturnType<typeof setTimeout>;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- jsdom's AbortablePromise is a Promise augmented with abort()/response, assembled below
      const promise = new Promise((resolve) => {
        timeoutId = setTimeout(resolve, 0, buffer);
      }) as AbortablePromise<Buffer>;
      promise.abort = () => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
      };
      resourceLoader.fetcherMap.set(dummyUrl, promise);
    }
    dom = new JSDOM(buffer.toString(), {
      virtualConsole,
      resources: resourceLoader,
      contentType: 'text/html; charset=UTF-8',
      url: dummyUrl,
    });
  } else {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }
  return dom;
}

export function getJsdomFromString({
  html,
  virtualConsole = createVirtualConsole((error) => {
    throw error;
  }),
}: {
  html: string;
  virtualConsole?: VirtualConsole;
}): JSDOM {
  return new JSDOM(html, {
    virtualConsole,
  });
}

export async function getStructuredSectionFromHtml(
  htmlPath: string,
  href?: string,
): Promise<StructuredDocumentSection[]> {
  const dom = await getJsdomFromUrlOrFile({ src: htmlPath });
  const { document } = dom.window;
  const allHeadings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    .filter((el) => {
      // Exclude headings contained by blockquote
      // TODO: Make customizable
      return !el.matches('blockquote *');
    })
    .toSorted((a, b) => {
      const position = a.compareDocumentPosition(b);
      // 2: DOCUMENT_POSITION_PRECEDING
      // 4: DOCUMENT_POSITION_FOLLOWING
      return position & 2 ? 1 : position & 4 ? -1 : 0;
    });

  function traverse(headers: Element[]): StructuredDocumentSection[] {
    if (headers.length === 0) {
      return [];
    }
    const [head, ...tail] = headers;
    const section = head.parentElement;
    /* v8 ignore next 3 */
    if (!section) {
      throw new Error('Heading element is not contained in any parent element');
    }
    const id = head.id || section.id;
    const level = Number(head.tagName.slice(1));
    let i = tail.findIndex((s) => Number(s.tagName.slice(1)) <= level);
    i = i === -1 ? tail.length : i;
    return [
      {
        headingHtml: htmlPurify.sanitize(head.innerHTML),
        headingText: head.textContent?.trim().replaceAll(/\s+/gv, ' ') || '',
        level,
        ...(href && id && { href: `${href}#${encodeURIComponent(id)}` }),
        ...(id && { id }),
        children: traverse(tail.slice(0, i)),
      },
      ...traverse(tail.slice(i)),
    ];
  }
  return traverse(allHeadings);
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
  return `
${
  pageBreakBefore
    ? `:root {
  break-before: ${pageBreakBefore};
}`
    : ''
}
${
  // Note: `--vs-document-first-page-counter-reset` is reserved variable name in Vivliostyle base themes
  typeof pageCounterReset === 'number'
    ? `@page :nth(1) {
  --vs-document-first-page-counter-reset: page ${Math.floor(pageCounterReset - 1)};
  counter-reset: var(--vs-document-first-page-counter-reset);
}`
    : ''
}
`;
};

type HastElement = import('hast').ElementContent | import('hast').Root;

export const defaultTocTransform = {
  transformDocumentList:
    (nodeList: StructuredDocument[]) =>
    (propsList: { children: HastElement | HastElement[] }[]): HastElement => {
      return (
        <ol>
          {nodeList
            .map((a, i) => [a, propsList[i]] as const)
            .flatMap(
              ([{ href, title, sections }, { children, ...otherProps }]) => {
                // don't display the document title if it has only one top-level H1 heading
                if (sections?.length === 1 && sections[0].level === 1) {
                  return [children].flat().flatMap((e) => {
                    if (e.type === 'element' && e.tagName === 'ol') {
                      return e.children;
                    }
                    return e;
                  });
                }
                return (
                  <li {...otherProps}>
                    <a {...{ href }}>{title}</a>
                    {children}
                  </li>
                );
              },
            )}
        </ol>
      );
    },
  transformSectionList:
    (nodeList: StructuredDocumentSection[]) =>
    (propsList: { children: HastElement | HastElement[] }[]): HastElement => {
      return (
        <ol>
          {nodeList
            .map((a, i) => [a, propsList[i]] as const)
            .map(
              ([{ headingHtml, href, level }, { children, ...otherProps }]) => {
                const headingContent = {
                  type: 'raw',
                  value: headingHtml,
                };
                return (
                  <li {...otherProps} data-section-level={level}>
                    {href ? (
                      <a {...{ href }}>{headingContent}</a>
                    ) : (
                      <span>{headingContent}</span>
                    )}
                    {children}
                  </li>
                );
              },
            )}
        </ol>
      );
    },
};

export function generateDefaultTocHtml({
  language,
  title,
}: {
  language?: string;
  title?: string;
}): string {
  const toc = (
    <html lang={language}>
      <head>
        <meta charset="utf-8" />
        <title>{title || ''}</title>
        <style data-vv-style></style>
      </head>
      <body>
        <h1>{title || ''}</h1>
        <nav id="toc" role="doc-toc" />
      </body>
    </html>
  );
  return toHtml(toc);
}

export async function generateTocListSection({
  entries,
  distDir,
  sectionDepth,
  transform = {},
}: {
  entries: Pick<ManuscriptEntry, 'target' | 'title'>[];
  distDir: string;
  sectionDepth: number;
  transform?: Partial<typeof defaultTocTransform>;
}): Promise<string> {
  const {
    transformDocumentList = defaultTocTransform.transformDocumentList,
    transformSectionList = defaultTocTransform.transformSectionList,
  } = transform;

  const structure = await Promise.all(
    entries.map(async (entry) => {
      const href = encodeURI(upath.relative(distDir, entry.target));
      const sections =
        sectionDepth >= 1
          ? await getStructuredSectionFromHtml(entry.target, href)
          : [];
      return {
        title: entry.title || upath.basename(entry.target, '.html'),
        href: encodeURI(upath.relative(distDir, entry.target)),
        sections,
        // TODO
        children: [],
      };
    }),
  );
  const docToc = transformDocumentList(structure)(
    structure.map((doc) => {
      function renderSectionList(
        sections: StructuredDocumentSection[],
      ): HastElement | HastElement[] {
        const nodeList = sections.flatMap((section) => {
          if (section.level > sectionDepth) {
            return [];
          }
          return section;
        });
        if (nodeList.length === 0) {
          return [];
        }
        return transformSectionList(nodeList)(
          nodeList.map((node) => ({
            children: [renderSectionList(node.children || [])].flat(),
          })),
        );
      }
      return {
        children: [renderSectionList(doc.sections || [])].flat(),
      };
    }),
  );

  return toHtml(docToc, { allowDangerousHtml: true });
}

export async function processTocHtml(
  dom: JSDOM,
  {
    manifestPath,
    tocTitle,
    styleOptions = {},
    entries,
    distDir,
    sectionDepth,
    transform,
  }: Parameters<typeof generateTocListSection>[0] & {
    manifestPath: string;
    tocTitle: string;
    styleOptions?: Parameters<typeof getTocHtmlStyle>[0];
  },
): Promise<JSDOM> {
  const { document } = dom.window;
  if (
    !document.querySelector(
      'link[rel="publication"][type="application/ld+json"]',
    )
  ) {
    const l = document.createElement('link');
    l.setAttribute('rel', 'publication');
    l.setAttribute('type', 'application/ld+json');
    l.setAttribute('href', encodeURI(upath.relative(distDir, manifestPath)));
    document.head.append(l);
  }

  const style = document.querySelector('style[data-vv-style]');
  if (style) {
    const textContent = getTocHtmlStyle(styleOptions);
    if (textContent) {
      style.textContent = textContent;
    } else {
      style.remove();
    }
  }

  const nav = document.querySelector('nav, [role="doc-toc"]');
  if (nav && !nav.hasChildNodes()) {
    const h2 = document.createElement('h2');
    h2.textContent = tocTitle;
    nav.append(h2);
    nav.innerHTML += await generateTocListSection({
      entries,
      distDir,
      sectionDepth,
      transform,
    });
  }
  return dom;
}

const getCoverHtmlStyle = ({
  pageBreakBefore,
}: {
  pageBreakBefore?: 'recto' | 'verso' | 'left' | 'right';
}) => `
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

export function generateDefaultCoverHtml({
  language,
  title,
}: {
  language?: string;
  title?: string;
}): string {
  const toc = (
    <html lang={language}>
      <head>
        <meta charset="utf-8" />
        <title>{title || ''}</title>
        <style data-vv-style></style>
      </head>
      <body>
        <section role="region" aria-label="Cover">
          <img role="doc-cover" />
        </section>
      </body>
    </html>
  );
  return toHtml(toc);
}

// oxlint-disable-next-line require-await -- Keep the Promise return type for the await-based call sites
export async function processCoverHtml(
  dom: JSDOM,
  {
    imageSrc,
    imageAlt,
    styleOptions = {},
  }: {
    imageSrc: string;
    imageAlt: string;
    styleOptions?: Parameters<typeof getCoverHtmlStyle>[0];
  },
): Promise<JSDOM> {
  const { document } = dom.window;
  const style = document.querySelector('style[data-vv-style]');
  if (style) {
    const textContent = getCoverHtmlStyle(styleOptions);
    if (textContent) {
      style.textContent = textContent;
    } else {
      style.remove();
    }
  }

  const cover = document.querySelector('img[role="doc-cover"]');
  if (cover && !cover.hasAttribute('src')) {
    cover.setAttribute('src', encodeURI(imageSrc));
  }
  if (cover && !cover.hasAttribute('alt')) {
    cover.setAttribute('alt', imageAlt);
  }
  return dom;
}

// oxlint-disable-next-line require-await -- Keep the Promise return type for the await-based call sites
export async function processManuscriptHtml(
  dom: JSDOM,
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
): Promise<JSDOM> {
  const { document } = dom.window;
  if (title) {
    if (!document.querySelector('title')) {
      const t = document.createElement('title');
      document.head.append(t);
    }
    document.title = title;
  }
  for (const s of style ?? []) {
    const l = document.createElement('link');
    l.setAttribute('rel', 'stylesheet');
    l.setAttribute('type', 'text/css');
    l.setAttribute('href', encodeURI(s));
    document.head.append(l);
  }
  if (language) {
    if (contentType === 'application/xhtml+xml') {
      if (!document.documentElement.getAttribute('xml:lang')) {
        document.documentElement.setAttribute('lang', language);
        document.documentElement.setAttribute('xml:lang', language);
      }
    } else if (!document.documentElement.getAttribute('lang')) {
      document.documentElement.setAttribute('lang', language);
    }
  }
  return dom;
}

export async function fetchLinkedPublicationManifest({
  dom,
  resourceLoader,
  baseUrl,
}: {
  dom: JSDOM;
  resourceLoader: ResourceLoader;
  baseUrl: string;
}): Promise<{ manifest: PublicationManifest; manifestUrl: string } | null> {
  const { document } = dom.window;

  const linkEl = document.querySelector('link[href][rel="publication"]');
  if (!linkEl) {
    return null;
  }
  const hrefAttr = linkEl.getAttribute('href');
  /* v8 ignore next 3 */
  if (hrefAttr === null) {
    throw new Error('Publication manifest link has no href attribute');
  }
  const href = hrefAttr.trim();
  let manifest: PublicationManifest;
  let manifestUrl = baseUrl;
  if (href.startsWith('#')) {
    // oxlint-disable-next-line prefer-query-selector -- Match by raw id without CSS selector escaping
    const scriptEl = document.getElementById(href.slice(1));
    if (scriptEl?.getAttribute('type') !== 'application/ld+json') {
      return null;
    }
    Logger.debug(`Found embedded publication manifest: ${href}`);
    try {
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- validated by assertPubManifestSchema below
      manifest = JSON.parse(scriptEl.innerHTML);
    } catch (error) {
      const thrownError = toError(error);
      throw new DetailError(
        'Failed to parse manifest data',
        typeof thrownError.stack,
      );
    }
  } else {
    Logger.debug(`Found linked publication manifest: ${href}`);
    const url = new URL(href, baseUrl);
    manifestUrl = url.href;
    const buffer = await resourceLoader.fetch(url.href);
    if (!buffer) {
      throw new Error(`Failed to fetch manifest JSON file: ${url.href}`);
    }
    const manifestJson = buffer.toString();
    try {
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- validated by assertPubManifestSchema below
      manifest = JSON.parse(manifestJson);
    } catch (error) {
      const thrownError = toError(error);
      throw new DetailError(
        'Failed to parse manifest data',
        typeof thrownError.stack,
      );
    }
  }

  try {
    assertPubManifestSchema(manifest);
  } catch (error) {
    Logger.logWarn(
      `Publication manifest validation failed. Processing continues, but some problems may occur.\n${String(error)}`,
    );
  }
  return {
    manifest: decodePublicationManifest(manifest),
    manifestUrl,
  };
}

export type TocResourceTreeItem = {
  element: Element;
  label: Element;
  children?: TocResourceTreeItem[];
};
export type TocResourceTreeRoot = {
  element: Element;
  heading?: Element;
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
      return { element, label };
    }
    const children = Array.from(ol.children).reduce<
      TocResourceTreeItem[] | null
    >((acc, val) => {
      if (!acc) {
        return acc;
      }
      const res = parseTocItem(val);
      if (!res) {
        return null;
      }
      acc.push(res);
      return acc;
    }, []);
    return (
      children && {
        element,
        label,
        children,
      }
    );
  };

  let heading: Element | undefined;
  for (const child of Array.from(tocRoot.children)) {
    if (child.tagName === 'OL') {
      const children = Array.from(child.children).reduce<
        TocResourceTreeItem[] | null
      >((acc, val) => {
        if (!acc) {
          return acc;
        }
        const res = parseTocItem(val);
        if (!res) {
          return null;
        }
        acc.push(res);
        return acc;
      }, []);
      return children && { element: tocRoot, heading, children };
    } else if (
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HGROUP'].includes(child.tagName)
    ) {
      heading = child;
    } else {
      return null;
    }
  }
  return null;
}

export type PageListResourceTreeItem = {
  element: Element;
};
export type PageListResourceTreeRoot = {
  element: Element;
  heading?: Element;
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

  let heading: Element | undefined;
  for (const child of Array.from(pageListRoot.children)) {
    if (child.tagName === 'OL') {
      const children = Array.from(child.children).reduce<
        PageListResourceTreeItem[] | null
      >((acc, element) => {
        if (!acc) {
          return acc;
        }
        if (element.tagName !== 'LI') {
          return null;
        }
        acc.push({ element });
        return acc;
      }, []);
      return children && { element: pageListRoot, heading, children };
    } else if (
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HGROUP'].includes(child.tagName)
    ) {
      heading = child;
    } else {
      return null;
    }
  }
  return null;
}
