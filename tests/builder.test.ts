import assert from 'assert';
import fs from 'fs';
import { JSDOM } from 'jsdom';
import shelljs from 'shelljs';
import { checkOverwriteViolation, compile, copyAssets } from '../src/builder';
import { MergedConfig } from '../src/config';
import {
  assertArray,
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
  shelljs.rm('-rf', [
    resolveFixture('builder/.vs-workspace'),
    resolveFixture('builder/.vs-entryContext'),
    resolveFixture('builder/.vs-variousManuscriptFormat'),
    resolveFixture('builder/.vs-vfm'),
    resolveFixture('builder/.vs-multipleEntry'),
  ]);
});

it('generate workspace directory', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/workspace.config.js'),
  ]);
  assertSingleItem(config);
  for (const target of config.outputs) {
    checkOverwriteViolation(config, target.path, target.format);
  }
  assertManifestPath(config);
  await compile(config);
  await copyAssets(config);
  const fileList = shelljs.ls('-R', resolveFixture('builder/.vs-workspace'));
  expect([...fileList]).toEqual([
    'index.html',
    'manuscript',
    'manuscript/cover.png',
    'manuscript/sample-theme.css',
    'manuscript/soda.html',
    'publication.json',
    'themes',
    'themes/packages',
    'themes/packages/debug-theme',
    'themes/packages/debug-theme/package.json',
    'themes/packages/debug-theme/theme.css',
  ]);
  const manifest = require(resolveFixture(
    'builder/.vs-workspace/publication.json',
  ));
  expect(manifest.links[0]).toEqual({
    encodingFormat: 'image/png',
    rel: 'cover',
    url: 'manuscript/cover.png',
    width: 512,
    height: 512,
  });
  expect(manifest.readingOrder[0]).toEqual({
    rel: 'contents',
    name: 'Table of Contents',
    type: 'LinkedResource',
    url: 'index.html',
  });

  const tocHtml = new JSDOM(
    fs.readFileSync(resolveFixture('builder/.vs-workspace/index.html')),
  );
  expect(
    tocHtml.window.document.querySelector(
      'link[rel="stylesheet"][href="themes/packages/debug-theme/theme.css"]',
    ),
  ).toBeTruthy();

  const manuscriptHtml = new JSDOM(
    fs.readFileSync(
      resolveFixture('builder/.vs-workspace/manuscript/soda.html'),
    ),
  );
  expect(
    manuscriptHtml.window.document.querySelector(
      'link[rel="stylesheet"][href="sample-theme.css"]',
    ),
  ).toBeTruthy();

  // try again and check idempotence
  await compile(config);
  await copyAssets(config);
  const fileList2 = shelljs.ls('-R', resolveFixture('builder/.vs-workspace'));
  expect([...fileList2]).toEqual([...fileList]);
});

it('generate files with entryContext', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/entryContext.config.js'),
  ]);
  assertSingleItem(config);
  for (const target of config.outputs) {
    checkOverwriteViolation(config, target.path, target.format);
  }
  assertManifestPath(config);
  await compile(config);
  await copyAssets(config);
  const fileList = shelljs.ls('-R', resolveFixture('builder/.vs-entryContext'));
  expect([...fileList]).toEqual([
    'cover.png',
    'manuscript',
    'manuscript/sample-theme.css',
    'publication.json',
    'soda.html',
    't-o-c.html',
  ]);
  const manifest = require(resolveFixture(
    'builder/.vs-entryContext/publication.json',
  ));
  expect(manifest.links[0]).toEqual({
    encodingFormat: 'image/png',
    rel: 'cover',
    url: 'cover.png',
    width: 512,
    height: 512,
  });
  expect(manifest.readingOrder[0]).toEqual({
    rel: 'contents',
    name: 'Table of Contents',
    type: 'LinkedResource',
    url: 't-o-c.html',
  });
  expect(manifest.inLanguage).toBeUndefined();

  const tocHtml = new JSDOM(
    fs.readFileSync(resolveFixture('builder/.vs-entryContext/t-o-c.html')),
  );
  expect(
    tocHtml.window.document.querySelector(
      'link[rel="stylesheet"][href="manuscript/sample-theme.css"]',
    ),
  ).toBeTruthy();
  const manuscriptHtml = new JSDOM(
    fs.readFileSync(resolveFixture('builder/.vs-entryContext/soda.html')),
  );
  expect(
    manuscriptHtml.window.document.querySelector(
      'link[rel="stylesheet"][href="manuscript/sample-theme.css"]',
    ),
  ).toBeTruthy();

  // try again and check idempotence
  await compile(config);
  await copyAssets(config);
  const fileList2 = shelljs.ls(
    '-R',
    resolveFixture('builder/.vs-entryContext'),
  );
  expect([...fileList2]).toEqual([...fileList]);
});

