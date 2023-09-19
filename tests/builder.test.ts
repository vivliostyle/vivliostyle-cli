import jsdom, { JSDOM } from '@vivliostyle/jsdom';
import { globby } from 'globby';
import assert from 'node:assert';
import fs from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { MergedConfig } from '../src/input/config.js';
import {
  checkOverwriteViolation,
  cleanupWorkspace,
  compile,
  copyAssets,
  prepareThemeDirectory,
} from '../src/processor/compile.js';
import { checkThemeInstallationNecessity } from '../src/processor/theme.js';
import { removeSync } from '../src/util.js';
import {
  assertArray,
  assertSingleItem,
  getMergedConfig,
  resolveFixture,
} from './commandUtil.js';

function assertManifestPath(
  config: MergedConfig,
): asserts config is MergedConfig & { manifestPath: string } {
  assert(!!config.manifestPath);
}

afterAll(() => {
  [
    resolveFixture('builder/.vs-workspace'),
    resolveFixture('builder/.vs-entryContext'),
    resolveFixture('builder/.vs-variousManuscriptFormat'),
    resolveFixture('builder/.vs-vfm'),
    resolveFixture('builder/.vs-multipleEntry'),
    resolveFixture('builder/.vs-multipleCoverPages'),
    resolveFixture('builder/.vs-localTheme'),
    resolveFixture('builder/.vs-remoteTheme'),
    resolveFixture('builder/.vs-multipleTheme'),
    resolveFixture('builder/.vs-nonExistTheme'),
    resolveFixture('builder/.vs-invalidTheme'),
    resolveFixture('builder/.vs-nonExistImport'),
  ].map((f) => removeSync(f));
});

it('generate workspace directory', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/workspace.config.cjs'),
  ]);
  assertSingleItem(config);
  for (const target of config.outputs) {
    checkOverwriteViolation(config, target.path, target.format);
  }
  assertManifestPath(config);
  await cleanupWorkspace(config);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  const fileList = await globby('**', {
    cwd: resolveFixture('builder/.vs-workspace'),
  });
  expect(new Set(fileList)).toEqual(
    new Set([
      'index.html',
      'cover.html',
      'manuscript/cover.png',
      'manuscript/cover2.png',
      'manuscript/sample-theme.css',
      'manuscript/soda.html',
      'publication.json',
      'themes/package-lock.json',
      'themes/package.json',
      'themes/packages/debug-theme/additional-theme.css',
      'themes/packages/debug-theme/package.json',
      'themes/packages/debug-theme/theme.css',
    ]),
  );
  const { default: manifest } = await import(
    resolveFixture('builder/.vs-workspace/publication.json')
  );
  expect(manifest.resources[0]).toEqual({
    encodingFormat: 'image/png',
    rel: 'cover',
    url: 'manuscript/cover.png',
    name: 'Cover image',
  });
  expect(manifest.readingOrder[0]).toEqual({
    rel: 'cover',
    name: 'title',
    type: 'LinkedResource',
    url: 'cover.html',
  });
  expect(manifest.readingOrder[1]).toEqual({
    rel: 'contents',
    name: 'Table of Contents',
    type: 'LinkedResource',
    url: 'index.html',
  });

  const tocHtml = new JSDOM(
    fs.readFileSync(resolveFixture('builder/.vs-workspace/index.html')),
  );
  expect(tocHtml.window.document.documentElement.lang).toBe('ja');
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

  const coverHtml = new JSDOM(
    fs.readFileSync(resolveFixture('builder/.vs-workspace/cover.html')),
    { virtualConsole: new jsdom.VirtualConsole() }, // Disable JSDOM console
  );
  expect(coverHtml.window.document.documentElement.lang).toBe('ja');
  expect(
    coverHtml.window.document.querySelector(
      'link[rel="stylesheet"][href="themes/packages/debug-theme/theme.css"]',
    ),
  ).not.toBeTruthy();
  expect(
    coverHtml.window.document.querySelector(
      '[aria-label="Cover"] > img[src="manuscript/cover.png"][alt="Cover image"][role="doc-cover"]',
    ),
  ).toBeTruthy();

  // try again and check idempotence
  await cleanupWorkspace(config);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  const fileList2 = await globby('**', {
    cwd: resolveFixture('builder/.vs-workspace'),
  });
  expect(new Set(fileList2)).toEqual(new Set(fileList));
});

