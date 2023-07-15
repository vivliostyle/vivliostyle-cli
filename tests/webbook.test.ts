/// <reference path="../types/jsdom.d.ts" />
import {
  AbortablePromise,
  BaseOptions,
  ConstructorOptions,
  FetchOptions,
  FileOptions,
  SupportedContentTypes,
} from 'jsdom';
import { fs as memfs, vol } from 'memfs';
import { lookup as mime } from 'mime-types';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { format } from 'prettier';
import { afterEach, expect, it, vi } from 'vitest';
import { build } from '../src/index.js';
import { VivliostyleConfigSchema } from '../src/schema/vivliostyleConfig.schema.js';

vi.mock('node:fs', () => ({
  ...memfs,
  default: memfs,
}));
vi.mock('fs', () => ({
  ...memfs,
  default: memfs,
}));

vi.mock('image-size', () => ({
  imageSize: () => ({ width: 100, height: 100, type: 'png' }),
}));

vi.mock('jsdom', async () => {
  const jsdom = await vi.importActual<typeof import('jsdom')>('jsdom');
  const { JSDOM: JSDOMBase, ResourceLoader: ResourceLoaderBase } = jsdom;

  // https://github.com/jsdom/jsdom/blob/a39e0ec4ce9a8806692d986a7ed0cd565ec7498a/lib/api.js#L183
  function normalizeFromFileOptions(
    filename: string,
    options: FileOptions,
  ): ConstructorOptions {
    const normalized = { ...options } as ConstructorOptions;
    if (normalized.contentType === undefined) {
      const extname = path.extname(filename);
      if (extname === '.xhtml' || extname === '.xht' || extname === '.xml') {
        normalized.contentType = 'application/xhtml+xml';
      }
    }
    if (normalized.url === undefined) {
      normalized.url = pathToFileURL(filename) as any;
    }
    return normalized;
  }

  function mapToLocalPath(urlString: string): string {
    const url = new URL(urlString);
    let pathname = url.pathname;
    if (!path.extname(pathname)) {
      pathname = path.posix.join(pathname, 'index.html');
    }
    return pathname;
  }

  class JSDOM extends JSDOMBase {
    static async fromURL(url: string, options: BaseOptions = {}) {
      const resourceLoader =
        options.resources instanceof ResourceLoader
          ? options.resources
          : new ResourceLoader();
      const fetcher = resourceLoader.fetch(url) as AbortablePromise<Buffer>;
      const buffer = await fetcher;
      if (!buffer) {
        throw new Error();
      }
      return new JSDOMBase(buffer, {
        ...options,
        url,
        contentType: fetcher?.response?.headers[
          'content-type'
        ] as SupportedContentTypes,
      });
    }

    static async fromFile(url: string, options: FileOptions = {}) {
      const buffer = await memfs.promises.readFile(url);
      return new JSDOMBase(buffer, normalizeFromFileOptions(url, options));
    }
  }

  class ResourceLoader extends ResourceLoaderBase {
    _readFile(filePath) {
      return memfs.promises.readFile(filePath) as AbortablePromise<Buffer>;
    }
    fetch(urlString: string, options: FetchOptions = {}) {
      if (/^https?:/.test(urlString)) {
        const url = new URL(urlString);
        const fetcher = this._readFile(
          mapToLocalPath(urlString),
        ) as AbortablePromise<Buffer>;
        fetcher.response = {
          headers: {
            'content-type': mime(url.pathname) || 'text/html',
          },
        } as any;
        return fetcher;
      }
      return super.fetch(urlString, options);
    }
  }
  return { ...jsdom, JSDOM, ResourceLoader };
});

afterEach(() => vol.reset());

it('generate webpub from single markdown file', async () => {
  vol.fromJSON({
    '/work/input/foo.md': '# Hi',
  });
  await build({
    input: '/work/input/foo.md',
    targets: [{ path: '/work/output', format: 'webpub' }],
  });

  expect(vol.toTree()).toMatchSnapshot();
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
  });
  await build({
    configPath: '/work/input/vivliostyle.config.json',
  });

  expect(vol.toTree()).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json'] as string);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();
  const toc = file['/work/output/index.html'];
  expect(format(toc as string, { parser: 'html' })).toMatchSnapshot();

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

  expect(vol.toTree()).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json'] as string);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();
  const entry = file['/work/output/webbook.html'];
  expect(format(entry as string, { parser: 'html' })).toMatchSnapshot();
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

  expect(vol.toTree()).toMatchSnapshot();
  const file = vol.toJSON();
  const entry = file['/work/output/webbook.html'];
  expect(format(entry as string, { parser: 'html' })).toMatchSnapshot();
});

it('generate webpub from a remote HTML document', async () => {
  vol.fromJSON({
    '/work/input/index.html': /* html */ `
      <html lang="en">
      <head>
        <title>Document</title>
        <link rel="stylesheet" type="text/css" href="assets/style.css">
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

  expect(vol.toTree()).toMatchSnapshot();
  const file = vol.toJSON();
  const manifest = JSON.parse(file['/work/output/publication.json'] as string);
  delete manifest.dateModified;
  expect(manifest).toMatchSnapshot();
  const entry = file['/work/output/work/input/index.html'];
  expect(format(entry as string, { parser: 'html' })).toMatchSnapshot();
});
