import { JSDOM } from '@vivliostyle/jsdom';
import fs from 'node:fs';
import { glob } from 'tinyglobby';
import { expect, it } from 'vitest';
import {
  compile,
  copyAssets,
  prepareThemeDirectory,
} from '../src/processor/compile.js';
import {
  generateDefaultCoverHtml,
  processCoverHtml,
} from '../src/processor/html.js';
import {
  assertSingleItem,
  getMergedConfig,
  resolveFixture,
} from './command-util';

it('generateCoverHtml', async () => {
  let content = generateDefaultCoverHtml({
    title: 'Book title',
    language: 'ja',
  });
  content = await processCoverHtml(content, {
    imageSrc: './escape check%.jpg',
    imageAlt: 'Cover image',
    styleOptions: {
      pageBreakBefore: 'recto',
    },
  });
  expect(content).toBe(
    `<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>Book title</title>
    <style data-vv-style="">
      :root {
        break-before: recto;
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
    </style>
  </head>
  <body>
    <section role="region" aria-label="Cover">
      <img role="doc-cover" src="./escape%20check%25.jpg" alt="Cover image" />
    </section>
  </body>
</html>
`,
  );
});

it('cover config', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('cover/cover.valid.1.config.cjs'),
  ]);
  assertSingleItem(config);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  const fileList = await glob('**', {
    cwd: resolveFixture('cover/.vs-valid.1'),
  });
  expect(new Set(fileList)).toMatchObject(
    new Set([
      'arch.jpg',
      'cover-page.html',
      'manuscript/foo.html',
      'publication.json',
    ]),
  );

  const { default: manifest } = await import(
    resolveFixture('cover/.vs-valid.1/publication.json')
  );
  expect(manifest.readingOrder[0]).toEqual({
    url: 'cover-page.html',
    name: 'cover test',
    rel: 'cover',
    type: 'LinkedResource',
  });
  expect(manifest.resources[0]).toEqual({
    rel: 'cover',
    url: 'arch.jpg',
    name: 'alt text',
    encodingFormat: 'image/jpeg',
  });
  const coverHtml = new JSDOM(
    fs.readFileSync(
      resolveFixture('cover/.vs-valid.1/cover-page.html'),
      'utf-8',
    ),
  );
  const { document } = coverHtml.window;
  expect(document.querySelector('title')!.text).toBe('cover test');
  expect(
    document.querySelector('img[role="doc-cover"]')!.getAttribute('src'),
  ).toBe('arch.jpg');
  expect(
    document.querySelector('img[role="doc-cover"]')!.getAttribute('alt'),
  ).toBe('alt text');
});

it('customize cover page', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('cover/cover.valid.2.config.cjs'),
  ]);
  assertSingleItem(config);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  const fileList = await glob('**', {
    cwd: resolveFixture('cover/.vs-valid.2'),
  });
  expect(new Set(fileList)).toMatchObject(
    new Set([
      'arch.jpg',
      'dir/back-cover.html',
      'dir/foo.html',
      'index.html',
      'publication.json',
      'sample-theme.css',
    ]),
  );

  const { default: manifest } = await import(
    resolveFixture('cover/.vs-valid.2/publication.json')
  );
  expect(manifest.readingOrder).toEqual([
    {
      url: 'index.html',
      name: 'Customized cover',
      rel: 'cover',
      type: 'LinkedResource',
    },
    {
      url: 'dir/foo.html',
      name: 'cover test 2',
    },
    {
      url: 'dir/back-cover.html',
      name: 'Back cover',
      rel: 'cover',
      type: 'LinkedResource',
    },
  ]);

  const frontCoverHtml = new JSDOM(
    fs.readFileSync(resolveFixture('cover/.vs-valid.2/index.html'), 'utf-8'),
  );
  const { document: frontDocument } = frontCoverHtml.window;
  expect(frontDocument.querySelector('title')!.text).toBe('Customized cover');
  expect(frontDocument.querySelector('style[data-vv-style]')).toBeFalsy();
  expect(
    frontDocument.querySelector('link[rel="stylesheet"]')!.getAttribute('href'),
  ).toBe('sample-theme.css');
  expect(
    frontDocument
      .querySelector('.cover-wrapper > img[role="doc-cover"]')!
      .getAttribute('src'),
  ).toBe('arch.jpg');
  expect(
    frontDocument
      .querySelector('.cover-wrapper > img[role="doc-cover"]')!
      .getAttribute('alt'),
  ).toBe('front cover');

  const backCoverHtml = new JSDOM(
    fs.readFileSync(
      resolveFixture('cover/.vs-valid.2/dir/back-cover.html'),
      'utf-8',
    ),
  );
  const { document: backDocument } = backCoverHtml.window;
  expect(backDocument.querySelector('title')!.text).toBe('Back cover');
  expect(
    backDocument.querySelector('style[data-vv-style]')!.textContent,
  ).toMatch(/:root\s*{\s*break-before: right;\s*}/);
  expect(
    backDocument.querySelector('link[rel="stylesheet"]')!.getAttribute('href'),
  ).toBe('../sample-theme.css');
  expect(
    backDocument.querySelector('img[role="doc-cover"]')!.getAttribute('src'),
  ).toBe('../arch.jpg');
  expect(
    backDocument.querySelector('img[role="doc-cover"]')!.getAttribute('alt'),
  ).toBe('back cover');
});

it('in-place cover page conversion', async () => {
  const srcCoverContent = fs.readFileSync(
    resolveFixture('cover/inplace/cover.html'),
    'utf-8',
  );
  const config = await getMergedConfig([
    '-c',
    resolveFixture('cover/cover.valid.3.config.cjs'),
  ]);
  assertSingleItem(config);
  await compile(config);
  await copyAssets(config);
  expect(
    fs.readFileSync(resolveFixture('cover/inplace/cover.html'), 'utf-8'),
  ).toBe(srcCoverContent);

  const fileList = await glob('**', {
    cwd: resolveFixture('cover/inplace'),
    dot: true,
  });
  const tmpCoverPath = fileList.find((f) => /^\.vs-/.test(f));
  expect(tmpCoverPath).toBeTruthy();
  const tmpCoverContent = fs.readFileSync(
    resolveFixture(`cover/inplace/${tmpCoverPath}`),
    'utf-8',
  );
  expect(tmpCoverContent).toMatch(/<title>in-place cover<\/title>/);
});
