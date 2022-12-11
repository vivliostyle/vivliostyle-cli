import assert from 'node:assert';
import URL from 'node:url';
import path from 'upath';
import { setupBuildParserProgram } from '../src/commands/build.parser.js';
import {
  collectVivliostyleConfig,
  mergeConfig,
  MergedConfig,
} from '../src/config.js';

export const rootPath = path.join(URL.fileURLToPath(import.meta.url), '../..');

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
    ? path.dirname(vivliostyleConfigPath)
    : path.join(rootPath, 'tests');
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
      obj[k] = v.replace(rootPath, '__WORKSPACE__');
    }
  });
};

export const resolveFixture = (p: string) =>
  path.resolve(rootPath, 'tests/fixtures', p);

export function assertSingleItem<T = unknown>(
  value: T | T[],
): asserts value is T {
  return assert(!Array.isArray(value));
}

export function assertArray<T = unknown>(value: T | T[]): asserts value is T[] {
  return assert(Array.isArray(value));
}
