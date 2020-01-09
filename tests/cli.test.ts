import fs from 'fs';
import path from 'path';
import execa from 'execa';
import fileType from 'file-type';
import readChunk from 'read-chunk';

const rootPath = path.resolve(__dirname, '..');
const packageJSON = require(path.join(rootPath, 'package.json'));
const cliPath = path.join(rootPath, packageJSON.bin.vivliostyle);
const fixturePath = path.resolve(__dirname, 'fixtures');
const fixtureProjectPath = path.join(fixturePath, 'wood');

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

function vivliostyleCLI(args: string[]) {
  return execa(cliPath, args, { cwd: rootPath });
}

it('show version', async () => {
  const { stdout } = await vivliostyleCLI(['--version']);
  expect(stdout).toEqual(packageJSON.version);
});

it('generate pdf without errors', async () => {
  const outputPath = path.join(localTmpDir, 'test.pdf');
  cleanUp(outputPath);

  try {
    const response = await vivliostyleCLI([
      'build',
      fixtureProjectPath,
      '-b',
      '-s',
      'A4',
      '-o',
      outputPath,
    ]);
    expect(response.stdout).toContain('Generating PDF');
  } catch (err) {
    throw err.stderr;
  }

  // mimetype test
  const buffer = readChunk.sync(outputPath, 0, fileType.minimumBytes);
  const type = fileType(buffer)!;
  expect(type.mime).toEqual('application/pdf');
}, 20000);

it('generate press-ready pdf without errors', async () => {
  const outputPath = path.join(localTmpDir, 'test-press-ready.pdf');
  cleanUp(outputPath);

  try {
    const response = await vivliostyleCLI([
      'build',
      fixtureProjectPath,
      '-b',
      '-s',
      'A4',
      '-o',
      outputPath,
      '--press-ready',
    ]);
  } catch (err) {
    throw err.stderr;
  }

  // mimetype test
  const buffer = readChunk.sync(outputPath, 0, fileType.minimumBytes);
  const type = fileType(buffer)!;
  expect(type.mime).toEqual('application/pdf');
}, 20000);
