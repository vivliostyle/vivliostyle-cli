import {
  AbortablePromise,
  BaseOptions,
  ConstructorOptions,
  FetchOptions,
  FileOptions,
  SupportedContentTypes,
} from '@vivliostyle/jsdom';
import { vi } from 'vitest';

const mocked = await vi.hoisted(async () => {
  const { fs: memfs } = await import('memfs');
  const { lookup: mime } = await import('mime-types');
  const { default: path } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { mockRequire } = await import('./index.js');

  const jsdom =
    await vi.importActual<typeof import('@vivliostyle/jsdom')>(
      '@vivliostyle/jsdom',
    );
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
    return decodeURI(pathname);
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

  const mod = { ...jsdom, JSDOM, ResourceLoader };
  await mockRequire('@vivliostyle/jsdom', mod);
  return { '@vivliostyle/jsdom': mod };
});

vi.mock('@vivliostyle/jsdom', () => mocked['@vivliostyle/jsdom']);
