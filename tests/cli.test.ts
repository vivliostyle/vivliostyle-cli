import execa from 'execa';
import fileType from 'file-type';
import fs from 'fs';
import {
  PDFCatalog,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
} from 'pdf-lib';
import path from 'upath';

const rootPath = path.resolve(__dirname, '..');
const packageJSON = require(path.join(rootPath, 'package.json'));
const cliPath = path.join(rootPath, packageJSON.bin.vivliostyle);
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

function vivliostyleCLI(args: string[]) {
  return execa(cliPath, args, { cwd: fixtureRoot, env: { DEBUG: 'vs-cli' } });
}

it('show version', async () => {
  const { stdout } = await vivliostyleCLI(['--version']);
  expect(stdout).toContain(packageJSON.version);
});

it.only('generate pdf without errors', async () => {
  const outputPath = path.join(localTmpDir, 'test.pdf');
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
  } catch (err) {
    throw err.stderr;
  }

  // mimetype test
  const type = await fileType.fromFile(outputPath);
  expect(type!.mime).toEqual('application/pdf');
}, 20000);

it('generate press-ready pdf without errors', async () => {
  const outputPath = path.join(localTmpDir, 'test-press-ready.pdf');
  cleanUp(outputPath);

  try {
    const response = await vivliostyleCLI([
      'build',
      '-s',
      'A4',
      '-o',
      outputPath,
      '--press-ready',
      fixtureFile,
    ]);
  } catch (err) {
    throw err.stderr;
  }

  // mimetype test
  const type = await fileType.fromFile(outputPath);
  expect(type!.mime).toEqual('application/pdf');
}, 20000);

it('generates a PDF with metadata', async () => {
  const outputPath = path.join(localTmpDir, 'test-metadata.pdf');

  try {
    const response = await vivliostyleCLI([
      'build',
      '-s',
      'Letter',
      '--title',
      'Wood Engraving',
      '-o',
      outputPath,
      fixtureFile,
    ]);
    expect(response.stdout).toContain('has been created');
  } catch (err) {
    throw err.stderr;
  }

  const bytes = fs.readFileSync(outputPath);
  const document = await PDFDocument.load(bytes);

  expect(document.getTitle()).toBe('Wood Engraving');

  const catalog = document.context.lookup(
    document.context.trailerInfo.Root,
    PDFCatalog,
  );

  // Outlines
  const outlines = catalog.lookup(PDFName.of('Outlines'), PDFDict);

  const count = outlines.lookup(PDFName.of('Count'), PDFNumber);
  expect(count.value()).toBe(1);

  const intro = outlines.lookup(PDFName.of('First'), PDFDict);
  const introTitle = intro.lookup(PDFName.of('Title'), PDFHexString);
  expect(introTitle.sizeInBytes()).toBe(62);
}, 20000);
