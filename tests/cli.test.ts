import fs from 'fs';
import path from 'path';
import execa from 'execa';
import fileType from 'file-type';
import readChunk from 'read-chunk';

const rootPath = path.resolve(__dirname, '..');
const packageJSON = require(path.join(rootPath, 'package.json'));
const cliPath = path.join(rootPath, packageJSON.bin.vivliostyle);
const fixturePath = path.resolve(__dirname, 'fixtures', 'wood');
const outputPath = path.join(rootPath, 'tmp', 'output.pdf');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

function vivliostyleCLI(args: string[]) {
  return execa(cliPath, args, { cwd: rootPath });
}

it('show version', async () => {
  const { stdout } = await vivliostyleCLI(['--version']);
  expect(stdout).toEqual(packageJSON.version);
});

it('generate pdf without errors', async () => {
  try {
    const response = await vivliostyleCLI([
      'build',
      fixturePath,
      '-b',
      '-s',
      'A4',
      '-o',
      outputPath,
    ]);
    expect(response.stdout).toContain('Printing to PDF');
  } catch (err) {
    throw err.stderr;
  }

  const buffer = readChunk.sync(outputPath, 0, fileType.minimumBytes);
  const type = fileType(buffer)!;
  expect(type.mime).toEqual('application/pdf');
}, 10000);
