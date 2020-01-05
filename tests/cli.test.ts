import fs from 'fs';
import path from 'path';
import execa from 'execa';
import fileType from 'file-type';
import readChunk from 'read-chunk';
import { pdf2png } from './pdf2png';

const rootPath = path.resolve(__dirname, '..');
const packageJSON = require(path.join(rootPath, 'package.json'));
const cliPath = path.join(rootPath, packageJSON.bin.vivliostyle);
const fixturePath = path.resolve(__dirname, 'fixtures');
const fixtureProjectPath = path.join(fixturePath, 'wood');

const outputPdfPath = path.join(rootPath, 'tmp', 'test.pdf');
const outputScreenshotPath = path.join(rootPath, 'tmp', 'screenshot.png');
fs.mkdirSync(path.dirname(outputPdfPath), { recursive: true });
try {
  fs.unlinkSync(outputPdfPath);
} catch (err) {
  if (err.code !== 'ENOENT') {
    throw err;
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
  try {
    const response = await vivliostyleCLI([
      'build',
      fixtureProjectPath,
      '-b',
      '-s',
      'A4',
      '-o',
      outputPdfPath,
    ]);
    expect(response.stdout).toContain('Printing to PDF');
  } catch (err) {
    throw err.stderr;
  }

  // mimetype test
  const buffer = readChunk.sync(outputPdfPath, 0, fileType.minimumBytes);
  const type = fileType(buffer)!;
  expect(type.mime).toEqual('application/pdf');

  // screenshot test
  const screenshot = await pdf2png(outputPdfPath);
  fs.writeFileSync(outputScreenshotPath, screenshot);
  expect(screenshot).toMatchSnapshot();
}, 20000);
