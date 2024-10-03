import AdmZip from 'adm-zip';
import { fs as memfs, vol } from 'memfs';
import { format } from 'prettier';
import tmp from 'tmp';
import { afterEach, expect, it, vi } from 'vitest';
import { exportEpub } from '../src/output/epub.js';
import { buildWebPublication } from '../src/output/webbook.js';
import {
  compile,
  copyAssets,
  prepareThemeDirectory,
} from '../src/processor/compile.js';
import { PublicationManifest } from '../src/schema/publication.schema.js';
import { upath } from '../vendors/index.js';
import { getMergedConfig, toTree } from './commandUtil.js';

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

vi.mock('archiver', async () => {
  const { default: archiver } = await vi.importActual<{
    default: typeof import('archiver');
  }>('archiver');
  return {
    default: (...args: Parameters<typeof archiver>) => {
      const archive = archiver(...args);
      archive.directory = (dirpath, destpath) => {
        for (const p in vol.toJSON(dirpath, undefined, true)) {
          archive.append(vol.readFileSync(upath.join(dirpath, p)), {
            name: upath.join(destpath, p),
          });
        }
        return archive;
      };
      return archive;
    },
  };
});

afterEach(() => {
  vol.reset();
  (tmp as any).__count = 0;
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
    manifest,
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
  const entry = file['/tmp/1/EPUB/index.xhtml'];
  expect(await format(entry as string, { parser: 'html' })).toMatchSnapshot(
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
    '/work/input/index.md': '# Hello',
  });
  const config = await getMergedConfig([
    '/work/input/index.md',
    '--output',
    '/work/output.epub',
  ]);
  await compile(config);
  await copyAssets(config);
  await buildWebPublication({
    ...config,
    target: config.outputs[0],
  });

  expect(toTree(vol).replace(/\.vs-[^.]+/g, '.vs-0')).toMatchSnapshot('tree');

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
});

it('generate EPUB from vivliostyle.config.js', async () => {
  vol.fromJSON({
    '/work/input/vivliostyle.config.json': JSON.stringify({
      entry: 'manuscript.md',
      output: './output.epub',
      theme: './my-theme.css',
      toc: true,
    }),
    '/work/input/manuscript.md': '# Hello',
    '/work/input/my-theme.css': '/* theme CSS */',
  });
  const config = await getMergedConfig([
    '-c',
    '/work/input/vivliostyle.config.json',
  ]);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  await buildWebPublication({
    ...config,
    target: config.outputs[0],
  });

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
  const config = await getMergedConfig([
    '/work/input/index.html',
    '--output',
    '/work/output.epub',
  ]);
  await compile(config);
  await copyAssets(config);
  await buildWebPublication({
    ...config,
    target: config.outputs[0],
  });

  const file = vol.toJSON();
  const xhtml = file['/tmp/2/EPUB/index.xhtml'];
  expect(xhtml).toMatch(/epub:type="lot"/);
  expect(xhtml).not.toMatch(/epub:type="toc"/);
  expect(xhtml).not.toMatch(/epub:type="landmarks"/);
});
