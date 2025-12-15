#!/usr/bin/env node

import { Command } from 'commander';
import { versionForDisplay } from './const.js';

const program = new Command();
program
  .name('vivliostyle')
  .version(versionForDisplay, '-v, --version')
  .command('create', 'Scaffold a new Vivliostyle project', {
    executableFile: 'commands/create',
  })
  .command('init', 'Create a Vivliostyle configuration file', {
    executableFile: 'commands/init',
  })
  .command('build', 'Create PDF, EPUB, and other publication files', {
    executableFile: 'commands/build',
  })
  .command('preview', 'Open the preview page and interactively save PDFs', {
    executableFile: 'commands/preview',
  })
  .parse(process.argv);
