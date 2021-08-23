#!/usr/bin/env node

import program from 'commander';
import { cliVersion, coreVersion } from './const';

const version = `cli: ${cliVersion}
core: ${coreVersion}`;

program
  .name('vivliostyle')
  .version(version, '-v, --version')
  .command('init', 'create vivliostyle config', {
    executableFile: 'commands/init',
  })
  .command('build', 'build and create PDF file', {
    executableFile: 'commands/build',
  })
  .command('preview', 'launch preview server', {
    executableFile: 'commands/preview',
  })
  .parse(process.argv);
