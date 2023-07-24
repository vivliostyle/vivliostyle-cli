import type { JSDOM } from '@vivliostyle/jsdom';
import archiver from 'archiver';
import { lookup as lookupLanguage } from 'bcp-47-match';
import chalk from 'chalk';
import { XMLBuilder } from 'fast-xml-parser';
import GithubSlugger from 'github-slugger';
import { lookup as mime } from 'mime-types';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { v4 as uuid } from 'uuid';
import serializeToXml from 'w3c-xmlserializer';
import { EPUB_CONTAINER_XML, EPUB_NS, XML_DECLARATION } from '../const.js';
import {
  PageListResourceTreeRoot,
  TocResourceTreeItem,
  TocResourceTreeRoot,
  getJsdomFromUrlOrFile,
  parsePageListDocument,
  parseTocDocument,
} from '../processor/html.js';
import type {
  Contributor,
  LocalizableStringObject,
  LocalizableStringOrObject,
  PublicationLinks,
  PublicationManifest,
  ResourceCategorization,
} from '../schema/publication.schema.js';
import {
  DetailError,
  copy,
  debug,
  logWarn,
  remove,
  upath,
  useTmpDirectory,
} from '../util.js';

interface ManifestEntry {
  href: string;
  mediaType: string;
  properties?: string;
}

interface LandmarkEntry {
  type: string;
  href: string;
  text: string;
}

const TOC_ID = 'toc';
const LANDMARKS_ID = 'landmarks';
const PAGELIST_ID = 'page-list';

const changeExtname = (filepath: string, newExt: string) => {
  let ext = upath.extname(filepath);
  return `${filepath.slice(0, -ext.length)}${newExt}`;
};

const getRelativeHref = (target: string, baseUrl: string, rootUrl: string) => {
  const absBasePath = upath.join('/', baseUrl);
  const absRootPath = upath.join('/', rootUrl);
  const hrefUrl = new URL(target, pathToFileURL(absBasePath));
  if (hrefUrl.protocol !== 'file:') {
    return target;
  }
  if (/\.html?$/.test(hrefUrl.pathname)) {
    hrefUrl.pathname = changeExtname(hrefUrl.pathname, '.xhtml');
  }
  const pathname = upath.posix.relative(
    pathToFileURL(upath.dirname(absRootPath)).pathname,
    hrefUrl.pathname,
  );
  return `${pathname}${hrefUrl.search}${hrefUrl.hash}`;
};

const normalizeLocalizableString = (
  value: LocalizableStringOrObject | undefined,
  availableLanguages: string[],
): string | undefined => {
  if (!value) {
    return;
  }
  const values = [value]
    .flat()
    .map((value) => (typeof value === 'string' ? { value } : value));
  const localizedValues = values.filter(
    (v): v is LocalizableStringObject & { language: string } => !!v.language,
  );
  const preferredLang = lookupLanguage(
    localizedValues.map((v) => v.language),
    availableLanguages,
  );
  if (preferredLang) {
    return localizedValues[
      localizedValues.findIndex((v) => v.language === preferredLang)
    ].value;
  }
  return values.find((v) => !v.language)?.value;
};

const appendManifestProperty = (entry: ManifestEntry, newProperty: string) => {
  entry.properties = entry.properties
    ? Array.from(new Set([...entry.properties.split(' '), newProperty])).join(
        ' ',
      )
    : newProperty;
};

