import './mocks/bluwy__giget-core.js';
import './mocks/fs.js';
import './mocks/tmp.js';
import { vol } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runCommand } from './command-util.js';

const USE_DEFAULT_ANSWER = '<use default>';

const mockedClackModule = vi.hoisted(() => {
  const mockedAnswers = vi
    .fn<() => Record<string, unknown>>()
    .mockReturnValue({});
  const PromptClass = vi.fn<
    (args: {
      name: string;
      defaultValue?: string;
      validate?: (value: unknown) => string | undefined;
    }) => void
  >(function ({ name, defaultValue }: { name: string; defaultValue?: string }) {
    // @ts-expect-error -- assigning to `this` inside a mock constructor function
    this.prompt = vi
      .fn<() => Promise<unknown>>()
      // oxlint-disable-next-line require-await -- mock must return a Promise to match the prompt signature
      .mockImplementation(async () => {
        const answers = mockedAnswers();
        if (!(name in answers)) {
          throw new Error(`Unexpected question: ${name}`);
        }
        return answers[name] === '<use default>' ? defaultValue : answers[name];
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

const mockedExec = vi.hoisted(() => {
  interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
  }
  const makeOutput = (result: Promise<ExecResult>) =>
    Object.assign(result, {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.resolve({ done: true as const, value: undefined }),
      }),
    });
  const x =
    vi.fn<
      (
        command: string,
        args: string[],
        options?: { nodeOptions?: { cwd?: string } },
      ) => ReturnType<typeof makeOutput>
    >();
  return { x, makeOutput };
});

vi.mock('tinyexec', () => ({ x: mockedExec.x }));

const readPackageJson = (path: string) =>
  JSON.parse(vol.readFileSync(path, 'utf8') as string) as {
    name: string;
    description: string;
    author: string;
    license: string;
    vivliostyle: { theme: { name: string; category: string } };
  };

const promptOptionsFor = (name: string) =>
  mockedClackModule.TextPrompt.mock.calls.find(
    ([options]) => options.name === name,
  )?.[0];

beforeEach(() => {
  vol.reset();
  mockedClackModule.answers.mockReturnValue({});
  mockedExec.x.mockImplementation(() =>
    mockedExec.makeOutput(
      Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
    ),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('theme create command', () => {
  it('creates a theme package interactively', async () => {
    mockedClackModule.answers.mockReturnValue({
      projectPath: 'my-theme',
      name: USE_DEFAULT_ANSWER,
      description: 'A theme for testing',
      author: 'Theme Author',
      category: 'novel',
      installDependencies: false,
    });

    await runCommand(['theme create'], { cwd: '/work' });
    expect(vol.toJSON()).toMatchSnapshot();
    expect(mockedExec.x).not.toHaveBeenCalled();
  });

  it('creates a theme package without prompts', async () => {
    await runCommand(
      [
        'theme create',
        '--name',
        '@acme/vivliostyle-theme-fancy-book',
        '--description',
        'Fancy theme',
        '--author',
        'Acme <acme@example.com>',
        '--category',
        'report',
        '--license',
        'Apache-2.0',
        '--no-install-dependencies',
        'my-theme',
      ],
      { cwd: '/work' },
    );

    const pkg = readPackageJson('/work/my-theme/package.json');
    expect(pkg).toMatchObject({
      name: '@acme/vivliostyle-theme-fancy-book',
      description: 'Fancy theme',
      author: 'Acme <acme@example.com>',
      license: 'Apache-2.0',
      vivliostyle: {
        theme: {
          name: 'Fancy Book',
          author: 'Acme <acme@example.com>',
          category: 'report',
        },
      },
    });
    expect(vol.readFileSync('/work/my-theme/README.md', 'utf8')).toMatch(
      /^# Fancy Book\r?\n/v,
    );
    expect(mockedExec.x).not.toHaveBeenCalled();
  });

  it('escapes quotes and backslashes in template values', async () => {
    await runCommand(
      [
        'theme create',
        '--name',
        'vivliostyle-theme-quoted',
        '--description',
        'A "quoted" \\ theme',
        '--author',
        'Acme "Inc." <acme@example.com>',
        '--category',
        'novel',
        '--license',
        'Custom "License"',
        '--no-install-dependencies',
        'my-theme',
      ],
      { cwd: '/work' },
    );

    const pkg = readPackageJson('/work/my-theme/package.json');
    expect(pkg).toMatchObject({
      description: 'A "quoted" \\ theme',
      author: 'Acme "Inc." <acme@example.com>',
      license: 'Custom "License"',
      vivliostyle: {
        theme: { author: 'Acme "Inc." <acme@example.com>' },
      },
    });
    expect(
      vol.readFileSync('/work/my-theme/vivliostyle.config.js', 'utf8'),
    ).toMatch('author: "Acme \\"Inc.\\" <acme@example.com>",');
  });

  it.each([
    [
      'my cool theme',
      '/work',
      'vivliostyle-theme-my-cool-theme',
      'My Cool Theme',
    ],
    ['vivliostyle-theme-foo', '/work', 'vivliostyle-theme-foo', 'Foo'],
    ['.', '/work/Cool', 'vivliostyle-theme-cool', 'Cool'],
  ])(
    'suggests a package name for the project path %s',
    async (projectPath, cwd, expectedName, expectedThemeName) => {
      vol.mkdirSync(cwd, { recursive: true });
      mockedClackModule.answers.mockReturnValue({
        name: USE_DEFAULT_ANSWER,
        description: '',
        author: 'Author',
        category: 'misc',
        installDependencies: false,
      });

      await runCommand(['theme create', projectPath], { cwd });

      expect(promptOptionsFor('name')?.defaultValue).toBe(expectedName);
      const pkg = readPackageJson(`${cwd}/${projectPath}/package.json`);
      expect(pkg.name).toBe(expectedName);
      expect(pkg.description).toBe('');
      expect(pkg.vivliostyle.theme.name).toBe(expectedThemeName);
    },
  );

  it('validates the package name while prompting', async () => {
    mockedClackModule.answers.mockReturnValue({
      name: USE_DEFAULT_ANSWER,
      description: '',
      author: 'Author',
      category: 'misc',
      installDependencies: false,
    });

    await runCommand(['theme create', 'my-theme'], { cwd: '/work' });

    const validate = promptOptionsFor('name')?.validate;
    expect(validate?.('Bad_Name')).toBe(
      'Invalid npm package name: name can no longer contain capital letters',
    );
    expect(validate?.('vivliostyle-theme-ok')).toBeUndefined();
    // An empty input falls back to the suggested default name
    expect(validate?.('')).toBeUndefined();
  });

  it.each([
    ['Bad_Name', 'name can no longer contain capital letters'],
    ['_private', 'name cannot start with an underscore'],
    ['node_modules', 'node_modules is not a valid package name'],
    ['http', 'http is a core module name'],
    [
      '@scope/foo bar',
      'name can only contain lowercase letters, digits, hyphens, underscores, and periods, optionally prefixed with a scope such as @scope/',
    ],
  ])('rejects the invalid npm package name %s', async (name, reason) => {
    await expect(
      runCommand(['theme create', '--name', name, 'my-theme'], {
        cwd: '/work',
      }),
    ).rejects.toThrow(`Invalid npm package name: ${reason}`);
  });

  it('avoids overwriting a non-empty destination', async () => {
    vol.fromJSON({ '/work/my-theme/existing.txt': '' });

    await expect(
      runCommand(
        ['theme create', '--name', 'vivliostyle-theme-x', 'my-theme'],
        {
          cwd: '/work',
        },
      ),
    ).rejects.toThrow('Destination /work/my-theme is not empty.');
  });

  it('copies a local template', async () => {
    vol.fromJSON({
      '/work/local-template/package.json': '{ "name": "{{name}}" }',
      '/work/local-template/style.css': '/* {{themeName}} */',
    });

    await runCommand(
      [
        'theme create',
        '--name',
        'vivliostyle-theme-local',
        '--author',
        'A',
        '--category',
        'misc',
        '--description',
        '',
        '--template',
        './local-template',
        '--no-install-dependencies',
        'my-theme',
      ],
      { cwd: '/work' },
    );

    expect(vol.toJSON('/work/my-theme')).toEqual({
      '/work/my-theme/package.json': '{ "name": "vivliostyle-theme-local" }',
      '/work/my-theme/style.css': '/* Local */',
    });
  });

  it('installs dependencies', async () => {
    await runCommand(
      [
        'theme create',
        '--name',
        'vivliostyle-theme-x',
        '--author',
        'A',
        '--category',
        'misc',
        '--description',
        '',
        '--install-dependencies',
        'my-theme',
      ],
      { cwd: '/work' },
    );

    expect(mockedExec.x).toHaveBeenCalledOnce();
    expect(mockedExec.x.mock.calls[0]?.[1]).toEqual(['install']);
    expect(mockedExec.x.mock.calls[0]?.[2]?.nodeOptions?.cwd).toBe(
      '/work/my-theme',
    );
  });
});
