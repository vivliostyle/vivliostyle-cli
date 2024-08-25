import { JSDOM } from '@vivliostyle/jsdom';
import { globby } from 'globby';
import assert from 'node:assert';
import fs from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { MergedConfig } from '../src/input/config.js';
import { compile, prepareThemeDirectory } from '../src/processor/compile.js';
import {
  generateDefaultTocHtml,
  getStructuredSectionFromHtml,
  processTocHtml,
} from '../src/processor/html.js';
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
    resolveFixture('toc/.vs-sectionDepth'),
    resolveFixture('toc/.vs-customTransform'),
  ].forEach((f) => removeSync(f));
});

it('generateTocHtml', async () => {
  let content = generateDefaultTocHtml({
    title: 'Book title',
    language: 'ja',
  });
  content = await processTocHtml(content, {
    entries: [
      { target: resolveFixture('toc/manuscript/empty.html'), title: 'Title' },
    ],
    manifestPath: resolveFixture(
      'toc/manuscript/.vivliostyle/publication.json',
    ),
    distDir: resolveFixture('toc/manuscript/.vivliostyle'),
    tocTitle: 'Table of Contents',
    sectionDepth: 0,
    styleOptions: {
      pageBreakBefore: 'recto',
      pageCounterReset: 1,
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
      @page :nth(1) {
        counter-reset: page 0;
      }
    </style>
    <link
      rel="publication"
      type="application/ld+json"
      href="publication.json"
    />
  </head>
  <body>
    <h1>Book title</h1>
    <nav id="toc" role="doc-toc">
      <h2>Table of Contents</h2>
      <ol>
        <li><a href="../empty.html">Title</a></li>
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

it('Customize ToC document', async () => {
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
      'index.html',
      'manuscript/a.html',
      'manuscript/b.html',
      'manuscript/c.html',
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
    name: 'ToC Title',
    type: 'LinkedResource',
    url: 'index.html',
  });
  const tocHtml = new JSDOM(
    fs.readFileSync(resolveFixture('toc/.vs-valid.3/index.html'), 'utf8'),
  );
  const { document } = tocHtml.window;
  expect(document.querySelector('title')!.text).toBe('ToC Title');
  const toc = document.querySelector('.toc-wrapper > nav[role="doc-toc"]')!;
  expect(toc.querySelector('h2')!.innerHTML).toBe('ToC Title');
  expect(toc.querySelector('ol')!.children).toHaveLength(3);
  expect(
    document.querySelector('link[rel="stylesheet"]')!.getAttribute('href'),
  ).toBe('sample-theme.css');
  expect(
    document.querySelector('link[rel="publication"]')!.getAttribute('href'),
  ).toBe('publication.json');
});

it('in-place ToC document', async () => {
  const srcTocContent = fs.readFileSync(
    resolveFixture('toc/inplace/index.html'),
    'utf-8',
  );
  const config = await getMergedConfig([
    '-c',
    resolveFixture('toc/toc.valid.4.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  await prepareThemeDirectory(config);
  await compile(config);
  expect(
    fs.readFileSync(resolveFixture('toc/inplace/index.html'), 'utf-8'),
  ).toBe(srcTocContent);

  const fileList = await globby('**', {
    cwd: resolveFixture('toc/inplace'),
    dot: true,
  });
  const tmpTocPath = fileList.find((f) => /^\.vs-/.test(f));
  expect(tmpTocPath).toBeTruthy();
  const tmpTocContent = fs.readFileSync(
    resolveFixture(`toc/inplace/${tmpTocPath}`),
    'utf-8',
  );
  expect(tmpTocContent).toMatch(/<title>in-place toc page<\/title>/);
});

it('works with sectionized document', async () => {
  const section = await getStructuredSectionFromHtml(
    resolveFixture('toc/manuscript/section.html'),
  );
  expect(section).toEqual([
    {
      headingHtml: 'H1',
      headingText: 'H1',
      level: 1,
      children: [
        {
          headingHtml: expect.stringMatching(
            /^\s*<span>H2<\/span>\s*<span>content<\/span>\s*$/,
          ),
          headingText: 'H2 content',
          level: 2,
          id: 'h2',
          children: [
            {
              headingHtml: 'H3',
              headingText: 'H3',
              level: 3,
              id: '#',
              children: [],
            },
          ],
        },
        {
          headingHtml: 'Nested',
          headingText: 'Nested',
          level: 2,
          children: [
            {
              headingHtml: 'H4',
              headingText: 'H4',
              level: 4,
              children: [
                {
                  headingHtml: 'H5',
                  headingText: 'H5',
                  level: 5,
                  children: [
                    {
                      headingHtml: 'H6',
                      headingText: 'H6',
                      level: 6,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          headingHtml: 'Another H2',
          headingText: 'Another H2XSS',
          level: 2,
          children: [],
        },
      ],
    },
  ]);
});

it('generate toc with a sectionDepth config', async () => {
  const run = async (p: string) => {
    const config = await getMergedConfig(['-c', resolveFixture(p)]);
    assertSingleItem(config);
    assertManifestPath(config);
    await prepareThemeDirectory(config);
    await compile(config);
  };

  {
    await run('toc/toc.sectionDepth.depth=0.config.cjs');
    const tocHtml = new JSDOM(
      fs.readFileSync(
        resolveFixture('toc/.vs-sectionDepth/index.html'),
        'utf8',
      ),
    );
    const li = tocHtml.window.document.querySelector(
      'nav[role="doc-toc"] > ol > li',
    )!;
    expect(li.children).toHaveLength(1);
  }

  {
    await run('toc/toc.sectionDepth.depth=1.config.cjs');
    const tocHtml = new JSDOM(
      fs.readFileSync(
        resolveFixture('toc/.vs-sectionDepth/index.html'),
        'utf8',
      ),
    );
    const li = tocHtml.window.document.querySelector<HTMLElement>(
      'nav[role="doc-toc"] > ol > li',
    )!;
    expect(li.children).toHaveLength(1);
    expect(li.dataset.sectionLevel).toBe('1');
    expect(li.innerHTML).toBe('<span>H1</span>');
    expect(li.id).toBeFalsy();
  }

  {
    await run('toc/toc.sectionDepth.depth=6.config.cjs');
    const tocHtml = new JSDOM(
      fs.readFileSync(
        resolveFixture('toc/.vs-sectionDepth/index.html'),
        'utf8',
      ),
    );
    const test = [
      ['ol > li:nth-child(1)', 1, '<span>H1</span>'],
      [
        'ol > li:nth-child(1) > ol > li:nth-child(1)',
        2,
        expect.stringMatching(
          /^\s*<a href="section\.html#h2">\s*<span>H2<\/span>\s*<span>content<\/span>\s*<\/a>\s*$/,
        ),
      ],
      [
        'ol > li:nth-child(1) > ol > li:nth-child(1) > ol > li:nth-child(1)',
        3,
        '<a href="section.html#%23">H3</a>',
      ],
      ['ol > li:nth-child(1) > ol > li:nth-child(2)', 2, '<span>Nested</span>'],
      [
        'ol > li:nth-child(1) > ol > li:nth-child(2) > ol > li:nth-child(1)',
        4,
        '<span>H4</span>',
      ],
      [
        'ol > li:nth-child(1) > ol > li:nth-child(2) > ol > li:nth-child(1) > ol > li:nth-child(1)',
        5,
        '<span>H5</span>',
      ],
      [
        'ol > li:nth-child(1) > ol > li:nth-child(2) > ol > li:nth-child(1) > ol > li:nth-child(1) > ol > li:nth-child(1)',
        6,
        '<span>H6</span>',
      ],
      [
        'ol > li:nth-child(1) > ol > li:nth-child(3)',
        2,
        '<span>Another H2</span>',
      ],
    ];
    for (const [selector, level, text] of test) {
      const node = tocHtml.window.document.querySelector<HTMLElement>(
        `[role="doc-toc"] > ${selector}`,
      );
      expect(node).toBeTruthy();
      expect(node!.dataset.sectionLevel).toBe(`${level}`);
      expect(node!.children.item(0)!.outerHTML).toStrictEqual(text);
    }
  }
});

it('generate toc with custom transform functions', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('toc/toc.customTransform.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  await prepareThemeDirectory(config);
  await compile(config);

  const section = await getStructuredSectionFromHtml(
    resolveFixture('toc/manuscript/section.html'),
    'section.html',
  );
  const tocHtml = new JSDOM(
    fs.readFileSync(
      resolveFixture('toc/.vs-customTransform/index.html'),
      'utf8',
    ),
  );
  const { document } = tocHtml.window;
  const docList = document.querySelector<HTMLElement>(
    '[role="doc-toc"] > div',
  )!;
  expect(docList.className).toBe('doc-list');
  expect(docList.dataset.nodeLength).toBe('1');

  const docListItem = docList.children.item(0) as HTMLElement;
  expect(docListItem.className).toBe('doc-list-item');
  expect(JSON.parse(docListItem.dataset.content!)).toEqual({
    href: 'section.html',
    title: 'Section Example',
  });
  expect(JSON.parse(docListItem.dataset.sections!)).toEqual(section);

  const secList = docListItem.children.item(0) as HTMLElement;
  expect(secList.className).toBe('sec-list');
  expect(secList.dataset.nodeLength).toBe('1');

  const secListItem1 = secList.children.item(0) as HTMLElement;
  expect(secListItem1.className).toBe('sec-list-item');
  expect(JSON.parse(secListItem1.dataset.content!)).toEqual({
    headingText: 'H1',
    level: 1,
  });
  expect(JSON.parse(secListItem1.dataset.children!)).toEqual(
    section[0].children,
  );

  const secListItem2 = secListItem1.children
    .item(0)!
    .children.item(0) as HTMLElement;
  expect(JSON.parse(secListItem2.dataset.content!)).toEqual({
    headingText: 'H2 content',
    href: 'section.html#h2',
    id: 'h2',
    level: 2,
  });
  expect(JSON.parse(secListItem2.dataset.children!)).toEqual(
    section[0].children[0].children,
  );
});
