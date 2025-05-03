import './mocks/fs.js';
import './mocks/vivliostyle__jsdom.js';

import { JSDOM } from '@vivliostyle/jsdom';
import { vol } from 'memfs';
import { assert, beforeEach, expect, it } from 'vitest';
import { isWebPubConfig } from '../src/config/resolve.js';
import { transformManuscript } from '../src/processor/compile.js';
import { getTaskConfig, runCommand } from './command-util';

beforeEach(() => vol.reset());

it('generateCoverHtml', async () => {
  vol.fromJSON({
    '/work/empty.html': '',
    '/work/escape check%.jpg': '',
  });
  const config = await getTaskConfig(['build'], '/work', {
    title: 'Book title',
    language: 'ja',
    entry: [
      {
        rel: 'cover',
        imageSrc: './escape check%.jpg',
        imageAlt: 'Cover image',
        pageBreakBefore: 'recto',
      },
      'empty.html',
    ],
  });
  assert(isWebPubConfig(config));
  const content = await transformManuscript(config.entries[0], config);
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
      <img role="doc-cover" src="escape%20check%25.jpg" alt="Cover image" />
    </section>
  </body>
</html>
`,
  );
});

it('supports cover config', async () => {
  vol.fromJSON({
    '/work/manuscript/foo.md': '',
    '/work/arch.jpg': '',
  });
  await runCommand(['build'], {
    cwd: '/work',
    config: {
      title: 'cover test',
      entry: 'manuscript/foo.md',
      output: [],
      cover: {
        src: 'arch.jpg',
        name: 'alt text',
        htmlPath: 'cover-page.html',
      },
    },
  });
  const workDir = vol.toJSON('/work/.vivliostyle', {}, true);
  expect(new Set(Object.keys(workDir))).toMatchObject(
    new Set([
      'arch.jpg',
      'cover-page.html',
      'manuscript/foo.html',
      'publication.json',
    ]),
  );

  const manifest = JSON.parse(workDir['publication.json']!);
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

  const coverHtml = new JSDOM(workDir['cover-page.html']!);
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
  vol.fromJSON({
    '/work/manuscript/cover.html': `<html>
  <head>
    <title>Customized cover</title>
  </head>
  <body>
    <div class="cover-wrapper">
      <img role="doc-cover" />
    </div>
  </body>
</html>
`,
    '/work/manuscript/foo.md': '',
    '/work/arch.jpg': '',
    '/work/sample-theme.css': '',
  });
  await runCommand(['build'], {
    cwd: '/work',
    config: {
      title: 'cover test 2',
      entry: [
        {
          rel: 'cover',
          path: 'manuscript/cover.html',
          output: 'index.html',
          imageSrc: 'arch.jpg',
          imageAlt: 'front cover',
          theme: './sample-theme.css',
        },
        {
          path: 'manuscript/foo.md',
          output: 'dir/foo.html',
        },
        {
          rel: 'cover',
          output: 'dir/back-cover.html',
          title: 'Back cover',
          imageSrc: 'arch.jpg',
          imageAlt: 'back cover',
          theme: './sample-theme.css',
          pageBreakBefore: 'right',
        },
      ],
      output: [],
    },
  });
  const workDir = vol.toJSON('/work/.vivliostyle', {}, true);
  expect(new Set(Object.keys(workDir))).toMatchObject(
    new Set([
      'arch.jpg',
      'dir/back-cover.html',
      'dir/foo.html',
      'index.html',
      'publication.json',
      'sample-theme.css',
    ]),
  );

  const manifest = JSON.parse(workDir['publication.json']!);
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

  const frontCoverHtml = new JSDOM(workDir['index.html']!);
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

  const backCoverHtml = new JSDOM(workDir['dir/back-cover.html']!);
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
