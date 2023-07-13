import { globby } from 'globby';
import { JSDOM } from 'jsdom';
import assert from 'node:assert';
import fs from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { MergedConfig } from '../src/input/config.js';
import { compile, prepareThemeDirectory } from '../src/processor/compile.js';
import { generateTocHtml } from '../src/processor/html.js';
import { removeSync } from '../src/util.js';
import {
  assertSingleItem,
  getMergedConfig,
  resolveFixture,
} from './commandUtil';

function assertManifestPath(
  config: MergedConfig,
): asserts config is MergedConfig & { manifestPath: string } {
  assert(!!config.manifestPath);
}

afterAll(() => {
  [
    resolveFixture('toc/.vs-valid.1'),
    resolveFixture('toc/.vs-valid.2'),
    resolveFixture('toc/.vs-valid.3'),
  ].forEach((f) => removeSync(f));
});

it('generateTocHtml', () => {
  const toc = generateTocHtml({
    entries: [{ target: 'test.html', title: 'Title' }],
    manifestPath: '.vivliostyle/publication.json',
    distDir: '.vivliostyle',
    title: 'Book title',
    tocTitle: 'Table of Contents',
  });
  expect(toc).toBe(
    `<html>
  <head>
    <title>Book title</title>
    <link
      href="publication.json"
      rel="publication"
      type="application/ld+json"
    />
  </head>
  <body>
    <h1>Book title</h1>
    <nav id="toc" role="doc-toc">
      <h2>Table of Contents</h2>
      <ol>
        <li><a href="../test.html">Title</a></li>
      </ol>
    </nav>
  </body>
</html>
`,
  );
});

it('toc: true', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('toc/toc.valid.1.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  await prepareThemeDirectory(config);
  await compile(config);
  const fileList = await globby('**', {
    cwd: resolveFixture('toc/.vs-valid.1'),
  });
  expect(new Set(fileList)).toEqual(
    new Set(['a.html', 'b.html', 'c.html', 'index.html', 'publication.json']),
  );
  const { default: manifest } = await import(
    resolveFixture('toc/.vs-valid.1/publication.json')
  );
  expect(manifest.readingOrder[0]).toEqual({
    rel: 'contents',
    name: 'Table of Contents',
    type: 'LinkedResource',
    url: 'index.html',
  });
  const tocHtml = new JSDOM(
    fs.readFileSync(resolveFixture('toc/.vs-valid.1/index.html'), 'utf8'),
  );
  const { document } = tocHtml.window;
  expect(document.querySelector('title')!.text).toBe('yuno');
  expect(
    document.querySelector('link[rel="publication"]')!.getAttribute('href'),
  ).toBe('publication.json');
  const h1 = document.querySelector('body > h1')!;
  expect(h1.innerHTML).toBe('yuno');
  const h2 = document.querySelector('nav[role="doc-toc"] > h2')!;
  expect(h2.innerHTML).toBe('Table of Contents');
  const li = document.querySelectorAll('nav[role="doc-toc"] > ol > li')!;
  expect(li).toHaveLength(3);
  expect(li.item(0).innerHTML).toBe('<a href="a.html">A</a>');
  expect(li.item(1).innerHTML).toBe('<a href="b.html">B</a>');
  expect(li.item(2).innerHTML).toBe('<a href="c.html">C</a>');
});

it("toc: 'manuscript/contents.html'", async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('toc/toc.valid.2.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  await prepareThemeDirectory(config);
  await compile(config);
  const fileList = await globby('**', {
    cwd: resolveFixture('toc/.vs-valid.2'),
  });
  expect(new Set(fileList)).toMatchObject(
    new Set([
      'manuscript/a.html',
      'manuscript/b.html',
      'manuscript/c.html',
      'manuscript/contents.html',
      'publication.json',
    ]),
  );
  const { default: manifest } = await import(
    resolveFixture('toc/.vs-valid.2/publication.json')
  );
  expect(manifest.readingOrder[3]).toEqual({
    rel: 'contents',
    name: 'もくじ',
    type: 'LinkedResource',
    url: 'manuscript/contents.html',
  });
  const tocHtml = new JSDOM(
    fs.readFileSync(
      resolveFixture('toc/.vs-valid.2/manuscript/contents.html'),
      'utf8',
    ),
  );
  const { document } = tocHtml.window;
  expect(document.querySelector('title')!.text).toBe('yuno');
  expect(
    document.querySelector('link[rel="publication"]')!.getAttribute('href'),
  ).toBe('../publication.json');
  const h1 = document.querySelector('body > h1')!;
  expect(h1.innerHTML).toBe('yuno');
  const h2 = document.querySelector('nav[role="doc-toc"] > h2')!;
  expect(h2.innerHTML).toBe('もくじ');
  const li = document.querySelectorAll('nav[role="doc-toc"] > ol > li')!;
  expect(li).toHaveLength(3);
  expect(li.item(0).innerHTML).toBe('<a href="a.html">A</a>');
  expect(li.item(1).innerHTML).toBe('<a href="b.html">B</a>');
  expect(li.item(2).innerHTML).toBe('<a href="c.html">C</a>');
});

it('Write ToC by myself', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('toc/toc.valid.3.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  await prepareThemeDirectory(config);
  await compile(config);
  const fileList = await globby('**', {
    cwd: resolveFixture('toc/.vs-valid.3'),
  });
  expect(new Set(fileList)).toMatchObject(
    new Set([
      'manuscript/a.html',
      'manuscript/b.html',
      'manuscript/c.html',
      'manuscript/ToC.html',
      'publication.json',
      'sample-theme.css',
      'themes/package-lock.json',
      'themes/package.json',
      'themes/packages/debug-theme/additional-theme.css',
      'themes/packages/debug-theme/package.json',
      'themes/packages/debug-theme/theme.css',
    ]),
  );
  const { default: manifest } = await import(
    resolveFixture('toc/.vs-valid.3/publication.json')
  );
  expect(manifest.readingOrder[0]).toEqual({
    rel: 'contents',
    name: 'Hand-written ToC',
    type: 'LinkedResource',
    url: 'manuscript/ToC.html',
  });
  const tocHtml = new JSDOM(
    fs.readFileSync(
      resolveFixture('toc/.vs-valid.3/manuscript/ToC.html'),
      'utf8',
    ),
  );
  const { document } = tocHtml.window;
  expect(document.querySelector('title')!.text).toBe('Hand-written ToC');
  expect(
    document.querySelector('link[rel="stylesheet"]')!.getAttribute('href'),
  ).toBe('../sample-theme.css');
});

it('check ToC overwrite violation', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('toc/toc.invalid.1.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  expect(async () => {
    await compile(config);
  }).rejects.toThrow();
});
