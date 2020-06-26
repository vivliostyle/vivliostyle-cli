import program from 'commander';
import chalk from 'chalk';
import path from 'path';
import process from 'process';

import { gracefulError, log, startLogging, stopLogging } from '../util';
import {
  mergeConfig,
  getVivliostyleConfigPath,
  collectVivliostyleConfig,
  CliFlags,
  validateTimeout,
} from '../config';
import { buildArtifacts } from '../builder';
import { buildPDF } from '../pdf';

export interface BuildCliFlags extends CliFlags {}

program
  .name('vivliostyle build')
  .description('build and create PDF file')
  .arguments('<input>')
  .option('-c, --config <config_file>', 'path to vivliostyle.config.js')
  .option(
    '-o, --out-file <output file>',
    `specify output file path (default ./output.pdf)`,
  )
  .option('-d, --out-dir <output directory>', `specify output directory`)
  .option('-t, --theme <theme>', 'theme path or package name')
  .option(
    '-s, --size <size>',
    `output pdf size (ex: 'A4' 'JIS-B5' '182mm,257mm' '8.5in,11in')`,
  )
  .option('--title <title>', 'title')
  .option('--author <author>', 'author')
  .option('--language <language>', 'language')
  .option(
    '--press-ready',
    `make generated PDF compatible with press ready PDF/X-1a`,
  )
  .option(
    '--entry-context <context directory>',
    `specify assets root path (default directory of input file)`,
  )
  .option('--verbose', 'verbose log output')
  .option(
    '--timeout <seconds>',
    `timeout limit for waiting Vivliostyle process (default: 60s)`,
    validateTimeout,
  )
  .option(
    '--force-document-mode',
    `force document mode. Further reading: http://vivliostyle.github.io/vivliostyle.js/docs/en/`,
  )
  .option(
    '--no-sandbox',
    `launch chrome without sandbox (use this option to avoid ECONNREFUSED error)`,
  )
  .option(
    '--executable-chromium <path>',
    'specify a path of executable Chrome(Chromium) you installed',
  )
  .parse(process.argv);

build({
  configPath: program.config,
  input: program.args?.[0] || program.input,
  title: program.title,
  author: program.author,
  theme: program.theme,
  size: program.size,
  pressReady: program.pressReady,
  outDir: program.outDir,
  outFile: program.outFile,
  language: program.language,
  entryContext: program.entryContext,
  verbose: program.verbose,
  timeout: program.timeout,
  sandbox: program.sandbox,
  executableChromium: program.executableChromium,
}).catch(gracefulError);

export default async function build(cliFlags: BuildCliFlags) {
  startLogging('Building manuscripts');

  const vivliostyleConfigPath = getVivliostyleConfigPath(cliFlags.configPath);
  const vivliostyleConfig = collectVivliostyleConfig(vivliostyleConfigPath);

  const context = vivliostyleConfig
    ? path.dirname(vivliostyleConfigPath)
    : process.cwd();

  const config = await mergeConfig(cliFlags, vivliostyleConfig, context);

  // build artifacts
  const manifestPath = buildArtifacts(config);

  // generate PDF
  const output = await buildPDF({
    ...config,
    input: manifestPath,
  });

  stopLogging('Generated successfully.', '🎉');

  log(`\n${chalk.bold(output)} has been created.`);

  // TODO: gracefully exit broker & source server
  process.exit(0);
}
