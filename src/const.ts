import fs from 'fs';
import resolvePkg from 'resolve-pkg';
import { join } from 'upath';
import { readJSON } from './util';

export const MANIFEST_FILENAME = 'publication.json';
export const TOC_FILENAME = 'index.html';
export const TOC_TITLE = 'Table of Contents';

export const { version: cliVersion }: { version: string } = readJSON(
  join(__dirname, '../package.json'),
);
export const { version: coreVersion }: { version: string } = JSON.parse(
  fs.readFileSync(
    resolvePkg('@vivliostyle/viewer', { cwd: __dirname })! + '/package.json',
    'utf8',
  ),
);
