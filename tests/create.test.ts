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
import { PromptOption } from './../src/config/schema';
import { runCommand } from './command-util';

const mockedEnquirerModule = vi.hoisted(() => {
  const mockedAnswers = vi.fn().mockReturnValue({});
  return {
    answers: mockedAnswers,
    prompt: vi.fn().mockImplementation(
      async (
        questions: (PromptOption & {
          validate?: (
            value: string,
          ) => boolean | string | Promise<boolean | string>;
        })[],
      ) => {
        const answers: [string, unknown][] = [];
        for (const q of [questions].flat()) {
          const value = mockedAnswers()[q.name];
          if (value === undefined) {
            throw new Error(`Unexpected question: ${q.name}`);
          }
          const validateResult = await q.validate?.(value);
          if (typeof validateResult === 'string' || validateResult === false) {
            throw new Error(validateResult || 'Validation failed');
          }
          answers.push([q.name, value]);
        }
        return Object.fromEntries(answers);
      },
    ),
  };
});

vi.mock('enquirer', () => ({ default: mockedEnquirerModule }));

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
  mockedEnquirerModule.answers.mockReturnValue({});
});

describe('create command', () => {
  it('create empty project', async () => {
    mockedEnquirerModule.answers.mockReturnValue({
      projectPath: 'project-name',
      title: 'Booook titleeee',
      author: 'Authoooor',
      theme: THEME_ANSWER_NOT_USE,
    });

    await runCommand(['create'], { cwd: '/work' });
    const files = vol.toJSON();
    delete files['/work/project-name/manuscript.md'];
    expect(files).toMatchSnapshot();
  });

  it('create project with a default template', async () => {
    mockedEnquirerModule.answers.mockReturnValue({
      projectPath: 'project-name',
      title: 'Booook of the titleeee',
      author: 'Authoooor',
      theme: 'theme-with-template',
      usingTemplate: 'default',
    });

    await runCommand(['create'], { cwd: '/work' });
    const files = vol.toJSON();
    expect(files).toMatchSnapshot();
  });

  it('create project with a custom-prompt template', async () => {
    mockedEnquirerModule.answers.mockReturnValue({
      projectPath: 'project-name',
      title: 'Booook titleeee',
      author: 'Authoooor',
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
    mockedEnquirerModule.answers.mockReturnValue({
      projectPath: 'project-name',
      title: 'Booook titleeee',
      author: 'Authoooor',
      theme: THEME_ANSWER_MANUAL,
      themeManualInput: '@vivliostyle/custom-theme',
      usingTemplate: TEMPLATE_ANSWER_NOT_USE,
    });

    await runCommand(['create'], { cwd: '/work' });
    const files = vol.toJSON();
    expect(files['/work/project-name/vivliostyle.config.js']).toMatch(
      "theme: '@vivliostyle/custom-theme@^9.9.9'",
    );
  });

  it('avoid overwrite', async () => {
    vol.fromJSON({
      '/work/out/touch': '',
    });
    mockedEnquirerModule.answers.mockReturnValue({
      projectPath: 'out',
    });

    await expect(runCommand(['create'], { cwd: '/work' })).rejects.toThrow(
      'Destination /work/out is not empty.',
    );
  });
});
