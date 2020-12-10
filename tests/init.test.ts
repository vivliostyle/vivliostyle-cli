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
    '-T',
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
  expect(config).toContain("theme: 'style.css'");
});

it('test the init command with help option', async () => {
  // long option
  const response = await vivliostyleCLI(['init', '--help']);
  expect(response.stdout).toContain('Usage: vivliostyle init [options]');
  expect(response.stdout).toContain('create vivliostyle config file');
  expect(response.stdout).toMatch(/--title <title>\s+title/);
  expect(response.stdout).toMatch(/--author <author>\s+author/);
  expect(response.stdout).toMatch(
    /-l, --language <language>\s+language \(en, ja, etc\.\), default to undefined/,
  );
  expect(response.stdout).toMatch(
    /-T, --theme <theme>\s+theme path or package name/,
  );
  expect(response.stdout).toMatch(/-h, --help\s+display help for command/);

  // short option
  const response_short = await vivliostyleCLI(['init', '-h']);
  expect(response_short.stdout).toContain('Usage: vivliostyle init [options]');
  expect(response_short.stdout).toContain('create vivliostyle config file');
  expect(response_short.stdout).toMatch(/--title <title>\s+title/);
  expect(response_short.stdout).toMatch(/--author <author>\s+author/);
  expect(response_short.stdout).toMatch(
    /-l, --language <language>\s+language \(en, ja, etc\.\), default to undefined/,
  );
  expect(response_short.stdout).toMatch(
    /-T, --theme <theme>\s+theme path or package name/,
  );
  expect(response_short.stdout).toMatch(
    /-h, --help\s+display help for command/,
  );
});
