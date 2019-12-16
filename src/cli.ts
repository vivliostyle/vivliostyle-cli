#!/usr/bin/env node

import path from 'path';
import program from 'commander';
import preview from './lib/preview';
import save from './lib/save';

const packageJSON = require('../package.json');
const runningVivliostyleTimeout = 60 * 1000;

program
  .arguments('<input>')
  .version(packageJSON.version)
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
    '--preview',
    `open preview page and save PDF interactively
                             If preview option is set, options below this line will be ignored.`,
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
  .parse(process.argv);

if (program.args.length < 1) {
  program.help();
}

if (program.preview) {
  preview({
    input: path.resolve(process.cwd(), program.args[0]),
    rootDir: program.root && path.resolve(process.cwd(), program.root),
    loadMode: program.book ? 'book' : 'document',
    sandbox: program.sandbox,
  });
} else {
  save({
    input: path.resolve(process.cwd(), program.args[0]),
    outputPath: path.resolve(process.cwd(), program.output),
    size: program.size,
    vivliostyleTimeout: program.timeout,
    rootDir: program.root && path.resolve(process.cwd(), program.root),
    loadMode: program.book ? 'book' : 'document',
    sandbox: program.sandbox,
  });
}