it('generate from various manuscript formats', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/variousManuscriptFormat.config.js'),
  ]);
  assertSingleItem(config);
  for (const target of config.outputs) {
    checkOverwriteViolation(config, target.path, target.format);
  }
  assertManifestPath(config);
  await compile(config);
  await copyAssets(config);
  const fileList = shelljs.ls(
    '-R',
    resolveFixture('builder/.vs-variousManuscriptFormat'),
  );
  expect([...fileList]).toEqual([
    'manuscript',
    'manuscript/cover.png',
    'manuscript/sample-html.html',
    'manuscript/sample-xhtml.xhtml',
    'manuscript/soda.html',
    'publication.json',
    'themes',
    'themes/packages',
    'themes/packages/debug-theme',
    'themes/packages/debug-theme/package.json',
    'themes/packages/debug-theme/theme.css',
  ]);
  const manifest = require(resolveFixture(
    'builder/.vs-variousManuscriptFormat/publication.json',
  ));
  expect(manifest.readingOrder).toEqual([
    {
      name: 'SODA',
      url: 'manuscript/soda.html',
    },
    {
      name: 'ABCDEF',
      url: 'manuscript/sample-html.html',
    },
    {
      encodingFormat: 'application/xhtml+xml',
      name: 'Sample XHTML',
      url: 'manuscript/sample-xhtml.xhtml',
    },
  ]);
  expect(manifest.inLanguage).toBe('ja');
  const doc1 = new JSDOM(
    fs.readFileSync(
      resolveFixture(
        'builder/.vs-variousManuscriptFormat/manuscript/soda.html',
      ),
    ),
  );
  expect(
    doc1.window.document.querySelector(
      'link[rel="stylesheet"][href="https://example.com"]',
    ),
  ).toBeTruthy();
  expect(doc1.window.document.querySelector('title')?.text).toEqual('SODA');
  expect(
    doc1.window.document.querySelector('html')?.getAttribute('lang'),
  ).toEqual('ja');
  const doc2 = new JSDOM(
    fs.readFileSync(
      resolveFixture(
        'builder/.vs-variousManuscriptFormat/manuscript/sample-html.html',
      ),
    ),
  );
  expect(
    doc2.window.document.querySelector(
      'link[rel="stylesheet"][href="../themes/packages/debug-theme/theme.css"]',
    ),
  ).toBeTruthy();
  expect(doc2.window.document.querySelector('title')?.text).toEqual('ABCDEF');
  expect(
    doc2.window.document.querySelector('html')?.getAttribute('lang'),
  ).toEqual('en');
  const doc3 = new JSDOM(
    fs.readFileSync(
      resolveFixture(
        'builder/.vs-variousManuscriptFormat/manuscript/sample-xhtml.xhtml',
      ),
    ),
    { contentType: 'application/xhtml+xml' },
  );
  expect(
    doc3.window.document.querySelector(
      'link[rel="stylesheet"][href="https://example.com"]',
    ),
  ).toBeTruthy();
  expect(
    doc3.window.document.querySelector('html')?.getAttribute('lang'),
  ).toEqual('ja');
  expect(
    doc3.window.document.querySelector('html')?.getAttribute('xml:lang'),
  ).toEqual('ja');
});

