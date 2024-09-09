import { fs as memfs, vol } from 'memfs';
import { format } from 'prettier';
import { afterEach, expect, it, vi } from 'vitest';
import { build } from '../src/index.js';
import { VivliostyleConfigSchema } from '../src/input/schema.js';
import { toTree } from './commandUtil.js';

vi.mock('node:fs', () => ({ ...memfs, default: memfs }));

vi.mock('@vivliostyle/jsdom', () =>
  import('./commandUtil.js').then(({ getMockedJSDOM }) => getMockedJSDOM()),
);

vi.mock('../src/processor/theme.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/processor/theme.js')>()),
  checkThemeInstallationNecessity: () => Promise.resolve(false),
  installThemeDependencies: () => Promise.resolve(),
}));

afterEach(() => vol.reset());

it('generate webpub from single markdown file', async () => {
  vol.fromJSON({
    '/work/input/foo.md': '# Hi',
  });
  await build({
    input: '/work/input/foo.md',
    targets: [{ path: '/work/output', format: 'webpub' }],
  });

  expect(toTree(vol)).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json'] as string);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();
});

it('generate webpub from vivliostyle.config.js', async () => {
  const config: VivliostyleConfigSchema = {
    entry: ['doc/one.md', 'doc/two.md'],
    output: ['/work/input/output', '/work/output'],
    toc: true,
    cover: 'cover.png',
    readingProgression: 'rtl',
  };
  vol.fromJSON({
    '/work/input/vivliostyle.config.json': JSON.stringify(config),
    '/work/input/doc/one.md': 'yuno',
    '/work/input/doc/two.md': 'yunocchi',
    '/work/input/cover.png': '',
  });
  await build({
    configPath: '/work/input/vivliostyle.config.json',
  });

  expect(toTree(vol)).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json'] as string);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();
  const toc = file['/work/output/index.html'];
  expect(await format(toc as string, { parser: 'html' })).toMatchSnapshot();

  const manifest2 = JSON.parse(
    file['/work/input/output/publication.json'] as string,
  );
  delete manifest2.dateModified;
  expect(manifest2).toEqual(manifest);
  const toc2 = file['/work/input/output/index.html'];
  expect(toc2).toEqual(toc);
});

it('generate webpub from a plain HTML', async () => {
  vol.fromJSON({
    '/work/input/webbook.html': /* html */ `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <link rel="stylesheet" type="text/css" href="style.css">
        <title>Doc title</title>
      </head>
      <body>
      </body>
      </html>
    `,
    '/work/input/style.css': '',
  });
  await build({
    input: '/work/input/webbook.html',
    targets: [{ path: '/work/output', format: 'webpub' }],
  });

  expect(toTree(vol)).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json'] as string);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();
  const entry = file['/work/output/webbook.html'];
  expect(await format(entry as string, { parser: 'html' })).toMatchSnapshot();
});

it('generate webpub from a single-document publication', async () => {
  vol.fromJSON({
    '/work/input/webbook.html': /* html */ `
      <html lang="en">
      <head>
        <title>Document with toc</title>
        <link rel="publication" href="#wp_manifest">
        <script type="application/ld+json" id="wp_manifest">
          ${JSON.stringify({
            '@context': [
              'https://schema.org',
              'https://www.w3.org/ns/wp-context',
            ],
            conformsTo: 'yuno',
            resources: ['assets/figure.svg'],
            readingOrder: ['#foo', '../bar.html', 'subdir/index.html'],
          })}
        </script>
      </head>
      <body>

      </body>
      </html>
    `,
    '/work/input/subdir/index.html': /* html */ `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <title>Doc title</title>
        <link rel="stylesheet" href="../assets/subdir.css">
      </head>
      <body>
      </body>
      </html>
    `,
    '/work/input/assets/figure.svg': '<svg></svg>',
    '/work/input/assets/subdir.css': '',
  });
  await build({
    input: '/work/input/webbook.html',
    targets: [{ path: '/work/output', format: 'webpub' }],
  });

  expect(toTree(vol)).toMatchSnapshot();
  const file = vol.toJSON();
  const entry = file['/work/output/webbook.html'];
  expect(await format(entry as string, { parser: 'html' })).toMatchSnapshot();
});

it('generate webpub from a remote HTML document', async () => {
  vol.fromJSON({
    '/work/input/index.html': /* html */ `
      <html lang="en">
      <head>
        <title>Document</title>
        <link rel="stylesheet" type="text/css" href="../assets/style.css">
      </head>
      <body>
      </body>
      </html>
    `,
    '/work/assets/style.css': '',
  });
  await build({
    input: 'https://example.com/work/input',
    targets: [{ path: '/work/output', format: 'webpub' }],
  });
  expect(toTree(vol)).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json'] as string);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();
  const entry = file['/work/output/work/input/index.html'];
  expect(await format(entry as string, { parser: 'html' })).toMatchSnapshot();
});

it('generate webpub with complex copyAsset settings', async () => {
  const config: VivliostyleConfigSchema = {
    copyAsset: {
      includes: [
        // The following line should also work, but under the mock environment of memfs, fast-glob does not work without '/**'.
        // 'node_modules/pkgB',
        'node_modules/pkgB/**',
      ],
      excludes: ['cover.png'],
      includeFileExtensions: ['jxl'],
      excludeFileExtensions: ['svg'],
    },
    entry: ['doc.md'],
    output: ['/work/output'],
    workspaceDir: '.vs',
  };
  vol.fromJSON({
    '/work/input/vivliostyle.config.json': JSON.stringify(config),
    '/work/input/package.json': '',
    '/work/input/doc.md': 'yuno',
    '/work/input/cover.png': '',
    '/work/input/assetA.jxl': '',
    '/work/input/assetB.svg': '',
    '/work/input/node_modules/pkgA/img.png': '',
    '/work/input/node_modules/pkgB/a.html': '',
    '/work/input/node_modules/pkgB/bar/b.html': '',
  });
  await build({
    configPath: '/work/input/vivliostyle.config.json',
  });

  expect(toTree(vol)).toMatchSnapshot();
});

it('copy webpub assets properly', async () => {
  const config: VivliostyleConfigSchema = {
    entry: ['doc.md'],
    output: ['/work/input/output1', '/work/input/output2'],
    theme: ['themeA', '@org/themeB'],
  };
  vol.fromJSON({
    '/work/input/vivliostyle.config.json': JSON.stringify(config),
    '/work/input/package.json': '',
    '/work/input/doc.md': 'yuno',
    '/work/input/node_modules/pkgA/a.html': '',
    '/work/input/node_modules/pkgA/a.css': '',
    '/work/input/themes/packages/themeA/package.json': '{"main": "theme.css"}',
    '/work/input/themes/packages/themeA/theme.css': '',
    '/work/input/themes/packages/themeA/example/a.css': '',
    '/work/input/themes/packages/@org/themeB/package.json':
      '{"main": "theme.css"}',
    '/work/input/themes/packages/@org/themeB/theme.css': '',
    '/work/input/themes/packages/@org/themeB/example/a.css': '',
  });
  await build({
    configPath: '/work/input/vivliostyle.config.json',
  });

  expect(toTree(vol)).toMatchSnapshot();
});