export async function exportEpub({
  webpubDir,
  entryHtmlFile,
  entryContextUrl,
  manifest,
  target,
  epubVersion,
}: {
  webpubDir: string;
  entryHtmlFile?: string;
  entryContextUrl?: string;
  manifest: PublicationManifest;
  target: string;
  epubVersion: '3.0';
}) {
  debug('Export EPUB', {
    webpubDir,
    entryContextUrl,
    entryHtmlFile,
    target,
    epubVersion,
  });

  const [tmpDir] = await useTmpDirectory();
  fs.mkdirSync(upath.join(tmpDir, 'META-INF'), { recursive: true });
  await copy(webpubDir, upath.join(tmpDir, 'EPUB'));

  const uid = `urn:uuid:${uuid()}`;
  const entryHtmlRelPath =
    entryHtmlFile &&
    upath.relative(webpubDir, upath.resolve(webpubDir, entryHtmlFile));

  const findPublicationLink = (
    relType: string,
    list?: ResourceCategorization,
    filter?: (e: PublicationLinks) => boolean,
  ) =>
    [list]
      .flat()
      .find(
        (e): e is PublicationLinks =>
          typeof e === 'object' && e.rel === relType && (!filter || filter(e)),
      );
  const tocResource =
    findPublicationLink('contents', manifest.readingOrder) ||
    findPublicationLink('contents', manifest.resources);
  const pageListResource =
    findPublicationLink('pagelist', manifest.readingOrder) ||
    findPublicationLink('pagelist', manifest.resources);
  // NOTE: EPUB allows one cover-image item unlike web publication
  // vivliostyle-cli takes the first cover resource.
  const pictureCoverResource = findPublicationLink(
    'cover',
    manifest.resources,
    (e) =>
      ['image/gif', 'image/jpeg', 'image/png', 'image/svg+xml'].includes(
        e.encodingFormat || mime(e.url) || '',
      ),
  );
  const htmlCoverResource = findPublicationLink(
    'cover',
    manifest.resources,
    (e) => /\.html?$/.test(e.url),
  );

  const manifestItem = [
    ...[manifest.links || []].flat(),
    ...[manifest.readingOrder || []].flat(),
    ...[manifest.resources || []].flat(),
  ].reduce((acc, val) => {
    const { url, encodingFormat } =
      typeof val === 'string' ? ({ url: val } as PublicationLinks) : val;
    // Only accepts path-like url
    try {
      new URL(url);
      return acc;
    } catch (e) {
      /* NOOP */
    }
    if (!fs.existsSync(upath.join(tmpDir, 'EPUB', url))) {
      return acc;
    }
    const mediaType = encodingFormat || mime(url) || 'text/plain';
    acc[url] = {
      href: url,
      mediaType,
    };
    if (/\.html?$/.test(url)) {
      acc[url].href = changeExtname(url, '.xhtml');
      acc[url].mediaType = 'application/xhtml+xml';
    }
    if (url === pictureCoverResource?.url) {
      acc[url].properties = 'cover-image';
    }
    return acc;
  }, {} as Record<string, ManifestEntry>);

  const htmlFiles = Object.keys(manifestItem).filter((url) =>
    /\.html?$/.test(url),
  );
  let tocHtml = htmlFiles.find(
    (f) => f === (tocResource?.url || entryHtmlRelPath),
  );
  const readingOrder = [manifest.readingOrder || entryHtmlRelPath]
    .flat()
    .flatMap((v) => (v ? (typeof v === 'string' ? { url: v } : v) : []));
  if (!tocHtml) {
    logWarn(
      chalk.yellowBright(
        'No table of contents document was found. for EPUB output, we recommend to enable `toc` option in your Vivliostyle config file to generate a table of contents document.',
      ),
    );
    tocHtml = readingOrder[0].url;
  }
  if (!(tocHtml in manifestItem)) {
    manifestItem[tocHtml] = {
      href: changeExtname(tocHtml, '.xhtml'),
      mediaType: 'application/xhtml+xml',
    };
  }
  appendManifestProperty(manifestItem[tocHtml], 'nav');

  const landmarks: LandmarkEntry[] = [
    {
      type: 'toc',
      href: `${manifestItem[tocHtml].href}#${TOC_ID}`,
      text: 'Table of Contents',
    },
  ];
  if (htmlCoverResource) {
    landmarks.push({
      type: 'cover',
      href: changeExtname(htmlCoverResource.url, '.xhtml'),
      text: 'Cover Page',
    });
  }

  const processHtml = async (target: string, isTocHtml: boolean) => {
    let parseResult: Resolved<ReturnType<typeof transpileHtmlToXhtml>>;
    try {
      parseResult = await transpileHtmlToXhtml({
        target,
        contextDir: upath.join(tmpDir, 'EPUB'),
        entryContextUrl:
          entryContextUrl || pathToFileURL(upath.join(webpubDir, '/')).href,
        landmarks,
        isTocHtml,
        isPagelistHtml: target === (pageListResource?.url || entryHtmlRelPath),
      });
    } catch (error) {
      const thrownError = error as Error;
      throw new DetailError(
        `Failed to transpile document to XHTML: ${target}`,
        thrownError.stack ?? thrownError.message,
      );
    }
    if (parseResult.hasMathmlContent) {
      appendManifestProperty(manifestItem[target], 'mathml');
    }
    if (parseResult.hasRemoteResources) {
      appendManifestProperty(manifestItem[target], 'remote-resources');
    }
    if (parseResult.hasScriptedContent) {
      appendManifestProperty(manifestItem[target], 'scripted');
    }
    if (parseResult.hasSvgContent) {
      appendManifestProperty(manifestItem[target], 'svg');
    }
    return parseResult;
  };

  debug(`Transpiling ToC HTML to XHTML: ${tocHtml}`);
  const tocProcessResult = await processHtml(tocHtml, true);
  const { document: entryDocument } = tocProcessResult.dom.window;
  const docLanguages = [manifest.inLanguage]
    .flat()
    .filter((v): v is string => Boolean(v));
  if (docLanguages.length === 0) {
    docLanguages.push(entryDocument.documentElement.lang || 'en');
  }
  const docTitle =
    normalizeLocalizableString(manifest.name, docLanguages) ||
    entryDocument.title;
  if (!docTitle) {
    throw new Error('EPUB must have a title of one or more characters');
  }

  for (const target of htmlFiles.filter((f) => f !== tocHtml)) {
    debug(`Transpiling HTML to XHTML: ${target}`);
    await processHtml(target, false);
  }

  let { tocParseTree, linkedPubManifest } = tocProcessResult;
  if (!tocParseTree) {
    tocParseTree = await supplyTocNavElement({
      tocHtml,
      tocDom: tocProcessResult.dom,
      contextDir: upath.join(tmpDir, 'EPUB'),
      readingOrder,
      docLanguages,
    });
  }
  if (linkedPubManifest) {
    await remove(upath.join(tmpDir, 'EPUB', linkedPubManifest));
    delete manifestItem[linkedPubManifest];
  }

  // EPUB/toc.ncx
  fs.writeFileSync(
    upath.join(tmpDir, 'EPUB/toc.ncx'),
    buildNcx({
      toc: tocParseTree,
      docTitle,
      uid,
      tocHtml,
    }),
    'utf8',
  );
  manifestItem['toc.ncx'] = {
    href: 'toc.ncx',
    mediaType: 'application/x-dtbncx+xml',
  };

  // META-INF/container.xml
  fs.writeFileSync(
    upath.join(tmpDir, 'META-INF/container.xml'),
    EPUB_CONTAINER_XML,
    'utf8',
  );

  // EPUB/content.opf
  debug(`Generating content.opf`);
  fs.writeFileSync(
    upath.join(tmpDir, 'EPUB/content.opf'),
    buildEpubPackageDocument({
      epubVersion,
      uid,
      docTitle,
      docLanguages,
      manifest,
      readingOrder,
      manifestItems: Object.values(manifestItem),
      landmarks,
    }),
    'utf8',
  );

  await compressEpub({ target, sourceDir: tmpDir });
}

