#!/usr/bin/env node

import commander from 'commander';
import { cliVersion, coreVersion } from './const';

const version = `cli: ${cliVersion}
core: ${coreVersion}`;

const program = new commander.Command();
program
  .name('vivliostyle')
  .version(version, '-v, --version')
  .command('init', 'create vivliostyle config', {
    executableFile: 'init',
  })
  .command('build', 'build and create PDF file', {
    executableFile: 'build',
  })
  .command('preview', 'launch preview server', {
    executableFile: 'preview',
  })
  .parse(process.argv);
