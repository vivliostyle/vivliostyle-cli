import './mocks/bluwy__giget-core.js';
import './mocks/fs.js';
import './mocks/tmp.js';

import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEMPLATE_ANSWER_NOT_USE,
  THEME_ANSWER_MANUAL,
  THEME_ANSWER_NOT_USE,
} from '../src/core/create.js';
import type { PackageJson, PackageSearchResult } from '../src/npm';
import { runCommand } from './command-util';

const mockedClackModule = vi.hoisted(() => {
  const mockedAnswers = vi.fn().mockReturnValue({});
  const prompt = vi
    .fn()
    .mockImplementation(async ({ name }: { name: string }) => {
      const answers = mockedAnswers();
      if (!(name in answers)) {
        throw new Error(`Unexpected question: ${name}`);
      }
      return answers[name];
    });

  return {
    answers: mockedAnswers,
    text: prompt,
    select: prompt,
    multiSelect: prompt,
    autocomplete: prompt,
    autocompleteMultiselect: prompt,
    isCancel: vi.fn().mockReturnValue(false),
    log: {
      warn: vi.fn().mockImplementation((message: string) => {
        throw new Error(`Unexpected call to log.warn: ${message}`);
      }),
    },
  };
});

vi.mock('@clack/prompts', () => mockedClackModule);

const mockedNpmModule = vi.hoisted(async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const testPackage = JSON.parse(
    fs.readFileSync(
      path.resolve(
        fileURLToPath(import.meta.url),
        '../fixtures/themes/theme-with-template/package.json',
      ),
      'utf-8',
    ),
  ) as PackageJson;
  return {
    createFetch: () =>
      (() => {}) as unknown as typeof import('node-fetch-native').fetch,
    listVivliostyleThemes: () =>
      Promise.resolve({
        objects: [
          {
            downloads: { monthly: 100, weekly: 25 },
            package: testPackage,
            searchScore: 1,
            updated: 'time',
          },
        ],
        total: 1,
        time: 'time',
      } satisfies PackageSearchResult),
    fetchPackageMetadata: ({ packageName }) =>
      Promise.resolve(
        packageName === '@vivliostyle/custom-theme'
          ? {
              name: '@vivliostyle/custom-theme',
              version: '9.9.9',
            }
          : testPackage,
      ),
  } satisfies typeof import('../src/npm');
});

vi.mock('../src/npm', () => mockedNpmModule);

beforeEach(() => {
  vol.reset();
  mockedClackModule.answers.mockReturnValue({});
});

describe('create command', () => {
  it('create empty project', async () => {
    mockedClackModule.answers.mockReturnValue({
      projectPath: 'project-name',
      title: 'Booook titleeee',
      author: 'Authoooor',
      language: 'en',
      theme: THEME_ANSWER_NOT_USE,
    });

    await runCommand(['create'], { cwd: '/work' });
    const files = vol.toJSON();
    delete files['/work/project-name/manuscript.md'];
    expect(files).toMatchSnapshot();
  });

  it('create project with a default template', async () => {
    mockedClackModule.answers.mockReturnValue({
      projectPath: 'project-name',
      title: 'Booook of the titleeee',
      author: 'Authoooor',
      language: 'en',
      theme: 'theme-with-template',
      usingTemplate: 'default',
    });

    await runCommand(['create'], { cwd: '/work' });
    const files = vol.toJSON();
    expect(files).toMatchSnapshot();
  });

  it('create project with a custom-prompt template', async () => {
    mockedClackModule.answers.mockReturnValue({
      projectPath: 'project-name',
      title: 'Booook titleeee',
      author: 'Authoooor',
      language: 'en',
      theme: 'theme-with-template',
      usingTemplate: 'custom-prompt',
      stringPromptA: 'custom string',
      selectPromptA: 'option1',
    });

    await runCommand(['create'], { cwd: '/work' });
    const files = vol.toJSON();
    expect(files).toMatchSnapshot();
  });

  it('create project with a custom theme', async () => {
    mockedClackModule.answers.mockReturnValue({
      projectPath: 'project-name',
      title: 'Booook titleeee',
      author: 'Authoooor',
      language: 'en',
      theme: THEME_ANSWER_MANUAL,
      themeManualInput: '@vivliostyle/custom-theme',
      usingTemplate: TEMPLATE_ANSWER_NOT_USE,
    });

    await runCommand(['create'], { cwd: '/work' });
    const files = vol.toJSON();
    expect(files['/work/project-name/vivliostyle.config.js']).toMatch(
      'theme: "@vivliostyle/custom-theme@^9.9.9"',
    );
  });

  it('avoid overwrite', async () => {
    vol.fromJSON({
      '/work/out/touch': '',
    });
    mockedClackModule.answers.mockReturnValue({
      projectPath: 'out',
    });

    await expect(runCommand(['create'], { cwd: '/work' })).rejects.toThrow(
      'Destination /work/out is not empty.',
    );
  });
});

describe('init command', () => {
  it('test the init command', async () => {
    await runCommand(['init'], { cwd: '/work' });
    const files = vol.toJSON();
    expect(files['/work/vivliostyle.config.js']).toMatchSnapshot();
  });

  it('test the init command with long options', async () => {
    await runCommand(
      [
        'init',
        '--title',
        'Sample Document',
        '--author',
        'Author Name <author@example.com>',
        '--language',
        'ja',
        '--size',
        'A5',
        '--theme',
        'style.css',
      ],
      { cwd: '/work' },
    );
    const files = vol.toJSON();
    expect(files['/work/vivliostyle.config.js']).toMatchSnapshot();
  });

  it('test the init command with short options', async () => {
    await runCommand(
      [
        'init',
        '--title',
        'Sample Document2',
        '--author',
        'Author Name2 <author@example.com>',
        '-l',
        'pt-BR',
        '-s',
        'A3',
        '-T',
        'theme.css',
      ],
      { cwd: '/work' },
    );
    const files = vol.toJSON();
    expect(files['/work/vivliostyle.config.js']).toMatchSnapshot();
  });
});
