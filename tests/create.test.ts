import './mocks/bluwy__giget-core.js';
import './mocks/fs.js';
import './mocks/tmp.js';
import { downloadTemplate } from '@bluwy/giget-core';
import { vol } from 'memfs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PRESET_TEMPLATE_NOT_USE,
  THEME_ANSWER_MANUAL,
  THEME_ANSWER_NOT_USE,
} from '../src/core/create.js';
import type { PackageJson, PackageSearchResult } from '../src/npm.js';
import type * as UtilModule from '../src/util.js';
import { runCommand } from './command-util.js';

const mockedClackModule = vi.hoisted(() => {
  const mockedAnswers = vi
    .fn<() => Record<string, unknown>>()
    .mockReturnValue({});
  const PromptClass = vi.fn<(args: { name: string }) => void>(function ({
    name,
  }: {
    name: string;
  }) {
    // @ts-expect-error -- assigning to `this` inside a mock constructor function
    this.prompt = vi
      .fn<() => Promise<unknown>>()
      // oxlint-disable-next-line require-await -- mock must return a Promise to match the prompt signature
      .mockImplementation(async () => {
        const answers = mockedAnswers();
        if (!(name in answers)) {
          throw new Error(`Unexpected question: ${name}`);
        }
        return answers[name];
      });
  });

  return {
    answers: mockedAnswers,
    TextPrompt: PromptClass,
    SelectPrompt: PromptClass,
    MultiSelectPrompt: PromptClass,
    AutocompletePrompt: PromptClass,
    AutocompleteMultiselectPrompt: PromptClass,
    isCancel: vi.fn<() => boolean>().mockReturnValue(false),
    getColumns: vi.fn<() => number>().mockReturnValue(80),
  };
});

vi.mock('@clack/core', () => mockedClackModule);

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
  } satisfies typeof import('../src/npm.js');
});

vi.mock('../src/npm', () => mockedNpmModule);

