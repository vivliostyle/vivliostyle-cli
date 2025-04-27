// Mocked modules: don't reorder this list
import './mocks/fs.js';
import './mocks/tmp.js';
//
import './mocks/archiver.js';

import AdmZip from 'adm-zip';
import { vol } from 'memfs';
import { format } from 'prettier';
import { beforeEach, expect, it } from 'vitest';
import { exportEpub } from '../src/output/epub.js';
import { decodePublicationManifest } from '../src/output/webbook.js';
import { PublicationManifest } from '../src/schema/publication.schema.js';
import { runCommand, toTree } from './command-util.js';

beforeEach(() => {
  vol.reset();
});

function checkValidEpubZip(epub: Buffer) {
  // Check epub file contains uncompressed mimetype file
  expect(epub.readUInt32BE(0)).toBe(0x504b0304);
  expect(epub.readUInt16LE(8)).toBe(0);
  expect(epub.slice(30, 38).toString()).toBe('mimetype');
  expect(epub.slice(38, 58).toString()).toBe('application/epub+zip');
  // Check the remaining files are compressed
  expect(epub.readUInt32BE(58)).toBe(0x504b0304);
  expect(epub.readUInt16LE(66)).not.toBe(0);
}

it('generate EPUB from single HTML with pub manifest', async () => {
  const manifest: PublicationManifest = {
    '@context': ['https://schema.org', 'https://www.w3.org/ns/pub-context'],
    conformsTo: 'yuno',
    readingProgression: 'rtl',
    resources: [
      { url: 'cover%20image%25.png', rel: 'cover' },
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
    '/work/input/cover image%.png': '',
  });
  await exportEpub({
    webpubDir: '/work/input',
    entryHtmlFile: 'index.html',
    manifest: decodePublicationManifest(manifest),
    relManifestPath: 'publication.json',
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
  const entry = file['/tmp/1/EPUB/index.xhtml']!;
  expect(await format(entry, { parser: 'html' })).toMatchSnapshot(
    'index.xhtml',
  );
});

it('generate EPUB from series of HTML files', async () => {
  const manifest: PublicationManifest = {
    '@context': ['https://schema.org', 'https://www.w3.org/ns/pub-context'],
    conformsTo: 'yuno',
    readingOrder: [
      'src/index.html',
      'src/a/index.html',
      'src/b/c/d.html',
      'src/escape%20check%25.html',
    ],
  };
  vol.fromJSON({
    '/work/input/publication.json': JSON.stringify(manifest),
    '/work/input/src/index.html': /* html */ `
      <html lang="en">
      <head>
        <title>My book</title>
      </head>
      <body>
        <a href="#foo">1</a>
        <a href="a">2</a>
        <a href="./b/c/d/">3</a>
        <a href="./././escape%20check%25.html">3</a>
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
    '/work/input/src/escape check%.html': /* html */ `
      <html lang="en">
      <head>
        <title>日本語</title>
      </head>
      <body></body>
      </html>
    `,
  });
  await exportEpub({
    webpubDir: '/work/input',
    manifest: decodePublicationManifest(manifest),
    relManifestPath: 'publication.json',
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
  const first = file['/tmp/1/EPUB/src/index.xhtml'];
  expect(await format(first as string, { parser: 'html' })).toMatchSnapshot(
    'src/index.xhtml',
  );
});

it('generate EPUB from single Markdown input', async () => {
  vol.fromJSON({
    '/work/input/foo bar%.md': '# 日本語',
  });
  await runCommand(['build', 'input/foo bar%.md', '-o', 'output.epub'], {
    cwd: '/work',
  });
  expect(toTree(vol)).toMatchSnapshot('tree');

  const epub = vol.readFileSync('/work/output.epub') as Buffer;
  checkValidEpubZip(epub);
  const zipFiles = new AdmZip(epub).getEntries();
  expect(
    zipFiles.reduce((acc, z) => {
      acc[z.entryName] = z.getData().toString();
      return acc;
    }, {}),
  ).toEqual({
    mimetype: 'application/epub+zip',
    ...vol.toJSON('/tmp/2', undefined, true),
  });
  const file = vol.toJSON();
  expect(
    file['/tmp/2/EPUB/content.opf']
      ?.replace(/<dc:identifier id="bookid">.+<\/dc:identifier>/g, '')
      .replace(/<meta property="dcterms:modified">.+<\/meta>/g, ''),
  ).toMatchSnapshot('content.opf');
  expect(file['/tmp/2/EPUB/foo bar%.xhtml']).toMatchSnapshot('foo bar%.xhtml');
});

it('generate EPUB from vivliostyle.config.js', async () => {
  vol.fromJSON({
    '/work/input/vivliostyle.config.json': JSON.stringify({
      entry: '日本語.md',
      output: './output.epub',
      theme: './escape check%.css',
      toc: {
        title: 'もくじ',
        htmlPath: 'gen content%/index file%.html',
        sectionDepth: 2,
      },
      cover: {
        src: 'cover image%.png',
        htmlPath: 'gen content%/cover document%.html',
      },
    }),
    '/work/input/日本語.md': `
# 日本語
## Sec. 1.1
### Sec. 1.1.1
    `,
    '/work/input/cover image%.png': '',
    '/work/input/escape check%.css': '/* theme CSS */',
  });
  await runCommand(['build'], { cwd: '/work/input' });

  expect(toTree(vol)).toMatchSnapshot('tree');

  const epub = vol.readFileSync('/work/input/output.epub') as Buffer;
  checkValidEpubZip(epub);
  const zipFiles = new AdmZip(epub).getEntries();
  expect(
    zipFiles.reduce((acc, z) => {
      acc[z.entryName] = z.getData().toString();
      return acc;
    }, {}),
  ).toEqual({
    mimetype: 'application/epub+zip',
    ...vol.toJSON('/tmp/2', undefined, true),
  });
  const file = vol.toJSON();
  expect(
    file['/tmp/2/EPUB/content.opf']
      ?.replace(/<dc:identifier id="bookid">.+<\/dc:identifier>/g, '')
      .replace(/<meta property="dcterms:modified">.+<\/meta>/g, ''),
  ).toMatchSnapshot('content.opf');
  expect(
    file['/tmp/2/EPUB/gen content%/cover document%.xhtml'],
  ).toMatchSnapshot('cover document%.xhtml');
  expect(file['/tmp/2/EPUB/gen content%/index file%.xhtml']).toMatchSnapshot(
    'index file%.xhtml',
  );
});

it('Do not insert nav element to HTML that have nav[epub:type]', async () => {
  vol.fromJSON({
    '/work/input/index.html': /* html */ `
      <html lang="en">
      <head>
        <title>Document</title>
      </head>
      <body>
        <nav epub:type="lot"></nav>
      </body>
      </html>
    `,
  });
  await runCommand(['build', 'index.html', '-o', 'output.epub'], {
    cwd: '/work/input',
  });

  const file = vol.toJSON();
  const xhtml = file['/tmp/2/EPUB/index.xhtml'];
  expect(xhtml).toMatch(/epub:type="lot"/);
  expect(xhtml).not.toMatch(/epub:type="toc"/);
  expect(xhtml).not.toMatch(/epub:type="landmarks"/);
});
