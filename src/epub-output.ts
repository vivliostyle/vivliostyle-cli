import archiver from 'archiver';
import { XMLBuilder } from 'fast-xml-parser';
import GithubSlugger from 'github-slugger';
import { JSDOM } from 'jsdom';
import languageTags from 'language-tags';
import { lookup as mime } from 'mime-types';
import fs from 'node:fs';
import url from 'node:url';
import path from 'upath';
import { v4 as uuid } from 'uuid';
import serializeToXml from 'w3c-xmlserializer';
import { MergedConfig } from './config.js';
import {
  EPUB_CONTAINER_XML,
  EPUB_NS,
  XML_DECLARATION,
  cliRoot,
} from './const.js';
import {
  PageListResourceTreeRoot,
  TocResourceTreeItem,
  TocResourceTreeRoot,
  parsePageListDocument,
  parseTocDocument,
} from './html.js';
import {
  Contributor,
  PublicationLinks,
  PublicationManifest,
  ResourceCategorization,
} from './schema/publication.schema.js';
import { DetailError, debug, safeGlob } from './util.js';
import { copyWebPublicationAssets } from './webbook.js';

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

export async function exportEpub({
  exportAliases,
  outputs,
  input,
  manifestPath,
  target,
  epubVersion,
}: Pick<MergedConfig, 'exportAliases' | 'outputs'> & {
  input: string;
  manifestPath: string;
  target: string;
  epubVersion: '3.0';
}) {
  debug('Export EPUB');

  // const [tmpDir, clearTmpDir] = await useTmpDirectory();
  const tmpDir = path.join(cliRoot, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const clearTmpDir = () => {};
  fs.mkdirSync(path.join(tmpDir, 'META-INF'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'EPUB'), { recursive: true });

  await copyWebPublicationAssets({
    exportAliases,
    outputs,
    input,
    outputDir: path.join(tmpDir, 'EPUB'),
    manifestPath,
  });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(tmpDir, 'EPUB/publication.json'), 'utf8'),
  ) as PublicationManifest;
  const uid = `urn:uuid:${uuid()}`;

  const htmlFiles = await safeGlob(['**/*.html', '**/*.htm'], {
    cwd: path.join(tmpDir, 'EPUB'),
    ignore: ['publication.json'],
    followSymbolicLinks: false,
    gitignore: false,
  });

  const findPublicationLink = (
    relType: string,
    list?: ResourceCategorization,
  ) =>
    [list]
      .flat()
      .find(
        (e): e is PublicationLinks =>
          typeof e === 'object' && e.rel === relType,
      );
  const tocResource =
    findPublicationLink('contents', manifest.readingOrder) ||
    findPublicationLink('contents', manifest.resources);
  if (!tocResource) {
    // TODO: Generate ToC
    throw new Error();
  }
  const pageListResource =
    findPublicationLink('pagelist', manifest.readingOrder) ||
    findPublicationLink('pagelist', manifest.resources);
  const coverResource = findPublicationLink('cover', manifest.resources);
  const landmarks: { type: string; href: string }[] = [];
  if (coverResource) {
    const href = path.extname(coverResource.url).match(/^\.html?$/)
      ? changeExtname(coverResource.url, '.xhtml')
      : coverResource.url;
    landmarks.push({ type: 'cover', href });
  }

  for (const target of htmlFiles) {
    debug(`Transpiling HTML to XHTML: ${target}`);
    let parseResult: Resolved<ReturnType<typeof transpileHtmlToXhtml>>;
    try {
      parseResult = await transpileHtmlToXhtml({
        target,
        htmlFiles,
        contextDir: path.join(tmpDir, 'EPUB'),
        landmarks,
        tocResource,
        pageListResource,
      });
    } catch (error) {
      const thrownError = error as Error;
      throw new DetailError(
        `Failed to transpile document to XHTML: ${target}`,
        thrownError.stack ?? thrownError.message,
      );
    }
    if (parseResult.tocParseTree) {
      debug(`Generating toc.ncx`);

      fs.writeFileSync(
        path.join(tmpDir, 'EPUB/toc.ncx'),
        buildNcx({ toc: parseResult.tocParseTree, manifest, uid }),
        'utf8',
      );
    }
  }

  // TODO: Use `resources` property of webpub
  const manifestItems = await safeGlob('**', {
    cwd: path.join(tmpDir, 'EPUB'),
    ignore: ['*.opf'],
    followSymbolicLinks: false,
    gitignore: false,
  }).then((files) =>
    files.map<ManifestEntry>((href) => {
      const mediaType = mime(href);
      if (!mediaType) {
        throw new Error(`Unknown mediaType: ${href}`);
      }
      return {
        href,
        mediaType,
        // TODO: Determine `cover-image` item
        properties:
          href === changeExtname(tocResource.url, '.xhtml') ? 'nav' : undefined,
      };
    }),
  );
  const readingOrder = [manifest.readingOrder]
    .flat()
    .filter(Boolean)
    .map((e) => (typeof e === 'string' ? e : e!.url))
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
      manifest,
      readingOrder,
      manifestItems,
      landmarks,
    }),
    'utf8',
  );

  await compressEpub({ target, sourceDir: tmpDir });
  clearTmpDir();
}

