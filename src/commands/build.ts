import chalk from 'chalk';
import process from 'process';
import shelljs from 'shelljs';
import terminalLink from 'terminal-link';
import path from 'upath';
import { buildArtifacts } from '../builder';
import { collectVivliostyleConfig, mergeConfig } from '../config';
import { buildPDF } from '../pdf';
import {
  gracefulError,
  log,
  startLogging,
  stopLogging,
  useTmpDirectory,
} from '../util';
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

  const [tmpDir, clear] = await useTmpDirectory();

  try {
    const config = await mergeConfig(
      cliFlags,
      vivliostyleConfig,
      context,
      tmpDir,
    );

    // build artifacts
    const { manifestPath } = await buildArtifacts(config);

    // generate files
    for (const target of config.outputs) {
      let output: string | null = null;
      if (target.format === 'pdf') {
        output = await buildPDF({
          ...config,
          input: manifestPath,
          output: target.path,
        });
      } else if (target.format === 'webbook') {
        const silentMode = shelljs.config.silent;
        shelljs.config.silent = true;
        const stderr =
          shelljs.mkdir('-p', target.path).stderr ||
          shelljs.cp('-r', path.join(config.workspaceDir, '*'), target.path)
            .stderr;
        if (stderr) {
          throw new Error(stderr);
        }
        shelljs.config.silent = silentMode;
        output = target.path;
      } else if (target.format === 'pub-manifest') {
        // TODO
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
  } finally {
    clear();
  }
}
