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
    entry: ['doc/one.md', 'doc/two.md', 'doc/escape check%.md'],
    output: ['/work/input/output', '/work/output'],
    toc: true,
    cover: 'cover.png',
    theme: ['../mytheme', './style sheet.css'],
    readingProgression: 'rtl',
  };
  vol.fromJSON({
    '/work/input/vivliostyle.config.json': JSON.stringify(config),
    '/work/input/doc/one.md': 'yuno',
    '/work/input/doc/two.md': 'yunocchi',
    '/work/input/doc/escape check%.md': 'txt',
    '/work/input/cover.png': '',
    '/work/input/style sheet.css': '/* style */',
    '/work/mytheme/package.json': JSON.stringify({
      name: 'mytheme',
      main: './%style%.css',
    }),
    '/work/mytheme/%style%.css': '/* style */',
    '/work/input/themes/packages/mytheme/package.json': JSON.stringify({
      name: 'mytheme',
      main: './%style%.css',
    }),
    '/work/input/themes/packages/mytheme/%style%.css': '/* style */',
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
            resources: ['assets/%E6%97%A5%E6%9C%AC%E8%AA%9E.svg'],
            readingOrder: [
              '#foo',
              '../bar.html',
              'subdir/index.html',
              'escape%20check%25.html',
            ],
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
    '/work/input/escape check%.html': /* html */ `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <title>Escape check</title>
      </head>
      <body>
      </body>
      </html>
    `,
    '/work/input/assets/日本語.svg': '<svg></svg>',
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
  expect(file['/work/output/escape check%.html']).toBe(
    file['/work/input/escape check%.html'],
  );
  expect(file['/work/output/assets/日本語.svg']).toBe(
    file['/work/input/assets/日本語.svg'],
  );
});

it('generate webpub from remote HTML documents with publication manifest', async () => {
  vol.fromJSON({
    '/remote/dir/index.html': /* html */ `
      <html lang="en">
      <head>
        <title>Document</title>
        <link rel="publication" href="../publication.json">
      </head>
      <body>
      </body>
      </html>
    `,
    '/remote/dir/escape check%.html': /* html */ `
      <!DOCTYPE html>
      <html lang="ja">
      <head>
        <title>Escape check</title>
      </head>
      <body>
      </body>
      </html>
    `,
    '/remote/publication.json': JSON.stringify({
      '@context': ['https://schema.org', 'https://www.w3.org/ns/pub-context'],
      conformsTo: 'yuno',
      resources: ['../assets/%E6%97%A5%E6%9C%AC%E8%AA%9E.png'],
      readingOrder: ['dir/index.html', 'dir/escape%20check%25.html'],
    }),
    '/assets/日本語.png': 'image',
  });
  await build({
    input: 'https://example.com/remote/dir',
    targets: [{ path: '/work/output', format: 'webpub' }],
  });
  expect(toTree(vol)).toMatchSnapshot();
  const file = vol.toJSON();
  expect(file['/work/output/remote/dir/index.html']).toBe(
    file['/remote/dir/index.html'],
  );
  expect(file['/work/output/remote/publication.json']).toBe(
    file['/remote/publication.json'],
  );
  expect(file['/work/output/remote/dir/escape check%.html']).toBe(
    file['/remote/dir/escape check%.html'],
  );
  expect(file['/work/output/assets/日本語.png']).toBe(
    file['/assets/日本語.png'],
  );
});

it('generate webpub from a remote HTML document', async () => {
  vol.fromJSON({
    '/remote/foo bar%/escape check%.html': /* html */ `
      <html lang="en">
      <head>
        <title>Document</title>
        <link rel="stylesheet" type="text/css" href="../%E3%81%82/%E6%97%A5%E6%9C%AC%E8%AA%9E.css">
      </head>
      <body>
      </body>
      </html>
    `,
    '/remote/あ/日本語.css': '/* css */',
  });
  await build({
    input: 'https://example.com/remote/foo%20bar%25/escape%20check%25.html',
    targets: [{ path: '/work/output', format: 'webpub' }],
  });
  expect(toTree(vol)).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json'] as string);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();
  const entry = file['/work/output/remote/foo bar%/escape check%.html'];
  expect(await format(entry as string, { parser: 'html' })).toMatchSnapshot();
  expect(file['/work/output/remote/あ/日本語.css']).toBe(
    file['/remote/あ/日本語.css'],
  );
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