async function transpileHtmlToXhtml({
  target,
  contextDir,
  entryContextUrl,
  landmarks,
  isTocHtml,
  isPagelistHtml,
}: {
  target: string;
  contextDir: string;
  entryContextUrl: string;
  landmarks: LandmarkEntry[];
  isTocHtml: boolean;
  isPagelistHtml: boolean;
}): Promise<{
  dom: JSDOM;
  tocParseTree?: TocResourceTreeRoot;
  pageListParseTree?: PageListResourceTreeRoot;
  linkedPubManifest?: string;
  hasMathmlContent: boolean;
  hasRemoteResources: boolean;
  hasScriptedContent: boolean;
  hasSvgContent: boolean;
}> {
  const absPath = upath.join(contextDir, target);
  const { dom } = await getJsdomFromUrlOrFile(absPath);
  const { document } = dom.window;
  // `xmlns` will be supplied in later serialization process
  document.documentElement.removeAttribute('xmlns');
  document.documentElement.setAttribute('xmlns:epub', EPUB_NS);

  document.querySelectorAll('a[href]').forEach((el) => {
    const href = el.getAttribute('href')!;
    el.setAttribute('href', getRelativeHref(href, target, target));
  });

  const replaceWithNavElement = (el: Element) => {
    const nav = document.createElement('nav');
    while (el.firstChild) {
      nav.appendChild(el.firstChild);
    }
    for (let i = 0; i < el.attributes.length; i++) {
      nav.attributes.setNamedItem(el.attributes[i].cloneNode() as Attr);
    }
    el.parentNode?.replaceChild(nav, el);
    return nav;
  };

  let tocParseTree: TocResourceTreeRoot | undefined;
  let pageListParseTree: PageListResourceTreeRoot | undefined;
  let linkedPubManifest: string | undefined;

  if (isTocHtml) {
    if (!document.querySelector('[epub:type="toc"]')) {
      const parsed = parseTocDocument(dom);
      if (parsed) {
        tocParseTree = parsed;
        const nav = replaceWithNavElement(parsed.element);
        nav.setAttribute('id', TOC_ID);
        nav.setAttribute('epub:type', 'toc');
      }
    }

    if (
      landmarks.length > 0 &&
      !document.querySelector('[epub:type="landmarks"]')
    ) {
      const nav = document.createElement('nav');
      nav.setAttribute('epub:type', 'landmarks');
      nav.setAttribute('id', LANDMARKS_ID);
      nav.setAttribute('hidden', '');
      const ol = document.createElement('ol');
      for (const { type, href, text } of landmarks) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.setAttribute('epub:type', type);
        a.setAttribute('href', getRelativeHref(href, '', target));
        a.text = text;
        li.appendChild(a);
        ol.appendChild(li);
      }
      nav.appendChild(ol);
      document.body.appendChild(nav);
    }

    // Remove a publication manifest linked to ToC html.
    // When converting to EPUB, HTML files are converted to XHTML files
    // and no longer conform to Web publication, so we need to
    // explicitly remove the publication manifest.
    const publicationLinkEl = document.querySelector(
      'link[href][rel="publication"]',
    );
    if (publicationLinkEl) {
      const href = publicationLinkEl.getAttribute('href')!.trim();
      if (href.startsWith('#')) {
        const scriptEl = document.getElementById(href.slice(1));
        if (scriptEl?.getAttribute('type') === 'application/ld+json') {
          scriptEl.parentNode?.removeChild(scriptEl);
        }
      } else {
        const entryUrl = entryContextUrl;
        const publicationUrl = new URL(href, new URL(target, entryUrl)).href;
        const rootUrl = /^https?:/i.test(entryUrl)
          ? new URL('/', entryUrl).href
          : new URL('.', entryUrl).href;
        const relPublicationPath = upath.relative(rootUrl, publicationUrl);
        if (!relPublicationPath.startsWith('..')) {
          linkedPubManifest = relPublicationPath;
        }
      }
      publicationLinkEl.parentNode?.removeChild(publicationLinkEl);
    }
  }

  if (isPagelistHtml) {
    const parsed = parsePageListDocument(dom);
    if (parsed) {
      pageListParseTree = parsed;
      const nav = replaceWithNavElement(parsed.element);
      nav.setAttribute('id', PAGELIST_ID);
      nav.setAttribute('epub:type', 'page-list');
    }
  }

  const xhtml = `${XML_DECLARATION}\n${serializeToXml(document)}`;
  await fs.promises.writeFile(changeExtname(absPath, '.xhtml'), xhtml, 'utf8');
  await fs.promises.unlink(absPath);
  return {
    dom,
    tocParseTree,
    pageListParseTree,
    linkedPubManifest,
    // FIXME: Yes, I recognize this implementation is inadequate.
    hasMathmlContent: !!document.querySelector('math'),
    hasRemoteResources: !!document.querySelector(
      '[src^="http://"], [src^="https://"]',
    ),
    hasScriptedContent: !!document.querySelector('script, form'),
    hasSvgContent: !!document.querySelector('svg'),
  };
}