it('generate files with entryContext', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/entryContext.config.cjs'),
  ]);
  assertSingleItem(config);
  for (const target of config.outputs) {
    checkOverwriteViolation(config, target.path, target.format);
  }
  assertManifestPath(config);
  await cleanupWorkspace(config);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  const fileList = await globby('**', {
    cwd: resolveFixture('builder/.vs-entryContext'),
  });
  expect(new Set(fileList)).toEqual(
    new Set([
      'cover.png',
      'cover2.png',
      'covercover.html',
      'manuscript/sample-theme.css',
      'publication.json',
      'soda.html',
      't-o-c.html',
    ]),
  );
  const { default: manifest } = await import(
    resolveFixture('builder/.vs-entryContext/publication.json')
  );
  expect(manifest.resources[0]).toEqual({
    encodingFormat: 'image/png',
    rel: 'cover',
    url: 'cover.png',
    name: 'Cover image',
  });
  expect(manifest.readingOrder[0]).toEqual({
    rel: 'cover',
    name: 'title',
    type: 'LinkedResource',
    url: 'covercover.html',
  });
  expect(manifest.readingOrder[1]).toEqual({
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
  await cleanupWorkspace(config);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  const fileList2 = await globby('**', {
    cwd: resolveFixture('builder/.vs-entryContext'),
  });
  expect(new Set(fileList2)).toEqual(new Set(fileList));
});

it('generate from various manuscript formats', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/variousManuscriptFormat.config.cjs'),
  ]);
  assertSingleItem(config);
  for (const target of config.outputs) {
    checkOverwriteViolation(config, target.path, target.format);
  }
  assertManifestPath(config);
  await cleanupWorkspace(config);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  const fileList = await globby('**', {
    cwd: resolveFixture('builder/.vs-variousManuscriptFormat'),
  });
  expect(new Set(fileList)).toEqual(
    new Set([
      'manuscript/cover.png',
      'manuscript/cover2.png',
      'manuscript/sample-html.html',
      'manuscript/sample-xhtml.xhtml',
      'manuscript/soda.html',
      'publication.json',
      'themes/package-lock.json',
      'themes/package.json',
      'themes/packages/debug-theme/additional-theme.css',
      'themes/packages/debug-theme/package.json',
      'themes/packages/debug-theme/theme.css',
    ]),
  );
  const { default: manifest } = await import(
    resolveFixture('builder/.vs-variousManuscriptFormat/publication.json')
  );
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
    resolveFixture('builder/workspace.config.cjs'),
  ]);
  assertSingleItem(configWithoutOption);
  assertManifestPath(configWithoutOption);
  await cleanupWorkspace(configWithoutOption);
  await prepareThemeDirectory(configWithoutOption);
  await compile(configWithoutOption);
  const output1 = fs.readFileSync(
    resolveFixture('builder/.vs-workspace/manuscript/soda.html'),
    'utf8',
  );
  expect(output1).toMatch('hardLineBreaks option test\n        foo');

  const configWithOption = await getMergedConfig([
    '-c',
    resolveFixture('builder/vfm.config.cjs'),
  ]);
  assertSingleItem(configWithOption);
  assertManifestPath(configWithOption);
  await cleanupWorkspace(configWithOption);
  await prepareThemeDirectory(configWithOption);
  await compile(configWithOption);
  const { default: manifest } = await import(
    resolveFixture('builder/.vs-vfm/publication.json')
  );
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
    resolveFixture('builder/multipleEntry.config.cjs'),
  ]);
  assertArray(config);
  expect(config).toHaveLength(2);

  assertManifestPath(config[0]);
  await cleanupWorkspace(config[0]);
  await prepareThemeDirectory(config[0]);
  await compile(config[0]);
  const { default: manifest1 } = await import(
    resolveFixture('builder/.vs-multipleEntry/one/publication.json')
  );
  expect(manifest1.readingOrder).toEqual([
    {
      name: 'SODA',
      url: 'manuscript/soda.html',
    },
  ]);

  assertManifestPath(config[1]);
  await cleanupWorkspace(config[1]);
  await prepareThemeDirectory(config[1]);
  await compile(config[1]);
  const { default: manifest2 } = await import(
    resolveFixture('builder/.vs-multipleEntry/two/publication.json')
  );
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

