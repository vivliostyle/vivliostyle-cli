#!/usr/bin/env node

import program from 'commander';
import fs from 'fs';
import { join } from 'path';
import resolvePkg from 'resolve-pkg';

const { version: cliVersion } = require(join(__dirname, '../package.json'));
const { version: coreVersion } = JSON.parse(
  fs.readFileSync(
    resolvePkg('@vivliostyle/core', { cwd: __dirname })! + '/package.json',
    'utf8',
  ),
);

const version = `cli: ${cliVersion}
core: ${coreVersion}`;

program
  .name('vivliostyle')
  .version(version, '-v, --version')
  .command('build <input>', 'Launch headless Chrome and build PDF file', {
    executableFile: 'cli-build',
  })
  .command('preview <input>', 'Open preview page', {
    executableFile: 'cli-preview',
  })
  .parse(process.argv);
