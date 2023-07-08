import archiver from 'archiver';
import { lookup as lookupLanguage } from 'bcp-47-match';
import { XMLBuilder } from 'fast-xml-parser';
import GithubSlugger from 'github-slugger';
import type { JSDOM } from 'jsdom';
import { lookup as mime } from 'mime-types';
import fs from 'node:fs';
import url from 'node:url';
import shelljs from 'shelljs';
import path from 'upath';
import { v4 as uuid } from 'uuid';
import serializeToXml from 'w3c-xmlserializer';
import {
  EPUB_CONTAINER_XML,
  EPUB_NS,
  XML_DECLARATION,
  cliRoot,
} from '../const.js';
import {
  PageListResourceTreeRoot,
  TocResourceTreeItem,
  TocResourceTreeRoot,
  getJsdomFromUrlOrFile,
  parsePageListDocument,
  parseTocDocument,
} from '../processor/html.js';
import {
  Contributor,
  LocalizableStringObject,
  LocalizableStringOrObject,
  PublicationLinks,
  PublicationManifest,
  ResourceCategorization,
} from '../schema/publication.schema.js';
import { DetailError, debug } from '../util.js';

interface ManifestEntry {
  href: string;
  mediaType: string;
  properties?: string;
}

interface LandmarkEntry {
  type: string;
  href: string;
}

