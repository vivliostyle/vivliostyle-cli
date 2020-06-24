// cli-build will be called when we uses `build` subcommand

import path from 'path';
import program from 'commander';
import chalk from 'chalk';
import build from './lib/build';

const runningVivliostyleTimeout = 60 * 1000;

program
  .name('vivliostyle build')
  .description('Launch headless Chrome and save PDF file')
  .arguments('<input>')
  .option('-c, --config <config_file>', 'path to vivliostyle.config.js')
  .option(
    '-o, --output <output_file>',
    `specify output file path (default output.pdf)`,
  )
  .option(
    '-r, --root <root_directory>',
    `specify assets root path (default directory of input file)`,
  )
  .option('-t, --theme', 'theme path or package name')
  .option(
    '-s, --size <size>',
    `output pdf size (ex: 'A4' 'JIS-B5' '182mm,257mm' '8.5in,11in')`,
  )
  .option(
    '--press-ready',
    `make generated PDF compatible with press ready PDF/X-1a`,
  )
  .option('--verbose', 'verbose log output')
  .option(
    '-t, --timeout <seconds>',
    `timeout limit for waiting Vivliostyle process (default: 60s)`,
    (val) =>
      Number.isFinite(+val) && +val > 0
        ? +val * 1000
        : runningVivliostyleTimeout,
  )
  .option(
    '--document-mode',
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
  rootDir: program.root,
  input: program.args?.[0] || program.input,
  outFile: program.output,
  theme: program.theme,
  size: program.size,
  pressReady: program.pressReady,
  verbose: program.verbose,
  timeout: program.timeout,
  loadMode: program.documentMode,
  sandbox: program.sandbox,
  executableChromium: program.executableChromium,
}).catch((err) => {
  console.error(`${chalk.red.bold('Error:')} ${err.message}`);
  console.log(`
If you think this is a bug, please report at https://github.com/vivliostyle/vivliostyle-cli/issues`);
  process.exit(1);
});
