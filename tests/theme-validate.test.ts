import './mocks/fs.js';
import { vol } from 'memfs';
import upath from 'upath';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger } from '../src/logger.js';
import { DetailError } from '../src/util.js';
import { runCommand } from './command-util.js';

const validPackageJson = {
  name: 'vivliostyle-theme-test',
  version: '1.0.0',
  author: 'Theme Author',
  keywords: ['vivliostyle', 'vivliostyle-theme'],
  main: 'theme.css',
  vivliostyle: {
    theme: {
      name: 'Test',
      author: 'Theme Author',
      style: 'theme.css',
      category: 'novel',
      topics: [],
    },
  },
};

const setupTheme = (
  packageJson: unknown,
  files: Record<string, string> = {},
) => {
  vol.fromJSON({
    '/work/theme/package.json':
      typeof packageJson === 'string'
        ? packageJson
        : JSON.stringify(packageJson, null, 2),
    '/work/theme/theme.css': '',
    ...files,
  });
};

const validate = (...args: string[]) =>
  runCommand(['theme validate', ...args], { cwd: '/work' });

beforeEach(() => {
  vol.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('theme validate command', () => {
  it('accepts a valid theme package', async () => {
    setupTheme(validPackageJson);
    const success = vi.spyOn(Logger, 'logSuccess');

    await expect(validate('theme')).resolves.toEqual([]);
    expect(success).toHaveBeenCalledWith(
      'The theme package is valid: vivliostyle-theme-test',
    );
  });

  it('validates the current directory by default', async () => {
    setupTheme(validPackageJson);

    await expect(
      runCommand(['theme validate'], { cwd: '/work/theme' }),
    ).resolves.toEqual([]);
  });

  it('reports a missing style locator', async () => {
    const { main: _main, ...packageJson } = validPackageJson;
    setupTheme({
      ...packageJson,
      vivliostyle: {
        theme: { ...packageJson.vivliostyle.theme, style: undefined },
      },
    });

    await expect(validate('theme')).resolves.toEqual([
      {
        type: 'error',
        message: expect.stringContaining('Missing style locator'),
      },
    ]);
  });

  it('prefers vivliostyle.theme.style over main', async () => {
    setupTheme({
      ...validPackageJson,
      vivliostyle: {
        theme: { ...validPackageJson.vivliostyle.theme, style: 'missing.css' },
      },
    });

    await expect(validate('theme')).resolves.toEqual([
      { type: 'error', message: 'Style file is not found: missing.css' },
    ]);
  });

  it('falls back to the main field', async () => {
    const { vivliostyle: _vivliostyle, ...packageJson } = validPackageJson;
    setupTheme(packageJson);

    await expect(validate('theme')).resolves.toEqual([]);
  });

  it('rejects a style file outside the package', async () => {
    setupTheme(
      {
        ...validPackageJson,
        vivliostyle: {
          theme: {
            ...validPackageJson.vivliostyle.theme,
            style: '../outside.css',
          },
        },
      },
      { '/work/outside.css': '' },
    );

    await expect(validate('theme')).resolves.toEqual([
      {
        type: 'error',
        message:
          'Style file must be located inside the theme package directory: ../outside.css',
      },
    ]);
  });

  it('warns about a non-CSS style file', async () => {
    setupTheme(
      {
        ...validPackageJson,
        vivliostyle: {
          theme: { ...validPackageJson.vivliostyle.theme, style: 'theme.scss' },
        },
      },
      { '/work/theme/theme.scss': '' },
    );

    await expect(validate('theme')).resolves.toEqual([
      {
        type: 'warning',
        message: 'Style file does not have a ".css" extension: theme.scss',
      },
    ]);
  });

  it('warns about a missing author', async () => {
    const { author: _author, ...packageJson } = validPackageJson;
    setupTheme({
      ...packageJson,
      vivliostyle: {
        theme: { ...packageJson.vivliostyle.theme, author: undefined },
      },
    });

    await expect(validate('theme')).resolves.toEqual([
      { type: 'warning', message: expect.stringContaining('Missing author') },
    ]);
  });

  it('accepts an author object', async () => {
    setupTheme({
      ...validPackageJson,
      author: { name: 'Theme Author', email: 'author@example.com' },
      vivliostyle: {
        theme: { ...validPackageJson.vivliostyle.theme, author: undefined },
      },
    });

    await expect(validate('theme')).resolves.toEqual([]);
  });

  it('warns about a missing vivliostyle-theme keyword', async () => {
    setupTheme({ ...validPackageJson, keywords: ['vivliostyle'] });

    await expect(validate('theme')).resolves.toEqual([
      {
        type: 'warning',
        message: expect.stringContaining('"vivliostyle-theme"'),
      },
    ]);
  });

  it('warns about an unknown category', async () => {
    setupTheme({
      ...validPackageJson,
      vivliostyle: {
        theme: { ...validPackageJson.vivliostyle.theme, category: 'poetry' },
      },
    });

    await expect(validate('theme')).resolves.toEqual([
      {
        type: 'warning',
        message: expect.stringContaining('Unknown theme category "poetry"'),
      },
    ]);
  });

  it('reports schema violations with a code frame', async () => {
    setupTheme({
      ...validPackageJson,
      vivliostyle: {
        theme: { ...validPackageJson.vivliostyle.theme, topics: 'novel' },
      },
    });
    const error = vi.spyOn(Logger, 'logError');

    const results = await validate('theme');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      type: 'error',
      message: expect.stringContaining('Invalid package.json'),
    });
    expect(results[0]?.message).toContain('"topics": "novel"');
    expect(error).toHaveBeenCalledOnce();
  });

  it('fails when package.json does not exist', async () => {
    await expect(validate('theme')).rejects.toThrow(
      `Failed to read package.json: ${upath.resolve('/work/theme/package.json')}`,
    );
  });

  it('fails when package.json is not valid JSON', async () => {
    setupTheme('{ "name": ');

    await expect(validate('theme')).rejects.toThrow(DetailError);
    await expect(validate('theme')).rejects.toThrow(
      `Failed to parse package.json: ${upath.resolve('/work/theme/package.json')}`,
    );
  });
});