it('generate files with multiple cover pages', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/multipleCoverPages.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  await cleanupWorkspace(config);
  await prepareThemeDirectory(config);
  await compile(config);
  const { default: manifest } = await import(
    resolveFixture('builder/.vs-multipleCoverPages/publication.json')
  );
  expect(manifest.readingOrder).toEqual([
    {
      url: 'cover.html',
      name: 'title',
      rel: 'cover',
      type: 'LinkedResource',
    },
    {
      url: 'index.html',
      name: 'Table of Contents',
      rel: 'contents',
      type: 'LinkedResource',
    },
    {
      url: 'manuscript/soda.html',
      name: 'SODA',
    },
    {
      url: 'another-cover.html',
      name: 'title',
      rel: 'cover',
      type: 'LinkedResource',
    },
  ]);

  const tocHtml = new JSDOM(
    fs.readFileSync(
      resolveFixture('builder/.vs-multipleCoverPages/index.html'),
    ),
    { virtualConsole: new jsdom.VirtualConsole() }, // Disable JSDOM console
  );
  expect(
    tocHtml.window.document.querySelector('style')?.innerHTML,
  ).toMatchSnapshot();
  expect(
    tocHtml.window.document.querySelector(
      'link[rel="stylesheet"][href="manuscript/sample-theme.css"]',
    ),
  ).toBeTruthy();

  const coverHtml = new JSDOM(
    fs.readFileSync(
      resolveFixture('builder/.vs-multipleCoverPages/cover.html'),
    ),
    { virtualConsole: new jsdom.VirtualConsole() }, // Disable JSDOM console
  );
  expect(
    coverHtml.window.document.querySelector(
      'img[src="manuscript/cover.png"][alt="Cover image"][role="doc-cover"]',
    ),
  ).toBeTruthy();

  const anotherCoverHtml = new JSDOM(
    fs.readFileSync(
      resolveFixture('builder/.vs-multipleCoverPages/another-cover.html'),
    ),
    { virtualConsole: new jsdom.VirtualConsole() }, // Disable JSDOM console
  );
  expect(
    anotherCoverHtml.window.document.querySelector('style')?.innerHTML,
  ).toMatchSnapshot();
  expect(
    coverHtml.window.document.querySelector(
      'link[rel="stylesheet"][href="themes/packages/debug-theme/theme.css"]',
    ),
  ).not.toBeTruthy();
  expect(
    anotherCoverHtml.window.document.querySelector(
      'link[rel="stylesheet"][href="manuscript/sample-theme.css"]',
    ),
  ).toBeTruthy();
  expect(
    anotherCoverHtml.window.document.querySelector(
      'img[src="manuscript/cover2.png"][alt="yuno"][role="doc-cover"]',
    ),
  ).toBeTruthy();
});

