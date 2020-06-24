#!/usr/bin/env node

import program from 'commander';

const packageJSON = require('../package.json');

program
  .name('vivliostyle')
  .version(packageJSON.version, '-v, --version')
  .command('build', 'build and create PDF file', {
    executableFile: 'cli-build',
  })
  .command('preview <input>', 'launch preview server', {
    executableFile: 'cli-preview',
  })
  .parse(process.argv);
