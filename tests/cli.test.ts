import execa from 'execa';
import fileType from 'file-type';
import fs from 'node:fs';
import upath from 'upath';
import { expect, it } from 'vitest';
import packageJSON from '../package.json';
import { rootPath } from './command-util.js';

const cliPath = upath.join(rootPath, packageJSON.bin.vivliostyle);
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

function vivliostyleCLI(args: string[]) {
  return execa(cliPath, args, { cwd: fixtureRoot, env: { DEBUG: 'vs-cli' } });
}

it('show version', async () => {
  const { stdout } = await vivliostyleCLI(['--version']);
  expect(stdout).toContain(packageJSON.version);
});

it('generate pdf without errors', async () => {
  const outputPath = upath.join(localTmpDir, 'test.pdf');
  cleanUp(outputPath);

  try {
    const response = await vivliostyleCLI([
      'build',
      '-s',
      'A4',
      '-o',
      outputPath,
      fixtureFile,
    ]);
    expect(response.stdout).toContain('has been created');
  } catch (err: any) {
    throw err.stderr;
  }

  // mimetype test
  const type = await fileType.fromFile(outputPath);
  expect(type!.mime).toEqual('application/pdf');
}, 120000);
