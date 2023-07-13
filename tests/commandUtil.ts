import assert from 'node:assert';
import URL from 'node:url';
import { setupBuildParserProgram } from '../src/commands/build.parser.js';
import {
  collectVivliostyleConfig,
  mergeConfig,
  MergedConfig,
} from '../src/input/config.js';
import { upath } from '../src/util.js';

export const rootPath = upath.join(URL.fileURLToPath(import.meta.url), '../..');

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