it('check overwrite violation', async () => {
  const config1 = await getMergedConfig([
    '-c',
    resolveFixture('builder/overwriteViolation.1.config.cjs'),
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
    resolveFixture('builder/overwriteViolation.2.config.cjs'),
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

it('install local themes', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/localTheme.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  await cleanupWorkspace(config);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  const fileList = await globby('**', {
    cwd: resolveFixture('builder/.vs-localTheme'),
  });
  expect(new Set(fileList)).toEqual(
    new Set([
      'manuscript/cover.png',
      'manuscript/cover2.png',
      'manuscript/soda.html',
      'manuscript/theme-reference.html',
      'publication.json',
      'sample-theme.css',
      'themes/package-lock.json',
      'themes/package.json',
      'themes/packages/debug-theme/additional-theme.css',
      'themes/packages/debug-theme/package.json',
      'themes/packages/debug-theme/theme.css',
    ]),
  );
  // checking symlink-referenced directory
  const themePackageFileList = await globby('**', {
    cwd: resolveFixture('builder/.vs-localTheme/themes/packages/debug-theme'),
  });
  expect(new Set(themePackageFileList)).toEqual(
    new Set(['additional-theme.css', 'package.json', 'theme.css']),
  );

  const doc1 = new JSDOM(
    fs.readFileSync(
      resolveFixture('builder/.vs-localTheme/manuscript/soda.html'),
    ),
  );
  expect(
    doc1.window.document.querySelector(
      'link[rel="stylesheet"][href="../themes/packages/debug-theme/theme.css"]',
    ),
  ).toBeTruthy();
  const doc2 = new JSDOM(
    fs.readFileSync(
      resolveFixture('builder/.vs-localTheme/manuscript/theme-reference.html'),
    ),
  );
  expect(
    doc2.window.document.querySelector(
      'link[rel="stylesheet"][href="../sample-theme.css"]',
    ),
  ).toBeTruthy();

  // try again and check idempotence
  await cleanupWorkspace(config);
  expect(checkThemeInstallationNecessity(config)).resolves.toBe(false);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  const fileList2 = await globby('**', {
    cwd: resolveFixture('builder/.vs-localTheme'),
  });
  expect(new Set(fileList2)).toEqual(new Set(fileList));
});

it('install remote themes', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/remoteTheme.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  await cleanupWorkspace(config);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  const fileList = await globby('**', {
    cwd: resolveFixture('builder/.vs-remoteTheme'),
  });
  expect(fileList).toContain(
    'themes/packages/@vivliostyle/theme-academic/package.json',
  );

  const doc = new JSDOM(
    fs.readFileSync(
      resolveFixture('builder/.vs-remoteTheme/manuscript/soda.html'),
    ),
  );
  expect(
    doc.window.document.querySelector(
      'link[rel="stylesheet"][href="../themes/packages/@vivliostyle/theme-academic/theme.css"]',
    ),
  ).toBeTruthy();

  // try again and check idempotence
  await cleanupWorkspace(config);
  expect(checkThemeInstallationNecessity(config)).resolves.toBe(false);
  await prepareThemeDirectory(config);
  await compile(config);
  await copyAssets(config);
  const fileList2 = await globby('**', {
    cwd: resolveFixture('builder/.vs-remoteTheme'),
  });
  expect(new Set(fileList2)).toEqual(new Set(fileList));
}, 300000); // Longer timeout to ensure installing remote themes

it('use multiple themes', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/multipleTheme.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  await cleanupWorkspace(config);
  await prepareThemeDirectory(config);
  await compile(config);

  const doc1 = new JSDOM(
    fs.readFileSync(
      resolveFixture('builder/.vs-multipleTheme/manuscript/soda.html'),
    ),
  );
  expect(
    [...doc1.window.document.querySelectorAll('link[rel="stylesheet"]')].map(
      (e) => e.getAttribute('href'),
    ),
  ).toEqual([
    '../themes/packages/debug-theme/theme.css',
    '../themes/packages/debug-theme/additional-theme.css',
    'sample-theme.css',
  ]);
  const doc2 = new JSDOM(
    fs.readFileSync(resolveFixture('builder/.vs-multipleTheme/index.html')),
  );
  expect(
    [...doc2.window.document.querySelectorAll('link[rel="stylesheet"]')].map(
      (e) => e.getAttribute('href'),
    ),
  ).toEqual([
    'themes/packages/@vivliostyle/theme-academic/theme.css',
    'manuscript/sample-theme.css',
  ]);
}, 300000); // Longer timeout to ensure installing remote themes

it('fail to install if package does not exist', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/nonExistTheme.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  expect(prepareThemeDirectory(config)).rejects.toThrow(
    'An error occurred during the installation of the theme',
  );
});

it('reject trying import theme that is not vivliostyle theme', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/invalidTheme.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  await prepareThemeDirectory(config);
  expect(compile(config)).rejects.toThrow(
    'Could not find a style file for the theme: invalid-theme',
  );
});

it('reject import style file that is not exist', async () => {
  const config = await getMergedConfig([
    '-c',
    resolveFixture('builder/nonExistImport.config.cjs'),
  ]);
  assertSingleItem(config);
  assertManifestPath(config);
  await prepareThemeDirectory(config);
  expect(compile(config)).rejects.toThrow(
    'Could not find a style path not-exist.css for the theme: debug-theme',
  );
});
