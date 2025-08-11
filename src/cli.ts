#!/usr/bin/env node

import { Command } from 'commander';
import { cliVersion, coreVersion } from './const.js';

const version = `cli: ${cliVersion}
core: ${coreVersion}`;

const program = new Command();
program
  .name('vivliostyle')
  .version(version, '-v, --version')
  .command('init', 'create vivliostyle config', {
    executableFile: 'commands/init',
  })
  .command('create', 'scaffold a new Vivliostyle project', {
    executableFile: 'commands/create',
  })
  .command('build', 'build and create PDF file', {
    executableFile: 'commands/build',
  })
  .command('preview', 'launch preview server', {
    executableFile: 'commands/preview',
  })
  .parse(process.argv);
