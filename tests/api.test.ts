import fileType from 'file-type';
import fs from 'node:fs';
import { expect, test } from 'vitest';
import { build } from '../src/index.js';
import { upath } from '../src/util.js';
import { rootPath } from './command-util.js';

const fixtureRoot = upath.resolve(rootPath, 'tests/fixtures/wood');
const fixtureFile = upath.join(fixtureRoot, 'index.html');

const localTmpDir = upath.join(rootPath, 'tmp');
fs.mkdirSync(localTmpDir, { recursive: true });

function cleanUp(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

test('api generates pdf without errors', async () => {
  const outputPath = upath.join(localTmpDir, 'test-api.pdf');
  cleanUp(outputPath);

  await build({
    targets: [
      {
        path: outputPath,
        format: 'pdf',
      },
    ],
    input: fixtureFile,
    size: 'A4',
  });

  // mimetype test
  const type = await fileType.fromFile(outputPath);
  expect(type!.mime).toEqual('application/pdf');
}, 120000);
