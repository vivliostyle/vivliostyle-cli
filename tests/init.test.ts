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

function vivliostyleCLI(args: string[]) {
  // Note that unlike other tests, it is not 'cwd: fixtureRoot'.
  return execa(cliPath, args, { cwd: localTmpDir });
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
  const response = await vivliostyleCLI(['init', localTmpDir]);
  expect(unChalk(response.stdout)).toBe(
    'Successfully created vivliostyle.config.js',
  );

  const response2 = await vivliostyleCLI(['init', localTmpDir]);
  expect(unChalk(response2.stdout)).toBe(
    'vivliostyle.config.js already exists. aborting.',
  );
});

it('test the init command with long option', async () => {
  cleanUp(path.join(localTmpDir, 'vivliostyle.config.js'));
  const response = await vivliostyleCLI([
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
    localTmpDir,
  ]);
  expect(unChalk(response.stdout)).toBe(
    'Successfully created vivliostyle.config.js',
  );

  const config = fs.readFileSync(
    path.join(localTmpDir, 'vivliostyle.config.js'),
    'utf-8',
  );
  expect(config).toContain("title: 'Sample Document'");
  expect(config).toContain("author: 'Author Name <author@example.com>'");
  expect(config).toContain("language: 'en'");
  expect(config).toContain("size: 'A5'");
  expect(config).toContain("theme: 'style.css'");
});

it('test the init command with short option', async () => {
  cleanUp(path.join(localTmpDir, 'vivliostyle.config.js'));
  const response = await vivliostyleCLI([
    'init',
    '--title',
    'Sample Document',
    '--author',
    'Author Name <author@example.com>',
    '-l',
    'en',
    '-s',
    'A5',
    '-t',
    'style.css',
    localTmpDir,
  ]);
  expect(unChalk(response.stdout)).toBe(
    'Successfully created vivliostyle.config.js',
  );

  const config = fs.readFileSync(
    path.join(localTmpDir, 'vivliostyle.config.js'),
    'utf-8',
  );
  expect(config).toContain("title: 'Sample Document'");
  expect(config).toContain("author: 'Author Name <author@example.com>'");
  expect(config).toContain("language: 'en'");
  expect(config).toContain("size: 'A5'");
  expect(config).toContain("theme: 'style.css'");
});
