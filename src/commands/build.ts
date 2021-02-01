import chalk from 'chalk';
import process from 'process';
import terminalLink from 'terminal-link';
import path from 'upath';
import { checkOverwriteViolation, compile, copyAssets } from '../builder';
import { collectVivliostyleConfig, mergeConfig, MergedConfig } from '../config';
import { buildPDF } from '../pdf';
import { gracefulError, log, startLogging, stopLogging } from '../util';
import { exportWebbook } from '../webbook';
import { BuildCliFlags, setupBuildParserProgram } from './build.parser';

try {
  const program = setupBuildParserProgram();
  program.parse(process.argv);
  build({
    input: program.args?.[0],
    configPath: program.config,
    targets: program.targets,
    theme: program.theme,
    size: program.size,
    title: program.title,
    author: program.author,
    language: program.language,
    pressReady: program.pressReady,
    verbose: program.verbose,
    timeout: program.timeout,
    sandbox: program.sandbox,
    executableChromium: program.executableChromium,
  }).catch(gracefulError);
} catch (err) {
  gracefulError(err);
}

export default async function build(cliFlags: BuildCliFlags) {
  startLogging('Collecting build config');

  const loadedConf = collectVivliostyleConfig(cliFlags);
  const { vivliostyleConfig, vivliostyleConfigPath } = loadedConf;
  cliFlags = loadedConf.cliFlags;

  const context = vivliostyleConfig
    ? path.dirname(vivliostyleConfigPath)
    : process.cwd();

  const config = await mergeConfig(cliFlags, vivliostyleConfig, context);
  checkUnsupportedOutputs(config);

  // check output path not to overwrite source files
  for (const target of config.outputs) {
    checkOverwriteViolation(config, target.path, target.format);
  }

  // build artifacts
  if (config.manifestPath) {
    await compile(config);
    await copyAssets(config);
  }

  // generate files
  for (const target of config.outputs) {
    let output: string | null = null;
    if (target.format === 'pdf') {
      output = await buildPDF({
        ...config,
        input: (config.manifestPath ??
          config.webbookEntryPath ??
          config.epubOpfPath) as string,
        output: target.path,
      });
    } else if (target.format === 'webbook') {
      if (!config.manifestPath) {
        continue;
      }
      output = await exportWebbook({
        ...config,
        input: config.workspaceDir,
        output: target.path,
      });
    }
    if (output) {
      const formattedOutput = chalk.bold.green(
        path.relative(process.cwd(), output),
      );
      log(
        `\n${terminalLink(formattedOutput, 'file://' + output, {
          fallback: () => formattedOutput,
        })} has been created.`,
      );
    }
  }

  stopLogging('Built successfully.', '🎉');

  process.exit(0);
}

export function checkUnsupportedOutputs({
  webbookEntryPath,
  epubOpfPath,
  outputs,
}: MergedConfig) {
  if (webbookEntryPath && outputs.some((t) => t.format === 'webbook')) {
    throw new Error(
      'Exporting webbook format from single HTML input is not supported.',
    );
  } else if (epubOpfPath && outputs.some((t) => t.format === 'webbook')) {
    throw new Error(
      'Exporting webbook format from EPUB or OPF file is not supported.',
    );
  }
}
