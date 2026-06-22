import assert from 'node:assert';

import { toTreeSync } from '@jsonjoy.com/fs-print';
import { format } from 'oxfmt';
import upath from 'upath';
import * as v from 'valibot';
import type { ViteDevServer } from 'vite';
import { afterEach } from 'vitest';

import { parseBuildCommand } from '../src/commands/build.parser.js';
import { setupConfigFromFlags } from '../src/commands/cli-flags.js';
import { parseCreateCommand } from '../src/commands/create.parser.js';
import { parsePreviewCommand } from '../src/commands/preview.parser.js';
import { mergeInlineConfig } from '../src/config/merge.js';
import { build } from '../src/core/build.js';
import { create } from '../src/core/create.js';
import { preview } from '../src/core/preview.js';
import { parseInitCommand } from './../src/commands/init.parser.js';
import type { ResolvedTaskConfig } from './../src/config/resolve.js';
import { resolveTaskConfig } from './../src/config/resolve.js';
import type { BuildTask, LogLevel } from './../src/config/schema.js';
import {
  VivliostyleConfigSchema,
  VivliostyleInlineConfig,
} from './../src/config/schema.js';

export const rootPath = upath.join(import.meta.filename, '../..');

export const formatHtml = async (content: string): Promise<string> => {
  const { code } = await format('snippet.html', content, {
    printWidth: 80,
    htmlWhitespaceSensitivity: 'strict',
  });
  return code;
};

const runningServers = new Set<ViteDevServer>();
afterEach(async () => {
  for (const server of runningServers) {
    await server.close();
  }
  runningServers.clear();
});

export const runCommand = async (
  [command, ...args]: ['build' | 'preview' | 'create' | 'init', ...string[]],
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
): Promise<ViteDevServer | undefined> => {
  let inlineConfig = {
    build: parseBuildCommand,
    preview: parsePreviewCommand,
    create: parseCreateCommand,
    init: parseInitCommand,
  }[command](['vivliostyle', command, ...args]);
  inlineConfig = { ...inlineConfig, configData: config, cwd, logLevel, port };
  const server = await { build, preview, create, init: create }[command](
    inlineConfig,
  );
  if (server) {
    runningServers.add(server);
  }
  return server;
};

export const createServerMiddleware = async ({
  cwd,
  input,
  config,
}: {
  cwd: string;
  input?: string;
  config?: BuildTask;
}): Promise<ViteDevServer['middlewares']> => {
  const inlineConfig = v.parse(VivliostyleInlineConfig, {
    cwd,
    input,
    configData: config,
    enableStaticServe: true,
    enableViewerStartPage: true,
    vite: {
      server: { middlewareMode: true },
    },
  } satisfies VivliostyleInlineConfig);

  const server = await preview(inlineConfig);
  runningServers.add(server);
  return server.middlewares;
};

// oxlint-disable-next-line require-await -- callers use `await expect(...).rejects`, so synchronous throws must surface as a rejected Promise
export const getTaskConfig = async (
  args: string[],
  cwd: string,
  config?: VivliostyleConfigSchema,
): Promise<ResolvedTaskConfig> => {
  const inlineConfig = parseBuildCommand(['vivliostyle', ...args]);
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

export const maskConfig = (obj: Record<string, unknown>): void => {
  Object.entries(obj).forEach(([k, value]) => {
    if (value && typeof value === 'object') {
      maskConfig(value as Record<string, unknown>);
    } else if (k === 'executableBrowser' || k === 'executableChromium') {
      obj[k] = '__EXECUTABLE_CHROMIUM_PATH__';
    } else if (k === 'image') {
      obj[k] = '__IMAGE__';
    } else if (k === 'temporaryFilePrefix') {
      obj[k] = '__TEMPORARY_FILE_PREFIX__';
    } else if (
      k === 'documentProcessorFactory' ||
      k === 'documentMetadataReader'
    ) {
      // These are function references that cannot be meaningfully compared in snapshots
      Reflect.deleteProperty(obj, k);
    } else if (typeof value === 'string') {
      const normalized = /^(https?|file):\/{2}/v.test(value)
        ? value
        : upath.toUnix(value);
      obj[k] = normalized
        .replace(rootPath, '__WORKSPACE__')
        .replaceAll(/\.vs-\d+\./gv, '__TEMPORARY_FILE_PREFIX__')
        .replace(/^(https?|file):\/+/v, '$1://');
    }
  });
};

export const resolveFixture = (p?: string): string =>
  upath.resolve(rootPath, 'tests/fixtures', p || '');

export function assertSingleItem<T = unknown>(
  value: T | T[],
): asserts value is T {
  return assert.ok(!Array.isArray(value));
}

export function assertArray<T = unknown>(value: T | T[]): asserts value is T[] {
  return assert.ok(Array.isArray(value));
}

/**
 * Modified version of memfs's `toTreeSync` function that sorts by directory item names
 * source: https://github.com/streamich/memfs/blob/cd6c25698536aab8845774c4a0036376a0fd599f/src/print/index.ts#L6-L30
 */
export function toTree(
  ...[fs, opts]: Parameters<typeof toTreeSync>
): ReturnType<typeof toTreeSync> {
  const modFs = new Proxy(fs, {
    get(target, prop) {
      if (prop === 'readdirSync') {
        return (...params: unknown[]) => {
          const list = (
            Reflect.get(target, prop) as (
              ...args: unknown[]
            ) => { name: string }[]
          ).call(target, ...params);
          return list.toSorted((a, b) => (a.name > b.name ? 1 : -1));
        };
      }
      return Reflect.get(target, prop);
    },
  });
  return toTreeSync(modFs, {
    ...opts,
  });
}
