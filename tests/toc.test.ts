import './mocks/fs.js';
import './mocks/vivliostyle__jsdom.js';

import { JSDOM } from '@vivliostyle/jsdom';
import { vol } from 'memfs';
import { assert, beforeEach, describe, expect, it } from 'vitest';
import { isWebPubConfig } from '../src/config/resolve.js';
import { transformManuscript } from '../src/processor/compile.js';
import { getStructuredSectionFromHtml } from '../src/processor/html.js';
import { getTaskConfig, runCommand } from './command-util.js';

beforeEach(() => vol.reset());

it('generates ToC html', async () => {
  vol.fromJSON({
    '/work/empty.html': '',
  });
  const config = await getTaskConfig(['build'], '/work', {
    title: 'Book title',
    language: 'ja',
    entry: [
      { rel: 'contents', pageBreakBefore: 'recto', pageCounterReset: 1 },
      { path: 'empty.html', title: 'Title' },
    ],
    toc: {
      title: 'Table of Contents',
      htmlPath: 'toc.html',
    },
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
        <li><a href="empty.html">Title</a></li>
      </ol>
    </nav>
  </body>
</html>
`,
  );
});

it('supports boolean toc config', async () => {
  vol.fromJSON({
    '/work/manuscript/a.md': '# A',
    '/work/manuscript/b.md': '# B',
    '/work/manuscript/c.md': '# C',
  });
  await runCommand(['build'], {
    cwd: '/work',
    config: {
      title: 'yuno',
      entryContext: 'manuscript',
      entry: ['a.md', 'b.md', 'c.md'],
      output: [],
      toc: true,
    },
  });
  const workDir = vol.toJSON('/work/.vivliostyle', {}, true);
  expect(new Set(Object.keys(workDir))).toEqual(
    new Set(['a.html', 'b.html', 'c.html', 'index.html', 'publication.json']),
  );

  const manifest = JSON.parse(workDir['publication.json']!);
  expect(manifest.readingOrder[0]).toEqual({
    rel: 'contents',
    name: 'Table of Contents',
    type: 'LinkedResource',
    url: 'index.html',
  });

  const tocHtml = new JSDOM(workDir['index.html']!);
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

it('supports object toc config', async () => {
  vol.fromJSON({
    '/work/manuscript/a.md': '# A',
    '/work/manuscript/b.md': '# B',
    '/work/manuscript/c.md': '# C',
  });
  await runCommand(['build'], {
    cwd: '/work',
    config: {
      title: 'yuno',
      entry: [
        'manuscript/a.md',
        'manuscript/b.md',
        'manuscript/c.md',
        { rel: 'contents' },
      ],
      output: [],
      toc: {
        title: 'もくじ',
        htmlPath: 'manuscript/contents.html',
      },
    },
  });
  const workDir = vol.toJSON('/work/.vivliostyle', {}, true);
  expect(new Set(Object.keys(workDir))).toEqual(
    new Set([
      'manuscript/a.html',
      'manuscript/b.html',
      'manuscript/c.html',
      'manuscript/contents.html',
      'publication.json',
    ]),
  );

  const manifest = JSON.parse(workDir['publication.json']!);
  expect(manifest.readingOrder[3]).toEqual({
    rel: 'contents',
    name: 'もくじ',
    type: 'LinkedResource',
    url: 'manuscript/contents.html',
  });

  const tocHtml = new JSDOM(workDir['manuscript/contents.html']!);
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

it('customize ToC document', async () => {
  vol.fromJSON({
    '/work/manuscript/ToC.html': `<html>
  <body>
    <h1>Customize ToC</h1>
    <div class="toc-wrapper">
      <nav id="toc" role="doc-toc"></nav>
    </div>
  </body>
</html>`,
    '/work/sample-theme.css': '',
    '/work/a.md': '# A',
    '/work/b.md': '# B',
    '/work/c.md': '# C',
  });
  await runCommand(['build'], {
    cwd: '/work',
    config: {
      title: 'yuno',
      entry: [
        {
          rel: 'contents',
          path: 'manuscript/ToC.html',
          output: 'index.html',
          theme: 'sample-theme.css',
        },
        'a.md',
        'b.md',
        'c.md',
      ],
      output: [],
      toc: {
        title: 'xxx',
      },
    },
  });
  const workDir = vol.toJSON('/work/.vivliostyle', {}, true);
  expect(new Set(Object.keys(workDir))).toEqual(
    new Set([
      'a.html',
      'b.html',
      'c.html',
      'index.html',
      'publication.json',
      'sample-theme.css',
    ]),
  );

  const manifest = JSON.parse(workDir['publication.json']!);
  expect(manifest.readingOrder[0]).toEqual({
    rel: 'contents',
    name: 'xxx',
    type: 'LinkedResource',
    url: 'index.html',
  });

  const tocHtml = new JSDOM(workDir['index.html']!);
  const { document } = tocHtml.window;
  expect(document.querySelector('title')!.text).toBe('yuno');
  const toc = document.querySelector('.toc-wrapper > nav[role="doc-toc"]')!;
  expect(toc.querySelector('h2')!.innerHTML).toBe('xxx');
  expect(toc.querySelector('ol')!.children).toHaveLength(3);
  expect(
    document.querySelector('link[rel="stylesheet"]')!.getAttribute('href'),
  ).toBe('sample-theme.css');
  expect(
    document.querySelector('link[rel="publication"]')!.getAttribute('href'),
  ).toBe('publication.json');
});

describe('sectionized document', () => {
  const sectionHtml = /* html */ `<!doctype html>
<html lang="en">
  <head>
    <title>Section Example</title>
  </head>
  <body>
    <p>section</p>
    <h1 id="">H1</h1>
    <h2 id="h2">
      <span>H2</span>
      <span>content</span>
    </h2>
    <section>
      <hgroup>
        <p></p>
        <h3 id="#">H3</h3>
      </hgroup>
      <section>
        <h2>Nested</h2>
      </section>
      <h4>H4</h4>
      <section>
        <h5>H5</h5>
        <section>
          <h6>H6</h6>
        </section>
      </section>
    </section>
    <blockquote>
      <h3>Heading in blockquote</h3>
    </blockquote>
    <h2><a href="javascript:alert('XSS')">Another H2</a></h2>
  </body>
</html>
`;

  it('works with sectionized document', async () => {
    vol.fromJSON({
      '/work/section.html': sectionHtml,
    });

    const section = await getStructuredSectionFromHtml('/work/section.html');
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
            headingHtml: '<a>Another H2</a>',
            headingText: 'Another H2',
            level: 2,
            children: [],
          },
        ],
      },
    ]);
  });

  it('generate toc with sectionDepth=1', async () => {
    vol.fromJSON({
      '/work/section.html': sectionHtml,
    });
    await runCommand(['build'], {
      cwd: '/work',
      config: {
        entry: ['section.html'],
        output: [],
        toc: {
          sectionDepth: 1,
        },
      },
    });
    const workDir = vol.toJSON('/work/.vivliostyle', {}, true);
    const tocHtml = new JSDOM(workDir['index.html']!);
    const { document } = tocHtml.window;
    const li = document.querySelector<HTMLElement>(
      'nav[role="doc-toc"] > ol > li',
    )!;
    expect(li.children).toHaveLength(1);
    expect(li.dataset.sectionLevel).toBe('1');
    expect(li.innerHTML).toBe('<span>H1</span>');
    expect(li.id).toBeFalsy();
  });

  it('generate toc with sectionDepth=6', async () => {
    vol.fromJSON({
      '/work/section.html': sectionHtml,
    });
    await runCommand(['build'], {
      cwd: '/work',
      config: {
        entry: ['section.html'],
        output: [],
        toc: {
          sectionDepth: 6,
        },
      },
    });
    const workDir = vol.toJSON('/work/.vivliostyle', {}, true);
    const tocHtml = new JSDOM(workDir['index.html']!);

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
        '<span><a>Another H2</a></span>',
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
  });

  it('generate toc with custom transform functions', async () => {
    vol.fromJSON({
      '/work/section.html': sectionHtml,
    });
    await runCommand(['build'], {
      cwd: '/work',
      config: {
        entry: ['section.html'],
        output: [],
        toc: {
          sectionDepth: 6,
          transformDocumentList: (nodeList) => (propsList) => ({
            type: 'element',
            tagName: 'div',
            properties: {
              className: 'doc-list',
              dataNodeLength: nodeList.length,
            },
            children: nodeList
              .map((a, i) => [a, propsList[i]] as const)
              .map(
                ([
                  { title, href, sections, children: childDoc },
                  { children },
                ]) => ({
                  type: 'element',
                  tagName: 'div',
                  properties: {
                    className: 'doc-list-item',
                    dataContent: JSON.stringify({ title, href }),
                    dataSections: JSON.stringify(sections),
                    dataChildren: JSON.stringify(childDoc),
                  },
                  children,
                }),
              ),
          }),
          transformSectionList: (nodeList) => (propsList) => ({
            type: 'element',
            tagName: 'div',
            properties: {
              className: 'sec-list',
              dataNodeLength: nodeList.length,
            },
            children: nodeList
              .map((a, i) => [a, propsList[i]] as const)
              .map(
                ([
                  { headingText, href, level, id, children: childSec },
                  { children },
                ]) => ({
                  type: 'element',
                  tagName: 'div',
                  properties: {
                    className: 'sec-list-item',
                    dataContent: JSON.stringify({
                      headingText,
                      href,
                      level,
                      id,
                    }),
                    dataChildren: JSON.stringify(childSec),
                  },
                  children,
                }),
              ),
          }),
        },
      },
    });

    const section = await getStructuredSectionFromHtml(
      '/work/section.html',
      'section.html',
    );
    const workDir = vol.toJSON('/work/.vivliostyle', {}, true);
    const tocHtml = new JSDOM(workDir['index.html']!);
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
});