async function supplyTocNavElement({
  tocHtml,
  tocDom,
  contextDir,
  readingOrder,
  docLanguages,
}: {
  tocHtml: string;
  tocDom: JSDOM;
  contextDir: string;
  readingOrder: PublicationLinks[];
  docLanguages: string[];
}): Promise<TocResourceTreeRoot> {
  debug(`Generating toc nav element: ${tocHtml}`);
  const absPath = upath.join(contextDir, tocHtml);
  const { document } = tocDom.window;

  const nav = document.createElement('nav');
  nav.setAttribute('id', TOC_ID);
  nav.setAttribute('role', 'doc-toc');
  nav.setAttribute('epub:type', 'toc');
  nav.setAttribute('hidden', '');
  const ol = document.createElement('ol');
  const tocParseTree: TocResourceTreeRoot = {
    element: nav,
    children: [],
  };

  for (const content of readingOrder) {
    let name = normalizeLocalizableString(content.name, docLanguages);
    if (!name) {
      const { dom } = await getJsdomFromUrlOrFile(
        upath.join(contextDir, changeExtname(content.url, '.xhtml')),
      );
      name = dom.window.document.title;
    }
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.textContent = name;
    a.href = getRelativeHref(content.url, '', tocHtml);
    li.appendChild(a);
    ol.appendChild(li);
    tocParseTree.children.push({ element: li, label: a });
  }

  nav.appendChild(ol);
  document.body.appendChild(nav);
  const xhtml = `${XML_DECLARATION}\n${serializeToXml(document)}`;
  await fs.promises.writeFile(changeExtname(absPath, '.xhtml'), xhtml, 'utf8');

  debug('Generated toc nav element', nav.outerHTML);
  return tocParseTree;
}

