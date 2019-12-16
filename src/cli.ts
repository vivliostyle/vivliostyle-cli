#!/usr/bin/env node

import program from 'commander';

const packageJSON = require('../package.json');

program
  .name('vivliostyle')
  .version(packageJSON.version, '-v, --version')
  .command('save <input>', 'Launch headless Chrome and save PDF file')
  .command('preview <input>', 'Open preview page and save PDF interactively')
  .parse(process.argv);
