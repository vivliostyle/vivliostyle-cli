import path from 'path';
import execa from 'execa';
import fileType from 'file-type';
import readChunk from 'read-chunk';

const rootPath = path.resolve(__dirname, '..');
const packageJSON = require(path.resolve(rootPath, 'package.json'));
const cliPath = path.resolve(rootPath, packageJSON.bin.vivliostyle);
const fixturePath = path.resolve(__dirname, 'fixtures', 'wood');
const outputPath = path.resolve(rootPath, 'output.pdf');

function vivliostyleCLI(args: string[]) {
  return execa(cliPath, args, { cwd: rootPath });
}

it('show version', async () => {
  const { stdout } = await vivliostyleCLI(['--version']);
  expect(stdout).toEqual(packageJSON.version);
});

it('generate pdf without errors', async () => {
  const { stdout } = await vivliostyleCLI([
    fixturePath,
    '-b',
    '-s',
    'A4',
    '-o',
    outputPath,
  ]);
  expect(stdout).toContain('Printing to PDF');

  const buffer = readChunk.sync(outputPath, 0, fileType.minimumBytes);
  const type = fileType(buffer)!;
  expect(type.mime).toEqual('application/pdf');
}, 10000);