vi.mock('../src/util.js', async (importOriginal) => ({
  ...(await importOriginal<typeof UtilModule>()),
  cliVersion: '999.0.0',
}));

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
      presetTemplate: 'minimal',
      theme: THEME_ANSWER_NOT_USE,
      installDependencies: false,
    });

    await runCommand(['create'], { cwd: '/work' });
    const files = vol.toJSON();
    delete files['/work/project-name/manuscript.md'];
    expect(files).toMatchSnapshot();
  });

  it('create project with basic-ja template', async () => {
    mockedClackModule.answers.mockReturnValue({
      projectPath: 'project-name',
      title: 'Booook titleeee',
      author: 'Authoooor',
      language: 'ja',
      presetTemplate: 'basic-ja',
      theme: THEME_ANSWER_NOT_USE,
      installDependencies: false,
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
      presetTemplate: PRESET_TEMPLATE_NOT_USE,
      theme: 'theme-with-template',
      usingTemplate: 'default',
      installDependencies: false,
    });

    await runCommand(['create'], { cwd: '/work' });
    const files = vol.toJSON();
    expect(
      Object.keys(files).some((f) => f.endsWith('vivliostyle-template.json')),
    ).toBe(false);
    expect(files).toMatchSnapshot();
  });

  it('create project with a custom-prompt template', async () => {
    mockedClackModule.answers.mockReturnValue({
      projectPath: 'project-name',
      title: 'Booook titleeee',
      author: 'Authoooor',
      language: 'en',
      presetTemplate: PRESET_TEMPLATE_NOT_USE,
      theme: 'theme-with-template',
      usingTemplate: 'custom-prompt',
      stringPromptA: 'custom string',
      selectPromptA: 'option1',
      installDependencies: false,
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
      presetTemplate: 'minimal',
      theme: THEME_ANSWER_MANUAL,
      themeManualInput: '@vivliostyle/custom-theme',
      installDependencies: false,
    });

    await runCommand(['create'], { cwd: '/work' });
    const files = vol.toJSON();
    expect(files['/work/project-name/vivliostyle.config.js']).toMatch(
      'theme: "@vivliostyle/custom-theme@^9.9.9"',
    );
  });

  it('crate project from a local template', async () => {
    mockedClackModule.answers.mockReturnValue({
      projectPath: 'project-name',
      title: 'Booook titleeee',
      author: 'Authoooor',
      language: 'en',
      presetTemplate: 'minimal',
      theme: THEME_ANSWER_NOT_USE,
      installDependencies: false,
    });
    vol.fromJSON({
      '/work/local-template/file.md': '# {{proper title}}',
    });

    await runCommand(['create', '--template', 'local-template'], {
      cwd: '/work',
    });
    const files = vol.toJSON();
    expect(files['/work/project-name/file.md']).toMatch('# Booook Titleeee');
  });

  describe('template manifest', () => {
    const createFromLocalTemplate = () =>
      runCommand(
        [
          'create',
          '--title',
          'book',
          '--author',
          'john',
          '--language',
          'en',
          '--template',
          'local-template',
          '--no-theme',
          '--no-install-dependencies',
          'project',
        ],
        { cwd: '/work' },
      );
    const manifest = (range: string) =>
      JSON.stringify({ engines: { '@vivliostyle/cli': range } });

    it('creates a project from a template with a compatible manifest', async () => {
      vol.fromJSON({
        '/work/local-template/file.md': '# {{proper title}}',
        '/work/local-template/vivliostyle-template.json': manifest('>=11.3.0'),
      });

      await createFromLocalTemplate();
      const files = vol.toJSON();
      expect(files['/work/project/file.md']).toBe('# Book');
      expect(files['/work/project/vivliostyle-template.json']).toBeUndefined();
    });

    it('rejects a local template that requires a newer CLI', async () => {
      vol.fromJSON({
        '/work/local-template/file.md': '# {{proper title}}',
        '/work/local-template/vivliostyle-template.json':
          manifest('>=9999.0.0'),
      });

      await expect(createFromLocalTemplate()).rejects.toThrow(
        'The template requires @vivliostyle/cli ">=9999.0.0", but the current version is 999.0.0.',
      );
      expect(vol.toJSON()['/work/project/file.md']).toBeUndefined();
    });

    it('rejects a malformed template manifest', async () => {
      vol.fromJSON({
        '/work/local-template/file.md': '# {{proper title}}',
        '/work/local-template/vivliostyle-template.json': '{ engines: ',
      });

      await expect(createFromLocalTemplate()).rejects.toThrow(
        'Failed to parse the template manifest',
      );
    });

    it('rejects a remote template that requires a newer CLI', async () => {
      await expect(
        runCommand(
          [
            'create',
            '--title',
            'book',
            '--author',
            'john',
            '--language',
            'en',
            '--template',
            'gh:template-requires-newer-cli',
            '--no-theme',
            '--no-install-dependencies',
            'project',
          ],
          { cwd: '/work' },
        ),
      ).rejects.toThrow(
        'The template requires @vivliostyle/cli ">=9999.0.0", but the current version is 999.0.0.',
      );
      const files = vol.toJSON();
      expect(files['/work/project/manuscript.md']).toBeUndefined();
      expect(
        Object.keys(files).filter((f) => f.includes('.vs-template-')),
      ).toEqual([]);
      expect(vol.existsSync('/work/project')).toBe(false);
    });

    it('falls back to the release tag when a built-in template requires a newer CLI', async () => {
      vi.mocked(downloadTemplate, { partial: true }).mockImplementationOnce(
        (_, { dir = '' } = {}) => {
          vol.fromJSON({
            [`${dir}/manuscript.md`]: '# {{proper title}}',
            [`${dir}/vivliostyle-template.json`]: manifest('>=9999.0.0'),
          });
          return Promise.resolve({});
        },
      );

      await runCommand(
        [
          'create',
          '--title',
          'book',
          '--author',
          'john',
          '--language',
          'en',
          '--template',
          'basic',
          '--no-theme',
          '--no-install-dependencies',
          'project',
        ],
        { cwd: '/work' },
      );
      expect(
        vi.mocked(downloadTemplate).mock.calls.map(([input]) => input),
      ).toEqual([
        'gh:vivliostyle/vivliostyle-cli/templates/basic',
        'gh:vivliostyle/vivliostyle-cli/templates/basic#v999.0.0',
      ]);
      const files = vol.toJSON();
      expect(files['/work/project/manuscript.md']).toBeUndefined();
      expect(files['/work/project/vivliostyle.config.js']).toBeDefined();
      expect(files['/work/project/vivliostyle-template.json']).toBeUndefined();
      expect(
        Object.keys(files).filter((f) => f.includes('.vs-template-')),
      ).toEqual([]);
    });
  });

  it('create project without any additional prompts', async () => {
    mockedClackModule.answers.mockReturnValue({});

    await runCommand(
      [
        'create',
        '--title',
        'book',
        '--author',
        'john',
        '--language',
        'ja',
        '--template',
        'minimal',
        '--no-theme',
        '--no-install-dependencies',
        'project',
      ],
      { cwd: '/work' },
    );
    const files = vol.toJSON();
    expect(files['/work/project/vivliostyle.config.js']).toMatchSnapshot();
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

  it('escapes quotes and backslashes in the config file', async () => {
    await runCommand(
      [
        'init',
        '--title',
        'my "quoted" \\ book',
        '--author',
        'Author "Name" <author@example.com>',
      ],
      { cwd: '/work' },
    );
    const files = vol.toJSON();
    const config = files['/work/vivliostyle.config.js'];
    expect(config).toMatch('title: "My \\"Quoted\\" \\\\ Book",');
    expect(config).toMatch('author: "Author \\"Name\\" <author@example.com>",');
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