const changeExtname = (filepath: string, newExt: string) => {
  let ext = path.extname(filepath);
  return `${filepath.slice(0, -ext.length)}${newExt}`;
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

export async function exportEpub({
  webpubDir,
  entryHtmlFile,
  manifest,
  target,
  epubVersion,
}: {
  webpubDir: string;
  entryHtmlFile?: string;
  manifest: PublicationManifest;
  target: string;
  epubVersion: '3.0';
}) {
  debug('Export EPUB');

  // const [tmpDir, clearTmpDir] = await useTmpDirectory();
  const tmpDir = path.join(cliRoot, 'tmp');
  shelljs.rm('-rf', tmpDir);
  fs.mkdirSync(path.join(tmpDir, 'META-INF'), { recursive: true });
  shelljs.cp('-rf', webpubDir, path.join(tmpDir, 'EPUB'));

  const uid = `urn:uuid:${uuid()}`;
  const entryHtmlRelPath =
    entryHtmlFile &&
    path.relative(webpubDir, path.resolve(webpubDir, entryHtmlFile));

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

  const landmarks: { type: string; href: string }[] = [];
  if (htmlCoverResource) {
    landmarks.push({
      type: 'cover',
      href: changeExtname(htmlCoverResource.url, '.xhtml'),
    });
  }

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
    if (!fs.existsSync(path.join(tmpDir, 'EPUB', url))) {
      return acc;
    }
    const mediaType = encodingFormat || mime(url);
    if (!mediaType) {
      throw new Error(`Unknown mediaType: ${url}`);
    }
    acc[url] = {
      href: url,
      mediaType,
    };
    if (/\.html?$/.test(url)) {
      acc[url].href = changeExtname(url, '.xhtml');
      acc[url].mediaType = 'application/xhtml+xml';
    }
    if (url === (tocResource?.url || entryHtmlRelPath)) {
      acc[url].properties = 'nav';
    } else if (url === pictureCoverResource?.url) {
      acc[url].properties = 'cover-image';
    }
    return acc;
  }, {} as Record<string, ManifestEntry>);
  if (
    entryHtmlRelPath &&
    Object.values(manifestItem).every(
      ({ properties }) => !properties?.split(' ').includes('nav'),
    )
  ) {
    manifestItem[entryHtmlRelPath] = {
      href: changeExtname(entryHtmlRelPath, '.xhtml'),
      mediaType: 'application/xhtml+xml',
      properties: 'nav',
    };
  }

  const htmlFiles = Object.keys(manifestItem).filter((url) =>
    /\.html?$/.test(url),
  );
  const tocHtml = htmlFiles.find(
    (f) => f === (tocResource?.url || entryHtmlRelPath),
  );
  if (!tocHtml) {
    throw new Error('EPUB must have one ToC document or entry HTML');
  }

  const processHtml = async (target: string, isTocHtml: boolean) => {
    let parseResult: Resolved<ReturnType<typeof transpileHtmlToXhtml>>;
    try {
      parseResult = await transpileHtmlToXhtml({
        target,
        htmlFiles,
        contextDir: path.join(tmpDir, 'EPUB'),
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
    const appendProperty = (name: string) => {
      const obj = manifestItem[target];
      obj.properties = [obj.properties, name].filter(Boolean).join(' ');
    };
    if (parseResult.hasMathmlContent) {
      appendProperty('mathml');
    }
    if (parseResult.hasRemoteResources) {
      appendProperty('remote-resources');
    }
    if (parseResult.hasScriptedContent) {
      appendProperty('scripted');
    }
    if (parseResult.hasSvgContent) {
      appendProperty('svg');
    }
    return parseResult;
  };

  debug(`Transpiling ToC HTML to XHTML: ${tocHtml}`);
  const { dom, tocParseTree } = await processHtml(tocHtml, true);
  const { document: entryDocument } = dom.window;
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
  if (tocParseTree) {
    debug(`Generating toc.ncx`);
    fs.writeFileSync(
      path.join(tmpDir, 'EPUB/toc.ncx'),
      buildNcx({
        toc: tocParseTree,
        docTitle,
        uid,
      }),
      'utf8',
    );
    manifestItem['toc.ncx'] = {
      href: 'toc.ncx',
      mediaType: 'application/x-dtbncx+xml',
    };
  }

  for (const target of htmlFiles.filter((f) => f !== tocHtml)) {
    debug(`Transpiling HTML to XHTML: ${target}`);
    await processHtml(target, false);
  }

  const readingOrder = [manifest.readingOrder || entryHtmlRelPath]
    .flat()
    .filter((v): v is string | PublicationLinks => Boolean(v))
    .map((e) => (typeof e === 'string' ? e : e.url))
    .map((p) => (htmlFiles.includes(p) ? changeExtname(p, '.xhtml') : p));

  // META-INF/container.xml
  fs.writeFileSync(
    path.join(tmpDir, 'META-INF/container.xml'),
    EPUB_CONTAINER_XML,
    'utf8',
  );

  // EPUB/content.opf
  debug(`Generating content.opf`);
  fs.writeFileSync(
    path.join(tmpDir, 'EPUB/content.opf'),
    buildEpubPackageDocument({
      epubVersion,
      uid,
      docTitle,
      docLanguages,
      tocXhtml: manifestItem[tocHtml].href,
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
  htmlFiles,
  contextDir,
  landmarks,
  isTocHtml,
  isPagelistHtml,
}: {
  target: string;
  htmlFiles: string[];
  contextDir: string;
  landmarks: LandmarkEntry[];
  isTocHtml: boolean;
  isPagelistHtml: boolean;
}): Promise<{
  dom: JSDOM;
  tocParseTree?: TocResourceTreeRoot;
  pageListParseTree?: PageListResourceTreeRoot;
  hasMathmlContent: boolean;
  hasRemoteResources: boolean;
  hasScriptedContent: boolean;
  hasSvgContent: boolean;
}> {
  const absPath = path.join(contextDir, target);
  const htmlFileUrls = htmlFiles.map((p) =>
    url.pathToFileURL(path.join(contextDir, p)),
  );
  const { dom } = await getJsdomFromUrlOrFile(absPath);
  const { document } = dom.window;
  document.documentElement.setAttribute('xmlns:epub', EPUB_NS);

  document.querySelectorAll('a[href]').forEach((el) => {
    const href = el.getAttribute('href')!;
    const hrefUrl = new URL(href, url.pathToFileURL(absPath));
    if (
      htmlFileUrls.some(
        (url) =>
          url.pathname === hrefUrl.pathname ||
          changeExtname(url.pathname, '') === hrefUrl.pathname,
      )
    ) {
      hrefUrl.pathname = changeExtname(hrefUrl.pathname, '.xhtml');
    }
    const pathname = path.posix.relative(
      url.pathToFileURL(path.dirname(absPath)).pathname,
      hrefUrl.pathname,
    );
    el.setAttribute('href', `${pathname}${hrefUrl.search}${hrefUrl.hash}`);
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

  if (isTocHtml) {
    if (!document.querySelector('[epub:type="toc"]')) {
      const parsed = parseTocDocument(dom);
      if (parsed) {
        tocParseTree = parsed;
        const nav = replaceWithNavElement(parsed.element);
        nav.setAttribute('id', 'toc');
        nav.setAttribute('epub:type', 'toc');
      } else {
        // Insert single document toc
        const nav = document.createElement('nav');
        nav.setAttribute('id', 'toc');
        nav.setAttribute('role', 'doc-toc');
        nav.setAttribute('epub:type', 'toc');
        nav.setAttribute('hidden', '');
        nav.innerHTML = '<ol><li></li></ol>';
        const a = document.createElement('a');
        a.textContent = document.title;
        a.href = changeExtname(target, '.xhtml');
        nav.querySelector('li')!.appendChild(a);
        document.body.appendChild(nav);
        tocParseTree = {
          element: nav,
          children: [
            {
              element: nav.querySelector('li')!,
              label: a,
            },
          ],
        };
      }
    }

    if (
      landmarks.length > 0 &&
      !document.querySelector('[epub:type="landmarks"]')
    ) {
      const nav = document.createElement('nav');
      nav.setAttribute('epub:type', 'landmarks');
      nav.setAttribute('id', 'landmarks');
      nav.setAttribute('hidden', '');
      const ol = document.createElement('ol');
      for (const { type, href } of landmarks) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.setAttribute('epub:type', type);
        a.setAttribute('href', href);
        li.appendChild(a);
        ol.appendChild(li);
      }
      nav.appendChild(ol);
      document.body.appendChild(nav);
    }
  }

  if (isPagelistHtml) {
    const parsed = parsePageListDocument(dom);
    if (parsed) {
      pageListParseTree = parsed;
      const nav = replaceWithNavElement(parsed.element);
      nav.setAttribute('id', 'page-list');
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
    // FIXME: Yes, I recognize this implementation is inadequate.
    hasMathmlContent: !!document.querySelector('math'),
    hasRemoteResources: !!document.querySelector(
      '[src^="http://"], [src^="https://"]',
    ),
    hasScriptedContent: !!document.querySelector('script, form'),
    hasSvgContent: !!document.querySelector('svg'),
  };
}

function buildEpubPackageDocument({
  epubVersion,
  manifest,
  uid,
  docTitle,
  docLanguages,
  tocXhtml,
  readingOrder,
  manifestItems,
  landmarks,
}: Pick<Parameters<typeof exportEpub>[0], 'epubVersion'> & {
  manifest: PublicationManifest;
  uid: string;
  docTitle: string;
  docLanguages: string[];
  tocXhtml: string;
  readingOrder: string[];
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
        itemref: readingOrder.map((href) => ({
          _idref: itemIdMap.get(href),
        })),
      },
      guide: {
        reference: [
          {
            _type: 'toc',
            _href: manifestItems.find((v) => v.href === tocXhtml)!.href,
          },
          ...landmarks.map(({ type, href }) => ({ _type: type, _href: href })),
        ],
      },
    },
  });
}

function buildNcx({
  toc,
  docTitle,
  uid,
}: {
  toc: TocResourceTreeRoot;
  docTitle: string;
  uid: string;
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
              _src: item.label.getAttribute('href'),
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
    archive.directory(path.join(sourceDir, 'META-INF'), 'META-INF');
    archive.directory(path.join(sourceDir, 'EPUB'), 'EPUB');
    archive.finalize();
  });
}
