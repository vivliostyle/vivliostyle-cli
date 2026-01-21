import jsdom, {
  type AbortablePromise,
  ResourceLoader as BaseResourceLoader,
  JSDOM,
  VirtualConsole,
} from '@vivliostyle/jsdom';
import DOMPurify, { type WindowLike } from 'dompurify';
import { fileURLToPath, pathToFileURL } from 'node:url';
import upath from 'upath';
import MIMEType from 'whatwg-mimetype';
import type { StructuredDocumentSection } from '../config/schema.js';
import { Logger } from '../logger.js';
import { decodePublicationManifest } from '../output/webbook.js';
import type { PublicationManifest } from '../schema/publication.schema.js';
import {
  DetailError,
  assertPubManifestSchema,
  isValidUri,
  writeFileIfChanged,
} from '../util.js';

export const createVirtualConsole = (onError: (error: DetailError) => void) => {
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

export const htmlPurify = DOMPurify(
  // @ts-expect-error: jsdom.DOMWindow should have trustedTypes property
  new JSDOM('').window as WindowLike,
);

export class ResourceLoader extends BaseResourceLoader {
  static dataUrlOrigin = 'http://localhost/' as const;

  fetcherMap = new Map<string, jsdom.AbortablePromise<Buffer>>();

  fetch(url: string, options?: jsdom.FetchOptions) {
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
  }) {
    const rootHref = rootUrl.startsWith('data:')
      ? ResourceLoader.dataUrlOrigin
      : /^https?:/i.test(rootUrl)
        ? new URL('/', rootUrl).href
        : new URL('.', rootUrl).href;

    const normalizeToLocalPath = (urlString: string, mimeType?: string) => {
      let url = new URL(urlString);
      url.hash = '';
      if (mimeType === 'text/html' && !/\.html?$/.test(url.pathname)) {
        url.pathname = `${url.pathname.replace(/\/$/, '')}/index.html`;
      }
      let relTarget = upath.relative(rootHref, url.href);
      return decodeURI(relTarget);
    };

    const fetchedResources: { url: string; encodingFormat?: string }[] = [];
    await Promise.allSettled(
      [...fetcherMap.entries()].flatMap(async ([url, fetcher]) => {
        if (!url.startsWith(rootHref)) {
          return [];
        }
        return (
          fetcher
            .then(async (buffer) => {
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
}) {
  const url = isValidUri(src) ? new URL(src) : pathToFileURL(src);
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
      /;base64$/i.test(head) ? 'base64' : 'utf8',
    );
    const dummyUrl = `${ResourceLoader.dataUrlOrigin}index.html`;
    if (resourceLoader) {
      let timeoutId: ReturnType<typeof setTimeout>;
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
  contentType,
  virtualConsole = createVirtualConsole((error) => {
    throw error;
  }),
}: {
  html: string;
  contentType?: 'text/html' | 'application/xhtml+xml';
  virtualConsole?: VirtualConsole;
}) {
  return new JSDOM(html, {
    virtualConsole,
    contentType,
  });
}

export async function getStructuredSectionFromHtml(
  htmlPath: string,
  href?: string,
) {
  const dom = await getJsdomFromUrlOrFile({ src: htmlPath });
  const { document } = dom.window;
  const allHeadings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    .filter((el) => {
      // Exclude headings contained by blockquote
      // TODO: Make customizable
      return !el.matches('blockquote *');
    })
    .sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      return position & 2 /* DOCUMENT_POSITION_PRECEDING */
        ? 1
        : position & 4 /* DOCUMENT_POSITION_FOLLOWING */
          ? -1
          : 0;
    });

  function traverse(headers: Element[]): StructuredDocumentSection[] {
    if (headers.length === 0) {
      return [];
    }
    const [head, ...tail] = headers;
    const section = head.parentElement!;
    const id = head.id || section.id;
    const level = Number(head.tagName.slice(1));
    let i = tail.findIndex((s) => Number(s.tagName.slice(1)) <= level);
    i = i === -1 ? tail.length : i;
    return [
      {
        headingHtml: htmlPurify.sanitize(head.innerHTML),
        headingText: head.textContent?.trim().replace(/\s+/g, ' ') || '',
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
  const href = linkEl.getAttribute('href')!.trim();
  let manifest: PublicationManifest;
  let manifestUrl = baseUrl;
  if (href.startsWith('#')) {
    const scriptEl = document.getElementById(href.slice(1));
    if (scriptEl?.getAttribute('type') !== 'application/ld+json') {
      return null;
    }
    Logger.debug(`Found embedded publication manifest: ${href}`);
    try {
      manifest = JSON.parse(scriptEl.innerHTML);
    } catch (error) {
      const thrownError = error as Error;
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
      manifest = JSON.parse(manifestJson);
    } catch (error) {
      const thrownError = error as Error;
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
      `Publication manifest validation failed. Processing continues, but some problems may occur.\n${error}`,
    );
  }
  return {
    manifest: decodePublicationManifest(manifest),
    manifestUrl,
  };
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
