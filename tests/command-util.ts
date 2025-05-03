import { toTreeSync } from 'memfs/lib/print/index.js';
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
export function toTree(...[fs, opts]: Parameters<typeof toTreeSync>) {
  const modFs = new Proxy(fs, {
    get(target, prop) {
      if (prop === 'readdirSync') {
        return (...params) => {
          const list = Reflect.get(target, prop).call(target, ...params);
          return list.sort((a, b) => (a.name > b.name ? 1 : -1));
        };
      }
      return Reflect.get(target, prop);
    },
  });
  return toTreeSync(modFs, {
    ...opts,
  });
}