function buildEpubPackageDocument({
  epubVersion,
  manifest,
  uid,
  docTitle,
  docLanguages,
  readingOrder,
  manifestItems,
  landmarks,
}: Pick<Parameters<typeof exportEpub>[0], 'epubVersion'> & {
  manifest: PublicationManifest;
  uid: string;
  docTitle: string;
  docLanguages: string[];
  readingOrder: PublicationLinks[];
  manifestItems: ManifestEntry[];
  landmarks: LandmarkEntry[];
}): string {
  const slugger = new GithubSlugger();
  slugger.reset();

  const bookIdentifier = slugger.slug('bookid');
  const normalizeDate = (value: string | number | undefined) =>
    value && `${new Date(value).toISOString().split('.')[0]}Z`;

  const transformToGenericTextNode = <T = {}>(value: unknown, attributes?: T) =>
    [value]
      .flat()
      .filter(Boolean)
      .map((v) => ({ ...(attributes || {}), '#text': `${value}` }));
  const transformContributor = (
    contributorMap: Record<string, Contributor | undefined>,
  ) =>
    Object.entries(contributorMap).flatMap(([type, contributor]) =>
      contributor
        ? [contributor].flat().map((entry, index) => ({
            _id: slugger.slug(`${type}-${index + 1}`),
            '#text':
              typeof entry === 'string'
                ? entry
                : normalizeLocalizableString(entry.name, docLanguages),
          }))
        : [],
    );

  const itemIdMap = new Map<string, string>();
  manifestItems.forEach(({ href }) => {
    itemIdMap.set(href, slugger.slug(href));
  });

  const builder = new XMLBuilder({
    format: true,
    ignoreAttributes: false,
    attributeNamePrefix: '_',
  });
  return builder.build({
    '?xml': {
      _version: '1.0',
      _encoding: 'UTF-8',
    },
    package: {
      _xmlns: 'http://www.idpf.org/2007/opf',
      _version: epubVersion,
      '_unique-identifier': bookIdentifier,
      '_xml:lang': docLanguages[0],
      metadata: {
        '_xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        'dc:identifier': {
          _id: bookIdentifier,
          '#text': uid,
        },
        'dc:title': docTitle,
        'dc:language': docLanguages,
        'dc:creator': transformContributor({
          // TODO: Define proper order
          author: manifest.author,
          creator: manifest.creator,
          editor: manifest.editor,
          artist: manifest.artist,
          illustrator: manifest.illustrator,
          colorist: manifest.colorist,
          penciler: manifest.penciler,
          inker: manifest.inker,
          letterer: manifest.letterer,
          translator: manifest.translator,
          readBy: manifest.readBy,
        }),
        'dc:publisher': transformContributor({
          publisher: manifest.publisher,
        }),
        'dc:contributor': transformContributor({
          contributor: manifest.contributor,
        }),
        'dc:date': transformToGenericTextNode(
          normalizeDate(manifest.datePublished),
        ),
        'dc:rights': transformToGenericTextNode(
          manifest.copyrightHolder &&
            `© ${manifest.copyrightYear ? `${manifest.copyrightYear} ` : ''}${
              manifest.copyrightHolder
            }`,
        ),
        'dc:subject': transformToGenericTextNode(
          manifest['dc:subject'] || manifest.subject,
        ),
        meta: transformToGenericTextNode(
          normalizeDate(manifest.dateModified || Date.now()),
          {
            _property: 'dcterms:modified',
          },
        ),
      },
      manifest: {
        item: manifestItems.map(({ href, mediaType, properties }) => ({
          _id: itemIdMap.get(href),
          _href: href,
          '_media-type': mediaType,
          ...(properties ? { _properties: properties } : {}),
        })),
      },
      spine: {
        ...(() => {
          const toc = manifestItems.find(({ href }) => href === 'toc.ncx');
          return toc ? { _toc: itemIdMap.get(toc.href) } : {};
        })(),
        ...(manifest.readingProgression
          ? { '_page-progression-direction': manifest.readingProgression }
          : {}),
        itemref: readingOrder.map(({ url }) => ({
          _idref: itemIdMap.get(changeExtname(url, '.xhtml')),
        })),
      },
      guide: {
        reference: landmarks.map(({ type, href, text }) => ({
          _type: type,
          _href: href,
          _title: text,
        })),
      },
    },
  });
}

