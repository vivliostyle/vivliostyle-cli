import fileType from 'file-type';
import fs from 'fs';
import path from 'upath';
import { build } from '../src';

const rootPath = path.resolve(__dirname, '..');
const fixtureRoot = path.resolve(__dirname, 'fixtures/wood');
const fixtureFile = path.join(fixtureRoot, 'index.html');

const localTmpDir = path.join(rootPath, 'tmp');
fs.mkdirSync(localTmpDir, { recursive: true });

function cleanUp(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
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
}, 20000);
