import fs from 'fs';
import path from 'path';
import execa from 'execa';
import fileType from 'file-type';
import {
  PDFCatalog,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFHexString,
} from 'pdf-lib';

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
  expect(stdout).toContain(packageJSON.version);
});

it('generate pdf without errors', async () => {
  const outputPath = path.join(localTmpDir, 'test.pdf');
  cleanUp(outputPath);

  try {
    const response = await vivliostyleCLI([
      'build',
      fixtureProjectPath,
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
  const type = await fileType.fromFile(outputPath);
  expect(type!.mime).toEqual('application/pdf');
}, 20000);

it('generate press-ready pdf without errors', async () => {
  const outputPath = path.join(localTmpDir, 'test-press-ready.pdf');
  cleanUp(outputPath);

  try {
    const response = await vivliostyleCLI([
      'build',
      fixtureProjectPath,
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
  const type = await fileType.fromFile(outputPath);
  expect(type!.mime).toEqual('application/pdf');
}, 20000);

it('generates a PDF with metadata', async () => {
  const outputPath = path.join(localTmpDir, 'test-metadata.pdf');

  try {
    const response = await vivliostyleCLI([
      'build',
      fixtureProjectPath,
      '-s',
      'Letter',
      '-o',
      outputPath,
    ]);
    expect(response.stdout).toContain('Processing PDF');
  } catch (err) {
    throw err.stderr;
  }

  const bytes = fs.readFileSync(outputPath);
  const document = await PDFDocument.load(bytes);

  // Document metadata
  const metadata = document.context.lookup(
    document.context.trailerInfo.Info,
    PDFDict,
  );
  const metaTitle = metadata.lookup(PDFName.of('Title'), PDFHexString);
  expect(metaTitle.sizeInBytes()).toBe(62); // 'Wood Engraving' as hex, with BOM

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
  expect(introTitle.sizeInBytes()).toBe(78);
}, 20000);
