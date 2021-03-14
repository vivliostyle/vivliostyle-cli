#!/usr/bin/env node

import program from 'commander';
import fs from 'fs';
import resolvePkg from 'resolve-pkg';
import { join } from 'upath';
import { readJSON } from './util';

const { version: cliVersion } = readJSON(join(__dirname, '../package.json'));
const { version: coreVersion } = JSON.parse(
  fs.readFileSync(
    resolvePkg('@vivliostyle/viewer', { cwd: __dirname })! + '/package.json',
    'utf8',
  ),
);

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
