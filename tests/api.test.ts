import fileType from 'file-type';
import fs from 'node:fs';
import path from 'upath';
import { build } from '../src/index.js';
import { rootPath } from './commandUtil.js';

const fixtureRoot = path.resolve(rootPath, 'tests/fixtures/wood');
const fixtureFile = path.join(fixtureRoot, 'index.html');

const localTmpDir = path.join(rootPath, 'tmp');
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
  const outputPath = path.join(localTmpDir, 'test-api.pdf');
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
