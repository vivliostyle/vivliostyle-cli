import chalk from 'chalk';
import program from 'commander';
import path from 'upath';
import process from 'process';
import terminalLink from 'terminal-link';
import { buildArtifacts, cleanup } from '../builder';
import {
  CliFlags,
  collectVivliostyleConfig,
  getVivliostyleConfigPath,
  mergeConfig,
  validateTimeoutFlag,
} from '../config';
import { buildPDF } from '../pdf';
import { gracefulError, log, startLogging, stopLogging } from '../util';

export interface BuildCliFlags extends CliFlags {}

program
  .name('vivliostyle build')
  .description('build and create PDF file')
  .arguments('<input>')
  .option(
    '-c, --config <config_file>',
    'path to vivliostyle.config.js [vivliostyle.config.js]',
  )
  .option(
    '-o, --out-file <output file>',
    `specify output file path [<title>.pdf]`,
  )
  .option('-d, --out-dir <output directory>', `specify output directory`)
  .option('-t, --theme <theme>', 'theme path or package name')
  .option(
    '-s, --size <size>',
    `output pdf size [Letter]
preset: A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger
custom(comma separated): 182mm,257mm or 8.5in,11in`,
  )
  .option(
    '-p, --press-ready',
    `make generated PDF compatible with press ready PDF/X-1a [false]`,
  )
  .option('--title <title>', 'title')
  .option('--author <author>', 'author')
  .option('--language <language>', 'language')
  .option('--verbose', 'verbose log output')
  .option('--dist-dir', 'dist dir [.vivliostyle]')
  .option(
    '--timeout <seconds>',
    `timeout limit for waiting Vivliostyle process [60s]`,
    validateTimeoutFlag,
  )
  .option(
    '--no-sandbox',
    `launch chrome without sandbox. use this option when ECONNREFUSED error occurred.`,
  )
  .option(
    '--executable-chromium <path>',
    'specify a path of executable Chrome (or Chromium) you installed',
  )
  .parse(process.argv);

build({
  input: program.args?.[0],
  configPath: program.config,
  outDir: program.outDir,
  outFile: program.outFile,
  theme: program.theme,
  size: program.size,
  title: program.title,
  author: program.author,
  language: program.language,
  pressReady: program.pressReady,
  verbose: program.verbose,
  distDir: program.distDir,
  timeout: program.timeout,
  sandbox: program.sandbox,
  executableChromium: program.executableChromium,
}).catch(gracefulError);

export default async function build(cliFlags: BuildCliFlags) {
  startLogging('Collecting build config');

  const vivliostyleConfigPath = getVivliostyleConfigPath(cliFlags.configPath);
  const vivliostyleConfig = collectVivliostyleConfig(vivliostyleConfigPath);

  const context = vivliostyleConfig
    ? path.dirname(vivliostyleConfigPath)
    : process.cwd();

  const config = await mergeConfig(cliFlags, vivliostyleConfig, context);

  // build artifacts
  cleanup(config.distDir);
  const { manifestPath } = await buildArtifacts(config);

  // generate PDF
  const output = await buildPDF({
    ...config,
    input: manifestPath,
  });

  stopLogging('Built successfully.', '🎉');

  const formattedOutput = chalk.bold.green(
    path.relative(process.cwd(), output),
  );
  log(
    `\n${terminalLink(formattedOutput, 'file://' + output, {
      fallback: () => formattedOutput,
    })} has been created.`,
  );

  // TODO: gracefully exit broker & source server
  process.exit(0);
}
