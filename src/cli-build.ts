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
  .option(
    '-b, --book',
    `load document as book mode
                             It can load multi-HTML documents such as an unzipped EPUB and a Web Publication.
                             Please see also http://vivliostyle.github.io/vivliostyle.js/docs/en/`,
  )
  .option(
    '--no-sandbox',
    `launch chrome without sandbox (use this option to avoid ECONNREFUSED error)`,
  )
  .option(
    '-r, --root <root_directory>',
    `specify assets root path (default directory of input file)`,
    undefined,
  )
  .option(
    '-o, --output <output_file>',
    `specify output file path (default output.pdf)`,
    'output.pdf',
  )
  .option(
    '-s, --size <size>',
    `output pdf size (ex: 'A4' 'JIS-B5' '182mm,257mm' '8.5in,11in')`,
  )
  .option(
    '-t, --timeout <time>',
    `timeout times for waiting Vivliostyle process (default: 60s)`,
    (val) =>
      Number.isFinite(+val) && +val > 0
        ? +val * 1000
        : runningVivliostyleTimeout,
  )
  .option(
    '--press-ready',
    `make generated PDF compatible with press ready PDF/X-1a`,
  )
  .option(
    '--executable-chromium <path>',
    'specify a path of executable Chrome(Chromium) you installed',
  )
  .parse(process.argv);

if (program.args.length < 1) {
  program.help();
}

build({
  input: path.resolve(process.cwd(), program.args[0]),
  outputPath: path.resolve(process.cwd(), program.output),
  size: program.size,
  timeout: program.timeout,
  rootDir: program.root && path.resolve(process.cwd(), program.root),
  loadMode: program.book ? 'book' : 'document',
  sandbox: program.sandbox,
  pressReady: program.pressReady,
  executableChromium: program.executableChromium,
}).catch((err) => {
  console.error(`${chalk.red.bold('Error:')} ${err.message}`);
  console.log(`
If you think this is a bug, please report at https://github.com/vivliostyle/vivliostyle-cli/issues`);
  process.exit(1);
});
