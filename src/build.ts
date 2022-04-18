import chalk from 'chalk';
import terminalLink from 'terminal-link';
import path from 'upath';
import { getExecutableBrowserPath } from './browser';
import { checkOverwriteViolation, compile, copyAssets } from './builder';
import {
  CliFlags,
  collectVivliostyleConfig,
  mergeConfig,
  MergedConfig,
} from './config';
import { checkContainerEnvironment } from './container';
import { buildPDF, buildPDFWithContainer } from './pdf';
import { teardownServer } from './server';
import { cwd, debug, log, startLogging, stopLogging } from './util';
import { exportWebPublication } from './webbook';

export interface BuildCliFlags extends CliFlags {
  output?: {
    output?: string;
    format?: string;
  }[];
  bypassedPdfBuilderOption?: string;
}

export async function build(cliFlags: BuildCliFlags) {
  if (cliFlags.bypassedPdfBuilderOption) {
    const option = JSON.parse(cliFlags.bypassedPdfBuilderOption);
    // Host doesn't know inside path of chromium path
    option.executableChromium = getExecutableBrowserPath();
    debug('bypassedPdfBuilderOption', option);

    await buildPDF(option);
    log();
    return;
  }

  const isInContainer = checkContainerEnvironment();
  if (!isInContainer) {
    startLogging('Collecting build config');
  }

  const loadedConf = collectVivliostyleConfig(cliFlags);
  const { vivliostyleConfig, vivliostyleConfigPath } = loadedConf;
  cliFlags = loadedConf.cliFlags;

  const context = vivliostyleConfig ? path.dirname(vivliostyleConfigPath) : cwd;

  const configEntries: MergedConfig[] = [];
  for (const entry of vivliostyleConfig ?? [vivliostyleConfig]) {
    const config = await mergeConfig(cliFlags, entry, context);
    checkUnsupportedOutputs(config);

    // check output path not to overwrite source files
    for (const target of config.outputs) {
      checkOverwriteViolation(config, target.path, target.format);
    }
    configEntries.push(config);
  }

  for (const config of configEntries) {
    // build artifacts
    if (config.manifestPath) {
      await compile(config);
      await copyAssets(config);
    }

    // generate files
    for (const target of config.outputs) {
      let output: string | null = null;
      if (target.format === 'pdf') {
        if (!isInContainer && target.renderMode === 'docker') {
          output = await buildPDFWithContainer({
            ...config,
            input: (config.manifestPath ??
              config.webbookEntryPath ??
              config.epubOpfPath) as string,
            target,
          });
        } else {
          output = await buildPDF({
            ...config,
            input: (config.manifestPath ??
              config.webbookEntryPath ??
              config.epubOpfPath) as string,
            target,
          });
        }
      } else if (target.format === 'webpub') {
        if (!config.manifestPath) {
          continue;
        }
        output = await exportWebPublication({
          ...config,
          input: config.workspaceDir,
          output: target.path,
        });
      }
      if (output) {
        const formattedOutput = chalk.bold.green(path.relative(cwd, output));
        log(
          `\n${terminalLink(formattedOutput, 'file://' + output, {
            fallback: () => formattedOutput,
          })} has been created.`,
        );
      }
    }

    teardownServer();
  }

  if (!isInContainer) {
    stopLogging('Built successfully.', '🎉');
  }
}

function checkUnsupportedOutputs({
  webbookEntryPath,
  epubOpfPath,
  outputs,
}: MergedConfig) {
  if (webbookEntryPath && outputs.some((t) => t.format === 'webpub')) {
    throw new Error(
      'Exporting webpub format from single HTML input is not supported.',
    );
  } else if (epubOpfPath && outputs.some((t) => t.format === 'webpub')) {
    throw new Error(
      'Exporting webpub format from EPUB or OPF file is not supported.',
    );
  }
}
