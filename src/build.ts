import chalk from 'chalk';
import terminalLink from 'terminal-link';
import { getExecutableBrowserPath } from './browser.js';
import {
  CliFlags,
  MergedConfig,
  collectVivliostyleConfig,
  mergeConfig,
} from './input/config.js';
import { buildPDF, buildPDFWithContainer } from './output/pdf.js';
import { buildWebPublication } from './output/webbook.js';
import {
  checkOverwriteViolation,
  cleanupWorkspace,
  compile,
  copyAssets,
  prepareThemeDirectory,
} from './processor/compile.js';
import { teardownServer } from './server.js';
import {
  checkContainerEnvironment,
  cwd,
  debug,
  log,
  runExitHandlers,
  setLogLevel,
  startLogging,
  upath,
} from './util.js';

export interface BuildCliFlags extends CliFlags {
  bypassedPdfBuilderOption?: string;
}

export async function getFullConfig(
  cliFlags: BuildCliFlags,
): Promise<MergedConfig[]> {
  const loadedConf = await collectVivliostyleConfig(cliFlags);
  const { vivliostyleConfig, vivliostyleConfigPath } = loadedConf;
  const loadedCliFlags = loadedConf.cliFlags;

  const context = vivliostyleConfig
    ? upath.dirname(vivliostyleConfigPath)
    : cwd;

  const configEntries: MergedConfig[] = [];
  for (const entry of vivliostyleConfig ?? [vivliostyleConfig]) {
    const config = await mergeConfig(loadedCliFlags, entry, context);
    checkUnsupportedOutputs(config);

    // check output path not to overwrite source files
    for (const target of config.outputs) {
      checkOverwriteViolation(config, target.path, target.format);
    }
    configEntries.push(config);
  }
  return configEntries;
}

/**
 * Build publication file(s) from the given configuration.
 *
 * ```ts
 * import { build } from '@vivliostyle/cli';
 * build({
 *   configPath: './vivliostyle.config.js',
 *   logLevel: 'silent',
 * });
 * ```
 *
 * @param cliFlags
 * @returns
 */
export async function build(cliFlags: BuildCliFlags) {
  setLogLevel(cliFlags.logLevel);

  if (cliFlags.bypassedPdfBuilderOption) {
    const option = JSON.parse(cliFlags.bypassedPdfBuilderOption);
    // Host doesn't know browser path inside of container
    option.executableBrowser = getExecutableBrowserPath(
      option.browserType ?? 'chromium',
    );
    debug('bypassedPdfBuilderOption', option);

    const stopLogging = startLogging();
    await buildPDF(option);
    // Stop remaining stream output and kill process
    stopLogging();

    teardownServer();
    return;
  }

  const isInContainer = checkContainerEnvironment();
  const stopLogging = startLogging('Collecting build config');
  const configEntries = await getFullConfig(cliFlags);

  for (const config of configEntries) {
    // build artifacts
    if (config.manifestPath) {
      await cleanupWorkspace(config);
      await prepareThemeDirectory(config);
      await compile(config);
      await copyAssets(config);
    }

    // generate files
    for (const target of config.outputs) {
      let output: string | null = null;
      const { format } = target;
      if (format === 'pdf') {
        if (!isInContainer && target.renderMode === 'docker') {
          output = await buildPDFWithContainer({
            ...config,
            input: (config.manifestPath ??
              config.webbookEntryUrl ??
              config.epubOpfPath) as string,
            target,
          });
        } else {
          output = await buildPDF({
            ...config,
            input: (config.manifestPath ??
              config.webbookEntryUrl ??
              config.epubOpfPath) as string,
            target,
          });
        }
      } else if (format === 'webpub' || format === 'epub') {
        output = await buildWebPublication({
          ...config,
          target,
        });
      }
      if (output) {
        const formattedOutput = chalk.bold.green(upath.relative(cwd, output));
        log(
          `\n${terminalLink(formattedOutput, 'file://' + output, {
            fallback: () => formattedOutput,
          })} has been created.`,
        );
      }
    }

    teardownServer();
  }

  runExitHandlers();
  stopLogging('Built successfully.', '🎉');
}

function checkUnsupportedOutputs({ epubOpfPath, outputs }: MergedConfig) {
  if (epubOpfPath && outputs.some((t) => t.format === 'webpub')) {
    throw new Error(
      'Exporting webpub format from EPUB or OPF file is not supported.',
    );
  }
  if (epubOpfPath && outputs.some((t) => t.format === 'epub')) {
    throw new Error(
      'Exporting EPUB format from EPUB or OPF file is not supported.',
    );
  }
}
