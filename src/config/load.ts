import chalk from 'chalk';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import upath from 'upath';
import * as v from 'valibot';
import {
  cwd as defaultRoot,
  DetailError,
  logWarn,
  parseJsonc,
  prettifySchemaError,
} from '../util.js';
import {
  ParsedVivliostyleConfigSchema,
  VivliostyleConfigSchema,
} from './schema.js';

const require = createRequire(import.meta.url);

function locateVivliostyleConfig(cwd: string) {
  return ['.js', '.mjs', '.cjs', '.json']
    .map((ext) => upath.join(cwd, `vivliostyle.config${ext}`))
    .find((p) => fs.existsSync(p));
}

export async function loadVivliostyleConfig({
  configPath,
  cwd,
}: {
  configPath?: string;
  cwd?: string;
}): Promise<ParsedVivliostyleConfigSchema | undefined> {
  const absPath = configPath
    ? upath.resolve(cwd ?? defaultRoot, configPath)
    : locateVivliostyleConfig(cwd ?? defaultRoot);
  if (!absPath) {
    return;
  }

  let config: unknown;
  let jsonRaw: string | undefined;
  try {
    if (upath.extname(absPath) === '.json') {
      jsonRaw = fs.readFileSync(absPath, 'utf8');
      config = parseJsonc(jsonRaw);
    } else {
      // Clear require cache to reload CJS config files
      delete require.cache[require.resolve(absPath)];
      const url = pathToFileURL(absPath);
      // Invalidate cache for ESM config files
      // https://github.com/nodejs/node/issues/49442
      url.search = `version=${Date.now()}`;
      config = (await import(/* @vite-ignore */ url.href)).default;
      jsonRaw = JSON.stringify(config, null, 2);
    }
  } catch (error) {
    const thrownError = error as Error;
    throw new DetailError(
      `An error occurred on loading a config file: ${absPath}`,
      thrownError.stack ?? thrownError.message,
    );
  }

  const result = v.safeParse(VivliostyleConfigSchema, config);
  if (result.success) {
    const { tasks, inlineOptions } = result.output;
    return {
      tasks,
      inlineOptions: {
        ...inlineOptions,
        cwd: cwd ?? defaultRoot,
        config: absPath,
      },
    };
  } else {
    const errorString = prettifySchemaError(jsonRaw, result.issues);
    throw new DetailError(
      `Validation of vivliostyle config failed. Please check the schema: ${configPath}`,
      errorString,
    );
  }
}

export function warnDeprecatedConfig(config: ParsedVivliostyleConfigSchema) {
  if (config.tasks.some((task) => task.includeAssets)) {
    logWarn(
      chalk.yellowBright(
        "'includeAssets' property of Vivliostyle config was deprecated and will be removed in a future release. Please use 'copyAsset.includes' property instead.",
      ),
    );
  }

  if (config.tasks.some((task) => task.tocTitle)) {
    logWarn(
      chalk.yellowBright(
        "'tocTitle' property of Vivliostyle config was deprecated and will be removed in a future release. Please use 'toc.title' property instead.",
      ),
    );
  }
}