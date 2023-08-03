import { fs as memfs, vol } from 'memfs';
import { format } from 'prettier';
import tmp from 'tmp';
import { afterEach, expect, it, vi } from 'vitest';
import { exportEpub } from '../src/output/epub.js';
import { PublicationManifest } from '../src/schema/publication.schema.js';
import { toTree } from './commandUtil.js';

vi.mock('node:fs', () => ({ ...memfs, default: memfs }));

vi.mock('@vivliostyle/jsdom', () =>
  import('./commandUtil.js').then(({ getMockedJSDOM }) => getMockedJSDOM()),
);

vi.mock('tmp', () => {
  const mod = {
    __count: 0,
    dir: (_, cb) => {
      const target = `/tmp/${++mod.__count}`;
      memfs.mkdirSync(target, { recursive: true });
      cb(null, target);
    },
  };
  return { default: mod };
});

afterEach(() => {
  vol.reset();
  (tmp as any).__count = 0;
});

it('generate EPUB from single HTML with pub manifest', async () => {
  const manifest: PublicationManifest = {
    '@context': ['https://schema.org', 'https://www.w3.org/ns/pub-context'],
    conformsTo: 'yuno',
    readingProgression: 'rtl',
    resources: [
      { url: 'cover.png', rel: 'cover' },
      { url: 'index.html', rel: 'pagelist' },
    ],
    author: {
      name: [
        { value: 'Kenji Miyazawa', language: 'en' },
        { value: '宮沢賢治', language: 'ja' },
      ],
    },
    creator: ['foo', 'bar'],
    editor: 'baz',
    artist: 'a',
    illustrator: 'i',
    colorist: 'x',
    penciler: 'q',
    inker: 'c',
    letterer: 'b',
    translator: 'l',
    readBy: 'o',
    publisher: { name: 'Publisher', type: 'Organization' },
    contributor: 'Contributor',
    copyrightHolder: 'Acme Corporation',
    copyrightYear: '2023',
    subject: 'Subject',
  };
  vol.fromJSON({
    '/work/input/publication.json': JSON.stringify(manifest),
    '/work/input/index.html': /* html */ `
      <html lang="ja-JP">
      <head>
        <title>Document</title>
        <link rel="stylesheet" type="text/css" href="assets/style.css">
        <link rel="publication" type="application/ld+json" href="publication.json">
      </head>
      <body>
        <div role="doc-toc">
          <h1>Table of Contents</h1>
          <ol>
            <li><a href="#intro">Intro</a></li>
            <li>
              <a href="#main">Main</a>
              <ol>
                <li><a href="#main-1">Main 1</a></li>
                <li><a href="#main-2">Main 2</a></li>
              </ol>
            </li>
          </ol>
        </div>
        <div role="doc-pagelist">
          <ol>
            <li><a href="#intro">Intro</a></li>
            <li><a href="#main">Main</a></li>
            <li><a href="#main-1">Main 1</a></li>
            <li><a href="#main-2">Main 2</a></li>
          </ol>
        </div>
        <math></math>
        <svg></svg>
        <script src="https://example.com/remote-script.js"></script>
      </body>
      </html>
    `,
    '/work/input/cover.png': '',
  });
  await exportEpub({
    webpubDir: '/work/input',
    entryHtmlFile: 'index.html',
    entryContextUrl: 'file://work/input/publication.json',
    manifest,
    target: '/work/output.epub',
    epubVersion: '3.0',
  });

  expect(toTree(vol)).toMatchSnapshot('tree');
  const file = vol.toJSON();
  expect(file['/tmp/1/META-INF/container.xml']).toMatchSnapshot(
    'container.xml',
  );
  expect(
    file['/tmp/1/EPUB/content.opf']
      ?.replace(/<dc:identifier id="bookid">.+<\/dc:identifier>/g, '')
      .replace(/<meta property="dcterms:modified">.+<\/meta>/g, ''),
  ).toMatchSnapshot('content.opf');
  expect(
    file['/tmp/1/EPUB/toc.ncx']?.replace(
      /<meta name="dtb:uid" content=".+"><\/meta>/g,
      '',
    ),
  ).toMatchSnapshot('toc.ncx');
  const entry = file['/tmp/1/EPUB/index.xhtml'];
  expect(format(entry as string, { parser: 'html' })).toMatchSnapshot(
    'index.xhtml',
  );
});

