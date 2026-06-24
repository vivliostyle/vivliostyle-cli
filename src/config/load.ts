import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import terminalLink from 'terminal-link';
import upath from 'upath';
import * as v from 'valibot';
import { cyan, underline } from 'yoctocolors';

import { Logger } from '../logger.js';
import {
  cwd as defaultRoot,
  DetailError,
  parseJsonc,
  prettifySchemaError,
  toError,
} from '../util.js';
import {
  type InlineOptions,
  type ParsedVivliostyleConfigSchema,
  VivliostyleConfigSchema,
} from './schema.js';

const require = createRequire(import.meta.url);

export function locateVivliostyleConfig({
  config,
  cwd = defaultRoot,
}: Pick<InlineOptions, 'config' | 'cwd'>): string | undefined {
  if (config) {
    return upath.resolve(cwd, config);
  }
  return ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.json']
    .map((ext) => upath.join(cwd, `vivliostyle.config${ext}`))
    .find((p) => fs.existsSync(p));
}

export async function loadVivliostyleConfig({
  config,
  configData,
  cwd,
}: Pick<InlineOptions, 'config' | 'configData' | 'cwd'>): Promise<
  ParsedVivliostyleConfigSchema | undefined
> {
  if (configData) {
    return v.parse(VivliostyleConfigSchema, configData);
  }

  const absPath = locateVivliostyleConfig({ config, cwd });
  if (!absPath) {
    return;
  }

  let parsedConfig: unknown;
  let jsonRaw: string | undefined;
  try {
    if (upath.extname(absPath) === '.json') {
      jsonRaw = fs.readFileSync(absPath, 'utf8');
      parsedConfig = parseJsonc(jsonRaw);
    } else {
      // Clear require cache to reload CJS config files
      Reflect.deleteProperty(require.cache, require.resolve(absPath));
      const url = pathToFileURL(absPath);
      // Invalidate cache for ESM config files
      // https://github.com/nodejs/node/issues/49442
      url.search = `version=${Date.now()}`;
      // oxlint-disable-next-line typescript/no-unsafe-member-access -- dynamic config import resolves to an untyped module; validated by the schema below
      parsedConfig = (await import(/* @vite-ignore */ url.href)).default;
      jsonRaw = JSON.stringify(parsedConfig, null, 2);
    }
  } catch (error) {
    const thrownError = toError(error);
    throw new DetailError(
      `An error occurred on loading a config file: ${absPath}`,
      thrownError.stack ?? thrownError.message,
    );
  }

  const result = v.safeParse(VivliostyleConfigSchema, parsedConfig);
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
  }
  const errorString = prettifySchemaError(jsonRaw, result.issues);
  throw new DetailError(
    `Validation of vivliostyle config failed. Please check the schema: ${config}`,
    errorString,
  );
}

export function warnDeprecatedConfig(
  config: ParsedVivliostyleConfigSchema,
): void {
  /* oxlint-disable typescript/no-deprecated -- This function intentionally inspects deprecated config fields to emit migration warnings */
  if (config.tasks.some((task) => task.includeAssets)) {
    Logger.logWarn(
      "'includeAssets' property of Vivliostyle config was deprecated and will be removed in a future release. Please use 'copyAsset.includes' property instead.",
    );
  }

  if (config.tasks.some((task) => task.tocTitle)) {
    Logger.logWarn(
      "'tocTitle' property of Vivliostyle config was deprecated and will be removed in a future release. Please use 'toc.title' property instead.",
    );
  }

  if (config.tasks.some((task) => task.http)) {
    Logger.logWarn(
      "'http' property of Vivliostyle config was deprecated and will be removed in a future release. This option is enabled by default, and the file protocol is no longer supported.",
    );
  }

  if (config.tasks.some((task) => task.pressReady !== undefined)) {
    Logger.logWarn(
      "'pressReady' property of Vivliostyle config was deprecated and will be removed in a future release. Please use 'pdfPostprocess.preflight: \"press-ready\"' property instead.",
    );
  }

  if (
    config.tasks.some(
      (task) => task.output && [task.output].flat().some((o) => o.preflight),
    )
  ) {
    Logger.logWarn(
      "'preflight' property of output config was deprecated and will be removed in a future release. Please use 'pdfPostprocess.preflight' property instead.",
    );
  }

  if (
    config.tasks.some(
      (task) =>
        task.output && [task.output].flat().some((o) => o.preflightOption),
    )
  ) {
    Logger.logWarn(
      "'preflightOption' property of output config was deprecated and will be removed in a future release. Please use 'pdfPostprocess.preflightOption' property instead.",
    );
  }
  /* oxlint-enable typescript/no-deprecated */

  if (
    config.inlineOptions.renderMode === 'docker' ||
    config.tasks.some(
      (task) =>
        task.output &&
        [task.output].flat().some((o) => o.renderMode === 'docker'),
    )
  ) {
    const issueUrl =
      'https://github.com/vivliostyle/vivliostyle-cli/issues/823';
    const issueLinkText = underline(issueUrl);
    const issueLink = terminalLink(issueLinkText, issueUrl, {
      fallback: () => issueLinkText,
    });
    Logger.logWarn(
      `'renderMode: docker' option was deprecated and may be removed in a future major release.\n${cyan(
        `     See ${issueLink} for details and to share your feedback.`,
      )}`,
    );
  }
}