async function transpileHtmlToXhtml({
  target,
  htmlFiles,
  contextDir,
  landmarks,
  tocResource,
  pageListResource,
}: {
  target: string;
  htmlFiles: string[];
  contextDir: string;
  landmarks: LandmarkEntry[];
  tocResource: PublicationLinks;
  pageListResource?: PublicationLinks;
}): Promise<{
  tocParseTree?: TocResourceTreeRoot;
  pageListParseTree?: PageListResourceTreeRoot;
}> {
  const absPath = path.join(contextDir, target);
  const htmlFileUrls = htmlFiles.map((p) =>
    url.pathToFileURL(path.join(contextDir, p)),
  );
  const html = await fs.promises.readFile(absPath, 'utf8');
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const htmlElement = document.body.parentElement!;
  htmlElement.setAttribute('xmlns:epub', EPUB_NS);

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

  if (target === tocResource.url) {
    if (!document.querySelector('[epub:type="toc"]')) {
      const parsed = parseTocDocument(dom);
      if (!parsed) {
        throw new Error('Navigation document must have one "toc" nav element');
      }
      tocParseTree = parsed;
      const nav = replaceWithNavElement(parsed.element);
      nav.setAttribute('id', 'toc');
      nav.setAttribute('epub:type', 'toc');
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

  if (target === pageListResource?.url) {
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
    tocParseTree,
    pageListParseTree,
  };
}

function buildEpubPackageDocument({
  epubVersion,
  manifest,
  uid,
  readingOrder,
  manifestItems,
  landmarks,
}: Pick<Parameters<typeof exportEpub>[0], 'epubVersion'> & {
  manifest: PublicationManifest;
  uid: string;
  readingOrder: string[];
  manifestItems: ManifestEntry[];
  landmarks: LandmarkEntry[];
}): string {
  const slugger = new GithubSlugger();
  slugger.reset();

  const bookIdentifier = slugger.slug('bookid');
  const formattedLang = languageTags(
    [manifest.inLanguage ?? 'en'].flat()[0],
  ).format();
  if (!languageTags(formattedLang).valid()) {
    throw languageTags(formattedLang).errors()[0];
  }
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
            '#text': typeof entry === 'string' ? entry : entry.name,
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
      '_xml:lang': formattedLang,
      metadata: {
        '_xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        'dc:identifier': {
          _id: bookIdentifier,
          '#text': uid,
        },
        'dc:title': manifest.name,
        'dc:language': formattedLang,
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
        itemref: readingOrder.map((href) => ({
          _idref: itemIdMap.get(href),
        })),
      },
      guide: {
        reference: [
          {
            _type: 'toc',
            _href: manifestItems.find(({ properties }) => properties === 'nav')!
              .href,
          },
          ...landmarks.map(({ type, href }) => ({ _type: type, _href: href })),
        ],
      },
    },
  });
}

function buildNcx({
  toc,
  manifest,
  uid,
}: {
  toc: TocResourceTreeRoot;
  manifest: PublicationManifest;
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
        text: manifest.name,
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
