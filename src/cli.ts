#!/usr/bin/env node

import program from 'commander';

const packageJSON = require('../package.json');

program
  .name('vivliostyle')
  .version(packageJSON.version, '-v, --version')
  .command('build <input>', 'Launch headless Chrome and build PDF file', {
    executableFile: 'cli-build',
  })
  .command('preview <input>', 'Open preview page', {
    executableFile: 'cli-preview',
  })
  .parse(process.argv);