it('generate with VFM options', async () => {
  const configWithoutOption = await getMergedConfig([
    '-c',
    resolveFixture('builder/workspace.config.js'),
  ]);
  assertSingleItem(configWithoutOption);
  assertManifestPath(configWithoutOption);
  await compile(configWithoutOption);
  const output1 = fs.readFileSync(
    resolveFixture('builder/.vs-workspace/manuscript/soda.html'),
    'utf8',
  );
  expect(output1).toMatch('hardLineBreaks option test\n        foo');

  const configWithOption = await getMergedConfig([
    '-c',
    resolveFixture('builder/vfm.config.js'),
  ]);
  assertSingleItem(configWithOption);
  assertManifestPath(configWithOption);
  await compile(configWithOption);
  const manifest = require(resolveFixture('builder/.vs-vfm/publication.json'));
  expect(manifest.readingOrder).toEqual([
    {
      url: 'index.html',
      name: 'Table of Contents',
      rel: 'contents',
      type: 'LinkedResource',
    },
    {
      name: 'SODA',
      url: 'manuscript/soda.html',
    },
    {
      name: 'Hello',
      url: 'manuscript/frontmatter.html',
    },
  ]);
  const output2 = fs.readFileSync(
    resolveFixture('builder/.vs-vfm/manuscript/soda.html'),
    'utf8',
  );
  expect(output2).toMatch('hardLineBreaks option test<br>\nfoo');
  const doc1 = new JSDOM(
    fs.readFileSync(
      resolveFixture('builder/.vs-vfm/manuscript/frontmatter.html'),
    ),
  );
  expect(doc1.window.document.querySelector('title')?.textContent).toBe(
    'Hello',
  );
  expect(doc1.window.document.documentElement.lang).toBe('la');
  expect(doc1.window.document.documentElement.className).toBe('Foo');
  expect(
    doc1.window.document
      .querySelector('meta[name="author"]')
      ?.getAttribute('content'),
  ).toBe('Bar');
});

it('generate from multiple config entries', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/multipleEntry.config.js'),
  ]);
  assertArray(config);
  expect(config).toHaveLength(2);

  assertManifestPath(config[0]);
  await compile(config[0]);
  const manifest1 = require(resolveFixture(
    'builder/.vs-multipleEntry/one/publication.json',
  ));
  expect(manifest1.readingOrder).toEqual([
    {
      name: 'SODA',
      url: 'manuscript/soda.html',
    },
  ]);

  assertManifestPath(config[1]);
  await compile(config[1]);
  const manifest2 = require(resolveFixture(
    'builder/.vs-multipleEntry/two/publication.json',
  ));
  expect(manifest2.readingOrder).toEqual([
    {
      url: 'manuscript/frontmatter.html',
      name: 'Hello',
    },
    {
      url: 'index.html',
      name: 'Table of Contents',
      rel: 'contents',
      type: 'LinkedResource',
    },
  ]);
});

it('check overwrite violation', async () => {
  const config1 = await getMergedConfig([
    '-c',
    resolveFixture('builder/overwriteViolation.1.config.js'),
  ]);
  assertSingleItem(config1);
  expect(
    new Promise<void>((res, rej) => {
      try {
        checkOverwriteViolation(config1, config1.outputs[0].path, '');
        res();
      } catch (err) {
        rej(err);
      }
    }),
  ).rejects.toThrow();
  const config2 = await getMergedConfig([
    '-c',
    resolveFixture('builder/overwriteViolation.2.config.js'),
  ]);
  assertSingleItem(config2);
  expect(
    new Promise<void>((res, rej) => {
      try {
        checkOverwriteViolation(config2, config2.outputs[0].path, '');
        res();
      } catch (err) {
        rej(err);
      }
    }),
  ).rejects.toThrow();
});
