#!/usr/bin/env node

import program from 'commander';

const packageJSON = require('../package.json');

program
  .name('vivliostyle')
  .version(packageJSON.version, '-v, --version')
  .command('build', 'build and create PDF file', {
    executableFile: 'commands/build',
  })
  .command('preview', 'launch preview server', {
    executableFile: 'commands/preview',
  })
  .parse(process.argv);