it('generate EPUB from series of HTML files', async () => {
  const manifest: PublicationManifest = {
    '@context': ['https://schema.org', 'https://www.w3.org/ns/pub-context'],
    conformsTo: 'yuno',
    readingOrder: ['src/index.html', 'src/a/index.html', 'src/b/c/d.html'],
  };
  vol.fromJSON({
    '/work/input/src/index.html': /* html */ `
      <html lang="en">
      <head>
        <title>My book</title>
      </head>
      <body>
        <a href="#foo">1</a>
        <a href="a">2</a>
        <a href="./b/c/d/">3</a>
      </body>
      </html>
    `,
    '/work/input/src/a/index.html': /* html */ `
      <html lang="en">
      <head>
        <title>yuno</title>
      </head>
      <body>
      </body>
      </html>
    `,
    '/work/input/src/b/c/d.html': /* html */ `
      <html lang="en">
      <head>
        <title>yunocchi</title>
      </head>
      <body></body>
      </html>
    `,
  });
  await exportEpub({
    webpubDir: '/work/input',
    manifest,
    target: '/work/output.epub',
    epubVersion: '3.0',
  });

  expect(toTree(vol)).toMatchSnapshot('tree');
  const file = vol.toJSON();
  expect(
    file['/tmp/1/EPUB/content.opf']
      ?.replace(/<dc:identifier id="bookid">.+<\/dc:identifier>/g, '')
      .replace(/<meta property="dcterms:modified">.+<\/meta>/g, ''),
  ).toMatchSnapshot('content.opf');
  expect(
    file['/tmp/1/EPUB/toc.ncx']?.replace(
      /<meta name="dtb:uid" content=".+"><\/meta>/g,
      '',
    ),
  ).toMatchSnapshot('toc.ncx');
  const first = file['/tmp/1/EPUB/src/index.xhtml'];
  expect(format(first as string, { parser: 'html' })).toMatchSnapshot(
    'src/index.xhtml',
  );
});

it('generate EPUB with a hidden cover document', async () => {
  const manifest: PublicationManifest = {
    '@context': ['https://schema.org', 'https://www.w3.org/ns/pub-context'],
    conformsTo: 'yuno',
    readingOrder: ['src/index.html', 'src/a.html'],
    resources: [
      {
        rel: 'cover',
        type: 'LinkedResource',
        url: 'cover.html',
        encodingFormat: 'text/html',
      },
      {
        rel: 'cover',
        url: 'cover.png',
        encodingFormat: 'image/png',
      },
    ],
  };
  vol.fromJSON({
    '/work/input/src/index.html': /* html */ `
      <html lang="en">
      <head>
        <title>yuno</title>
      </head>
      <body>
        <nav role="doc-toc">
          <ol><li><a href="a.html">A</a></li></ol>
        </nav>
      </body>
      </html>
    `,
    '/work/input/src/a.html': /* html */ `<html lang="en"><head><title></title></head><body></body></html>`,
    '/work/input/cover.html': /* html */ `<html lang="en"><head><title></title></head><body></body></html>`,
    '/work/input/cover.png': '',
  });
  await exportEpub({
    webpubDir: '/work/input',
    manifest,
    target: '/work/output.epub',
    epubVersion: '3.0',
  });

  expect(toTree(vol)).toMatchSnapshot('tree');
  const file = vol.toJSON();
  expect(
    file['/tmp/1/EPUB/content.opf']
      ?.replace(/<dc:identifier id="bookid">.+<\/dc:identifier>/g, '')
      .replace(/<meta property="dcterms:modified">.+<\/meta>/g, ''),
  ).toMatchSnapshot('content.opf');
});
