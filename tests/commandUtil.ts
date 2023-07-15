/// <reference path="../types/jsdom.d.ts" />
import {
  AbortablePromise,
  BaseOptions,
  ConstructorOptions,
  FetchOptions,
  FileOptions,
  SupportedContentTypes,
} from 'jsdom';
import { printTree } from 'json-joy/es6/util/print/printTree';
import { fs as memfs } from 'memfs';
import { Volume } from 'memfs/lib/volume.js';
import { lookup as mime } from 'mime-types';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { vi } from 'vitest';
import { setupBuildParserProgram } from '../src/commands/build.parser.js';
import {
  MergedConfig,
  collectVivliostyleConfig,
  mergeConfig,
} from '../src/input/config.js';
import { upath } from '../src/util.js';

export const rootPath = upath.join(fileURLToPath(import.meta.url), '../..');

export const getMergedConfig = async (
  args: string[],
): Promise<MergedConfig | MergedConfig[]> => {
  const program = setupBuildParserProgram().parse([
    'vivliostyle',
    'build',
    ...args,
  ]);
  const options = program.opts();
  const { vivliostyleConfig, vivliostyleConfigPath, cliFlags } =
    await collectVivliostyleConfig({
      ...program.opts(),
      input: program.args?.[0],
      configPath: options.config,
      targets: options.targets,
    });
  const context = vivliostyleConfig
    ? upath.dirname(vivliostyleConfigPath)
    : upath.join(rootPath, 'tests');
  const config = await Promise.all(
    (vivliostyleConfig ?? [vivliostyleConfig]).map((entry) =>
      mergeConfig(cliFlags, entry, context),
    ),
  );
  return config.length > 1 ? config : config[0];
};

export const maskConfig = (obj: any) => {
  Object.entries(obj).forEach(([k, v]) => {
    if (v && typeof v === 'object') {
      maskConfig(v);
    } else if (k === 'executableBrowser' || k === 'executableChromium') {
      obj[k] = '__EXECUTABLE_CHROMIUM_PATH__';
    } else if (k === 'image') {
      obj[k] = '__IMAGE__';
    } else if (typeof v === 'string') {
      const normalized = v.match(/^(https?|file):\/{2}/) ? v : upath.toUnix(v);
      obj[k] = normalized
        .replace(rootPath, '__WORKSPACE__')
        .replace(/^(https?|file):\/+/, '$1://');
    }
  });
};

export const resolveFixture = (p: string) =>
  upath.resolve(rootPath, 'tests/fixtures', p);

export function assertSingleItem<T = unknown>(
  value: T | T[],
): asserts value is T {
  return assert(!Array.isArray(value));
}

export function assertArray<T = unknown>(value: T | T[]): asserts value is T[] {
  return assert(Array.isArray(value));
}

export async function getMockedJSDOM(): Promise<typeof import('jsdom')> {
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
}

export function getMockedTmp() {
  const mod = {
    __callCount: 0,
    dir: (_, cb) => {
      const target = `/tmp/${++mod.__callCount}`;
      memfs.mkdirSync(target, { recursive: true });
      cb(null, target);
    },
  };
  return { default: mod } as unknown as typeof import('tmp') & {
    __callCount: number;
  };
}

/**
 * Modified version of memfs's `toTreeSync` function that sorts by directory item names
 * source: https://github.com/streamich/memfs/blob/cd6c25698536aab8845774c4a0036376a0fd599f/src/print/index.ts#L6-L30
 */
export function toTree(
  fs: Volume,
  opts: {
    dir?: string;
    tab?: string;
    depth?: number;
  } = {},
) {
  const separator = '/';
  let dir = opts.dir || separator;
  if (dir[dir.length - 1] !== separator) dir += separator;
  const tab = opts.tab || '';
  const depth = 10;
  let subtree = ' (...)';
  if (depth > 0) {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    list.sort((a, b) => (a.name > b.name ? 1 : -1));
    subtree = printTree(
      tab,
      list.map((entry) => (tab) => {
        if (entry.isDirectory()) {
          return toTree(fs, { dir: dir + entry.name, depth: depth - 1, tab });
        } else if (entry.isSymbolicLink()) {
          return '' + entry.name + ' → ' + fs.readlinkSync(dir + entry.name);
        } else {
          return '' + entry.name;
        }
      }),
    );
  }
  return `${upath.basename(dir)}${separator}${subtree}`;
}
