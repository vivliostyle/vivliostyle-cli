import execa from 'execa';
import fs from 'fs';
import * as path from 'path';

const rootPath = path.resolve(__dirname, '..');
const packageJSON = require(path.join(rootPath, 'package.json'));
const cliPath = path.join(rootPath, packageJSON.bin.vivliostyle);

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

function vivliostyleCLI(args: string[], cwd: string) {
  // Note that unlike other tests, it is not 'cwd: fixtureRoot'.
  return execa(cliPath, args, { cwd: cwd });
}

/**
 * Returns a string obtained by removing the colors (escape sequence) added by chalk from the target string.
 * @param str target string
 */
function unChalk(str: string) {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    '',
  );
}

it('test the init command', async () => {
  cleanUp(path.join(localTmpDir, 'vivliostyle.config.js'));
  const response = await vivliostyleCLI(['init', localTmpDir], localTmpDir);
  expect(unChalk(response.stdout)).toBe(
    'Successfully created vivliostyle.config.js',
  );

  const response2 = await vivliostyleCLI(['init', localTmpDir], localTmpDir);
  expect(unChalk(response2.stdout)).toBe(
    'vivliostyle.config.js already exists. aborting.',
  );
});

it('test the init command with long option', async () => {
  const outputDir = path.join(localTmpDir, 'long');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  cleanUp(path.join(outputDir, 'vivliostyle.config.js'));
  const response = await vivliostyleCLI(
    [
      'init',
      '--title',
      'Sample Document',
      '--author',
      'Author Name <author@example.com>',
      '--language',
      'en',
      '--size',
      'A5',
      '--theme',
      'style.css',
    ],
    outputDir,
  );
  expect(unChalk(response.stdout)).toBe(
    'Successfully created vivliostyle.config.js',
  );

  const config = require(path.join(outputDir, 'vivliostyle.config.js'));
  expect(config.title).toBe('Sample Document');
  expect(config.author).toBe('Author Name <author@example.com>');
  expect(config.language).toBe('en');
  expect(config.size).toBe('A5');
  expect(config.theme).toBe('style.css');
});

it('test the init command with short option', async () => {
  const outputDir = path.join(localTmpDir, 'short');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  cleanUp(path.join(outputDir, 'vivliostyle.config.js'));
  const response = await vivliostyleCLI(
    [
      'init',
      '--title',
      'Sample Document2',
      '--author',
      'Author Name2 <author@example.com>',
      '-l',
      'jp',
      '-s',
      'A3',
      '-t',
      'theme.css',
    ],
    outputDir,
  );
  expect(unChalk(response.stdout)).toBe(
    'Successfully created vivliostyle.config.js',
  );

  const config = require(path.join(outputDir, 'vivliostyle.config.js'));
  expect(config.title).toBe('Sample Document2');
  expect(config.author).toBe('Author Name2 <author@example.com>');
  expect(config.language).toBe('jp');
  expect(config.size).toBe('A3');
  expect(config.theme).toBe('theme.css');
});