function buildNcx({
  toc,
  docTitle,
  uid,
  tocHtml,
}: {
  toc: TocResourceTreeRoot;
  docTitle: string;
  uid: string;
  tocHtml: string;
}): string {
  const slugger = new GithubSlugger();
  slugger.reset();
  // Dummy incremental to increase sequential counts
  slugger.slug('navPoint');

  const transformNavItem = (
    item: TocResourceTreeItem,
  ): Record<string, unknown> => {
    return {
      _id: slugger.slug('navPoint'),
      navLabel: {
        text: (item.label.textContent ?? '').trim(),
      },
      ...(item.label.tagName === 'A' && item.label.getAttribute('href')
        ? {
            content: {
              _src: getRelativeHref(
                item.label.getAttribute('href')!,
                tocHtml,
                '',
              ),
            },
          }
        : {}),
      ...(item.children && item.children.length > 0
        ? {
            navPoint: item.children.map(transformNavItem),
          }
        : {}),
    };
  };

  const builder = new XMLBuilder({
    format: true,
    ignoreAttributes: false,
    attributeNamePrefix: '_',
  });
  return builder.build({
    '?xml': {
      _version: '1.0',
      _encoding: 'UTF-8',
    },
    ncx: {
      _xmlns: 'http://www.daisy.org/z3986/2005/ncx/',
      _version: '2005-1',
      head: {
        meta: [
          { _name: 'dtb:uid', _content: uid },
          { _name: 'dtb:depth', _content: '1' },
          { _name: 'dtb:totalPageCount', _content: '0' },
          { _name: 'dtb:maxPageNumber', _content: '0' },
        ],
      },
      docTitle: {
        text: docTitle,
      },
      navMap: {
        navPoint: toc.children.map(transformNavItem),
      },
    },
  });
}

async function compressEpub({
  target,
  sourceDir,
}: {
  target: string;
  sourceDir: string;
}): Promise<void> {
  const output = fs.createWriteStream(target);
  const archive = archiver('zip', {
    store: true,
  });
  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('warning', reject);
    archive.on('error', reject);
    archive.pipe(output);

    archive.append('application/epub+zip', { name: 'mimetype' });
    archive.directory(upath.join(sourceDir, 'META-INF'), 'META-INF');
    archive.directory(upath.join(sourceDir, 'EPUB'), 'EPUB');
    archive.finalize();
  });
}
