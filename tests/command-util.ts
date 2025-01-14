import { printTree } from 'json-joy/es6/util/print/printTree';
import { Volume } from 'memfs/lib/volume.js';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import upath from 'upath';
import * as v from 'valibot';
import { ViteDevServer } from 'vite';
import { setupBuildParserProgram } from '../src/commands/build.parser.js';
import {
  parseFlagsToInlineConfig,
  setupConfigFromFlags,
} from '../src/commands/cli-flags.js';
import { setupInitParserProgram } from '../src/commands/init.parser.js';
import { setupPreviewParserProgram } from '../src/commands/preview.parser.js';
import { mergeInlineConfig } from '../src/config/merge.js';
import { build } from '../src/core/build.js';
import { init } from '../src/core/init.js';
import { preview } from '../src/core/preview.js';
import { ResolvedTaskConfig, resolveTaskConfig } from './../src/config/resolve';
import {
  BuildTask,
  LogLevel,
  VivliostyleConfigSchema,
  VivliostyleInlineConfig,
} from './../src/config/schema';

export const rootPath = upath.join(fileURLToPath(import.meta.url), '../..');

export const runCommand = async (
  [command, ...args]: ['init' | 'build' | 'preview', ...string[]],
  {
    cwd,
    config,
    logLevel = 'silent',
    port,
  }: {
    cwd: string;
    config?: VivliostyleConfigSchema;
    logLevel?: LogLevel;
    port?: number;
  },
): Promise<ViteDevServer | void> => {
  let inlineConfig = parseFlagsToInlineConfig(
    ['vivliostyle', command, ...args],
    {
      init: setupInitParserProgram,
      build: setupBuildParserProgram,
      preview: setupPreviewParserProgram,
    }[command],
  );
  inlineConfig = { ...inlineConfig, configData: config, cwd, logLevel, port };
  return await { init, build, preview }[command](inlineConfig);
};

export const createServerMiddleware = async ({
  cwd,
  input,
  config,
}: {
  cwd: string;
  input?: string;
  config?: BuildTask;
}) => {
  const inlineConfig = v.parse(VivliostyleInlineConfig, {
    cwd,
    input,
    configData: config,
    enableStaticServe: true,
    vite: {
      server: { middlewareMode: true },
    },
  } satisfies VivliostyleInlineConfig);

  const server = await preview(inlineConfig);
  return server.middlewares;
};

export const getTaskConfig = async (
  args: string[],
  cwd: string,
  config?: VivliostyleConfigSchema,
): Promise<ResolvedTaskConfig> => {
  const inlineConfig = parseFlagsToInlineConfig(
    ['vivliostyle', ...args],
    setupBuildParserProgram,
  );
  let vivliostyleConfig = config
    ? v.parse(VivliostyleConfigSchema, config)
    : setupConfigFromFlags(inlineConfig);
  vivliostyleConfig = mergeInlineConfig(vivliostyleConfig, {
    ...inlineConfig,
    cwd,
    quick: false,
  });

  const resolvedConfig = resolveTaskConfig(
    vivliostyleConfig.tasks[0],
    vivliostyleConfig.inlineOptions,
  );
  return resolvedConfig;
};

export const maskConfig = (obj: any) => {
  Object.entries(obj).forEach(([k, v]) => {
    if (v && typeof v === 'object') {
      maskConfig(v);
    } else if (k === 'executableBrowser' || k === 'executableChromium') {
      obj[k] = '__EXECUTABLE_CHROMIUM_PATH__';
    } else if (k === 'image') {
      obj[k] = '__IMAGE__';
    } else if (k === 'temporaryFilePrefix') {
      obj[k] = '__TEMPORARY_FILE_PREFIX__';
    } else if (typeof v === 'string') {
      const normalized = v.match(/^(https?|file):\/{2}/) ? v : upath.toUnix(v);
      obj[k] = normalized
        .replace(rootPath, '__WORKSPACE__')
        .replace(/\.vs-\d+\./g, '__TEMPORARY_FILE_PREFIX__')
        .replace(/^(https?|file):\/+/, '$1://');
    }
  });
};

export const resolveFixture = (p?: string) =>
  upath.resolve(rootPath, 'tests/fixtures', p || '');

export function assertSingleItem<T = unknown>(
  value: T | T[],
): asserts value is T {
  return assert(!Array.isArray(value));
}

export function assertArray<T = unknown>(value: T | T[]): asserts value is T[] {
  return assert(Array.isArray(value));
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
