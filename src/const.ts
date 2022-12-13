import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import resolvePkg from 'resolve-pkg';
import path from 'upath';
import { readJSON } from './util.js';

export const MANIFEST_FILENAME = 'publication.json';
export const TOC_FILENAME = 'index.html';
export const TOC_TITLE = 'Table of Contents';

export const cliRoot = path.join(fileURLToPath(import.meta.url), '../..');
export const { version: cliVersion }: { version: string } = readJSON(
  path.join(cliRoot, 'package.json'),
);

export const viewerRoot = resolvePkg('@vivliostyle/viewer', { cwd: cliRoot })!;
export const { version: coreVersion }: { version: string } = JSON.parse(
  fs.readFileSync(path.join(viewerRoot, 'package.json'), 'utf8'),
);
