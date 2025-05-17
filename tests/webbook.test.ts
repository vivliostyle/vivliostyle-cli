import './mocks/fs.js';
import './mocks/tmp.js';
import './mocks/vivliostyle__jsdom.js';

import { vol } from 'memfs';
import { format } from 'prettier';
import { beforeEach, expect, it, vi } from 'vitest';
import { VivliostyleConfigSchema } from '../src/config/schema.js';
import { runCommand, toTree } from './command-util.js';

const mockedThemeModule = vi.hoisted(() => ({
  checkThemeInstallationNecessity: vi.fn(),
  installThemeDependencies: vi.fn(),
}));

vi.mock('../src/processor/theme', () => mockedThemeModule);

beforeEach(() => vol.reset());

it('generate webpub from single markdown file', async () => {
  vol.fromJSON({
    '/work/input/foo.md': '# Hi',
  });
  await runCommand(['build', './input/foo.md', '-o', 'output'], {
    cwd: '/work',
  });

  expect(toTree(vol, { dir: '/work/output' })).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json'] as string);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();
});

it('generate webpub from vivliostyle.config.js', async () => {
  const themeDir = {
    'mytheme/package.json': JSON.stringify({
      name: 'mytheme',
      main: './%style%.css',
    }),
    'mytheme/%style%.css': '/* style */',
  };
  mockedThemeModule.checkThemeInstallationNecessity.mockImplementationOnce(
    () => true,
  );
  mockedThemeModule.installThemeDependencies.mockImplementationOnce(() => {
    vol.fromJSON(themeDir, '/work/input/.vivliostyle/themes/node_modules');
  });

  const config: VivliostyleConfigSchema = {
    entry: [
      { rel: 'cover', path: 'tmpl/cover-template.html', output: 'cover.html' },
      { rel: 'contents', path: 'tmpl/toc-template.html', output: 'index.html' },
      'doc/one.md',
      'doc/two.md',
      'doc/escape check%.md',
    ],
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
    '/work/input/tmpl/cover-template.html':
      '<html><body><img role="doc-cover" data-test="true" /></body></html>',
    '/work/input/tmpl/toc-template.html':
      '<html><body><nav role="doc-toc" data-test="true"></nav></body></html>',
  });
  vol.fromJSON(themeDir, '/work');
  await runCommand(['build'], { cwd: '/work/input' });

  expect(toTree(vol, { dir: '/work/output' })).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json']!);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();

  const manifest2 = JSON.parse(
    file['/work/input/output/publication.json'] as string,
  );
  delete manifest2.dateModified;
  expect(manifest2).toEqual(manifest);
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
  await runCommand(['build', 'input/webbook.html', '-o', 'output'], {
    cwd: '/work',
  });

  expect(toTree(vol, { dir: '/work/output' })).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json']!);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();
  const entry = file['/work/output/webbook.html']!;
  expect(await format(entry, { parser: 'html' })).toMatchSnapshot();
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
  await runCommand(['build', 'input/webbook.html', '-o', 'output'], {
    cwd: '/work',
  });

  expect(toTree(vol, { dir: '/work/output' })).toMatchSnapshot();
  const file = vol.toJSON();
  const entry = file['/work/output/webbook.html']!;
  expect(await format(entry, { parser: 'html' })).toMatchSnapshot();
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
  await runCommand(
    ['build', 'https://example.com/remote/dir', '-o', 'output'],
    { cwd: '/work' },
  );
  expect(toTree(vol, { dir: '/work/output' })).toMatchSnapshot();
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
  await runCommand(
    [
      'build',
      'https://example.com/remote/foo%20bar%25/escape%20check%25.html',
      '-o',
      'output',
    ],
    { cwd: '/work' },
  );
  expect(toTree(vol, { dir: '/work/output' })).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json']!);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();
  const entry = file['/work/output/remote/foo bar%/escape check%.html']!;
  expect(await format(entry, { parser: 'html' })).toMatchSnapshot();
  expect(file['/work/output/remote/あ/日本語.css']).toBe(
    file['/remote/あ/日本語.css'],
  );
});

it('generate webpub from a data URI input', async () => {
  const html = /* html */ `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title></title></head><body>Hi</body></html>`;
  await runCommand(
    ['build', `data:text/html;charset=utf-8,${html}`, '-o', 'output'],
    { cwd: '/work' },
  );
  await runCommand(
    [
      'build',
      `data:text/html;base64,${Buffer.from(html).toString('base64')}`,
      '-o',
      'output2',
    ],
    { cwd: '/work' },
  );

  expect(toTree(vol, { dir: '/work/output' })).toMatchSnapshot();
  const file = vol.toJSON();
  const entry = file['/work/output/index.html']!;
  const outHtml = await format(entry, { parser: 'html' });
  expect(outHtml).toMatchSnapshot();
  expect(
    await format(file['/work/output2/index.html']!, { parser: 'html' }),
  ).toBe(outHtml);
});

it('generate webpub with complex copyAsset settings', async () => {
  const config: VivliostyleConfigSchema = {
    copyAsset: {
      includes: ['node_modules/pkgB'],
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
  await runCommand(['build'], { cwd: '/work/input' });

  expect(toTree(vol, { dir: '/work/output' })).toMatchSnapshot();
});

it('copy webpub assets properly', async () => {
  const themeDir = {
    'themeA/package.json': '{"main": "theme.css"}',
    'themeA/theme.css': '',
    'themeA/example/a.css': '',
    '@org/themeB/package.json': '{"main": "theme.css"}',
    '@org/themeB/theme.css': '',
    '@org/themeB/example/a.css': '',
  };
  mockedThemeModule.checkThemeInstallationNecessity.mockImplementationOnce(
    () => true,
  );
  mockedThemeModule.installThemeDependencies.mockImplementationOnce(() => {
    vol.fromJSON(themeDir, '/work/input/.vivliostyle/themes/node_modules');
  });

  const config: VivliostyleConfigSchema = {
    entry: ['doc.md'],
    output: ['/work/input/output'],
    theme: ['themeA', '@org/themeB'],
  };
  vol.fromJSON({
    '/work/input/vivliostyle.config.json': JSON.stringify(config),
    '/work/input/package.json': '',
    '/work/input/doc.md': 'yuno',
    '/work/input/node_modules/pkgA/a.html': '',
    '/work/input/node_modules/pkgA/a.css': '',
  });
  await runCommand(['build'], { cwd: '/work/input' });

  expect(toTree(vol, { dir: '/work/input/output' })).toMatchSnapshot();
});
