import './mocks/bluwy__giget-core.js';
import './mocks/fs.js';
import './mocks/tmp.js';
import { downloadTemplate } from '@bluwy/giget-core';
import { vol } from 'memfs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PRESET_TEMPLATE_NOT_USE,
  THEME_ANSWER_BROWSER,
  THEME_ANSWER_MANUAL,
  THEME_ANSWER_NOT_USE,
} from '../src/core/create.js';
import type { CatalogTheme, PackageJson } from '../src/npm.js';
import type * as UtilModule from '../src/util.js';
import { runCommand } from './command-util.js';

const mockedClackModule = vi.hoisted(() => {
  const answers = vi
    .fn<(name: string) => Record<string, unknown>>()
    .mockReturnValue({});
  const promptOptions: Record<string, unknown>[] = [];
  const PromptClass = vi.fn<(args: Record<string, unknown>) => void>(function (
    args: Record<string, unknown>,
  ) {
    promptOptions.push(args);
    const name = String(args.name);
    // @ts-expect-error -- assigning to `this` inside a mock constructor function
    this.prompt = vi
      .fn<() => Promise<unknown>>()
      // oxlint-disable-next-line require-await -- mock must return a Promise to match the prompt signature
      .mockImplementation(async () => {
        const values = answers(name);
        if (!(name in values)) {
          throw new Error(`Unexpected question: ${name}`);
        }
        return values[name];
      });
  });
  return {
    answers,
    promptOptions,
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

const packages: Record<string, PackageJson> = {
  'theme-relative': {
    name: 'theme-relative',
    version: '2.0.0',
    vivliostyle: {
      theme: { name: 'Relative', style: 'theme.css' },
      template: {
        paper: { name: 'Paper', source: './template/paper' },
        escape: { name: 'Escape', source: '../outside' },
      },
    },
  },
  'theme-plain': {
    name: 'theme-plain',
    version: '1.2.3',
    vivliostyle: { theme: { name: 'Plain', style: 'theme.css' } },
  },
  'theme-hidden': {
    name: 'theme-hidden',
    version: '0.1.0',
    vivliostyle: { theme: { name: 'Hidden', style: 'theme.css' } },
  },
};

const catalogTheme = (name: string): CatalogTheme => ({
  name,
  version: packages[name]!.version,
  description: '',
  official: false,
  downloads: { weekly: 1, monthly: 4 },
  templates: [],
});

const mockedNpmModule = vi.hoisted(() => ({
  createFetch: () =>
    (() => {}) as unknown as typeof import('node-fetch-native').fetch,
  listVivliostyleThemes:
    vi.fn<typeof import('../src/npm.js').listVivliostyleThemes>(),
  fetchPackageMetadata:
    vi.fn<typeof import('../src/npm.js').fetchPackageMetadata>(),
  getThemeSiteUrl: () => 'https://theme.example',
  fetchThemeCatalog: vi.fn<typeof import('../src/npm.js').fetchThemeCatalog>(),
  fetchThemeModeration:
    vi.fn<typeof import('../src/npm.js').fetchThemeModeration>(),
  installPackageForTemplate:
    vi.fn<typeof import('../src/npm.js').installPackageForTemplate>(),
}));
vi.mock('../src/npm', () => mockedNpmModule);

const openUrl = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>());
vi.mock('../src/open-url.js', () => ({ openUrl }));

vi.mock('../src/util.js', async (importOriginal) => ({
  ...(await importOriginal<typeof UtilModule>()),
  cliVersion: '999.0.0',
  getOsLocale: () => 'en-US',
}));

/** Plays the part of the theme page: picks a theme and calls back the CLI. */
function chooseInBrowser(selection: Record<string, string>) {
  const callbacks: Promise<Response>[] = [];
  openUrl.mockImplementation(async (url) => {
    const page = new URL(url);
    const callback = new URL(
      `http://127.0.0.1:${page.searchParams.get('port')}/callback`,
    );
    callback.searchParams.set('state', page.searchParams.get('state') ?? '');
    for (const [key, value] of Object.entries(selection)) {
      callback.searchParams.set(key, value);
    }
    callbacks.push(fetch(callback));
    await callbacks.at(-1);
  });
  return callbacks;
}

const baseAnswers = {
  projectPath: 'project',
  title: 'My book',
  author: 'Author',
  language: 'en',
  installDependencies: false,
};

const isTTY = process.stdin.isTTY;

function themeOptionValues(): string[] {
  const question = mockedClackModule.promptOptions.find(
    (options) => options.name === 'theme',
  );
  return ((question?.options ?? []) as { value: string }[]).map((o) => o.value);
}

/** Answers "type a name" first and "no theme" once the user goes back. */
function answerHiddenThemeThenNone() {
  let round = 0;
  mockedClackModule.answers.mockImplementation((name) => {
    round += name === 'theme' ? 1 : 0;
    return {
      ...baseAnswers,
      presetTemplate: 'minimal',
      theme: [THEME_ANSWER_MANUAL, THEME_ANSWER_NOT_USE][round - 1],
      themeManualInput: 'theme-hidden',
      proceed: 'no',
    };
  });
  return () => round;
}

beforeEach(() => {
  vol.reset();
  mockedClackModule.answers.mockReset().mockReturnValue({});
  mockedClackModule.promptOptions.length = 0;
  vi.mocked(downloadTemplate).mockClear();
  openUrl.mockReset();
  mockedNpmModule.fetchPackageMetadata.mockImplementation(({ packageName }) => {
    const pkg = packages[packageName];
    return pkg
      ? Promise.resolve(pkg)
      : Promise.reject(new Error(`404 ${packageName}`));
  });
  mockedNpmModule.fetchThemeCatalog.mockResolvedValue(
    ['theme-relative', 'theme-plain'].map((name) => catalogTheme(name)),
  );
  mockedNpmModule.fetchThemeModeration.mockResolvedValue({
    status: 'visible',
  });
  mockedNpmModule.installPackageForTemplate.mockImplementation(
    ({ packageName, dir }) => {
      const root = `${dir}/node_modules/${packageName}`;
      vol.fromJSON({
        [`${root}/package.json`]: JSON.stringify(packages[packageName]),
        [`${root}/template/paper/manuscript.md`]: '# {{title}}',
        [`${root}/template/paper/vivliostyle.config.js`]:
          'export default { title: {{json title}}, theme: {{json theme}} };',
      });
      return Promise.resolve(root);
    },
  );
  process.stdin.isTTY = true;
});

afterEach(() => {
  process.stdin.isTTY = isTTY;
});

describe('choosing a theme on the theme site', () => {
  it('creates a project from the theme and template chosen in the browser', async () => {
    const callbacks = chooseInBrowser({
      theme: 'theme-relative',
      version: '2.0.0',
      template: 'paper',
    });
    mockedClackModule.answers.mockReturnValue({
      ...baseAnswers,
      presetTemplate: PRESET_TEMPLATE_NOT_USE,
      theme: THEME_ANSWER_BROWSER,
    });

    await runCommand(['create'], { cwd: '/work' });

    const url = new URL(openUrl.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://theme.example/en/select');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client: 'cli',
      v: '1',
      allowTemplate: '1',
      source: 'community',
    });
    expect(url.searchParams.get('state')).toMatch(/^[\w\-]{22}$/v);
    expect((await callbacks[0])?.status).toBe(200);
    expect(mockedNpmModule.installPackageForTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        packageName: 'theme-relative',
        version: '2.0.0',
      }),
    );
    // The template was chosen in the browser, so it is not asked again.
    expect(
      mockedClackModule.promptOptions.map((options) => options.name),
    ).not.toContain('usingTemplate');
    const files = vol.toJSON();
    expect(files['/work/project/manuscript.md']).toBe('# My book');
    expect(files['/work/project/vivliostyle.config.js']).toBe(
      'export default { title: "My book", theme: "theme-relative@^2.0.0" };',
    );
  });

  it('rejects a callback with another state and keeps waiting', async () => {
    let page: URL | undefined;
    openUrl.mockImplementation(async (url) => {
      page = new URL(url);
      const callback = (state: string) =>
        fetch(
          `http://127.0.0.1:${page!.searchParams.get('port')}/callback?state=${state}&theme=theme-plain&version=1.2.3`,
        );
      expect((await callback('x'.repeat(22))).status).toBe(400);
      expect((await callback(page.searchParams.get('state')!)).status).toBe(
        200,
      );
    });
    mockedClackModule.answers.mockReturnValue({
      ...baseAnswers,
      presetTemplate: 'minimal',
      theme: THEME_ANSWER_BROWSER,
    });

    await runCommand(['create'], { cwd: '/work' });

    // A preset template was chosen first, so the page offers no templates.
    expect(page?.searchParams.has('allowTemplate')).toBe(false);
    expect(vol.toJSON()['/work/project/vivliostyle.config.js']).toMatch(
      'theme: "theme-plain@^1.2.3"',
    );
  });
});

describe('theme list', () => {
  it('lists the themes of the catalog and offers the browser', async () => {
    mockedClackModule.answers.mockReturnValue({
      ...baseAnswers,
      presetTemplate: 'minimal',
      theme: THEME_ANSWER_NOT_USE,
    });

    await runCommand(['create'], { cwd: '/work' });

    expect(themeOptionValues()).toEqual([
      THEME_ANSWER_NOT_USE,
      THEME_ANSWER_BROWSER,
      THEME_ANSWER_MANUAL,
      'theme-relative',
      'theme-plain',
    ]);
    expect(mockedNpmModule.listVivliostyleThemes).not.toHaveBeenCalled();
  });

  it('falls back to the npm search when the catalog is unavailable', async () => {
    mockedNpmModule.fetchThemeCatalog.mockRejectedValue(new Error('offline'));
    mockedNpmModule.listVivliostyleThemes.mockResolvedValue({
      objects: [
        {
          downloads: { monthly: 1, weekly: 1 },
          package: packages['theme-plain']!,
          searchScore: 1,
          updated: '',
        },
      ],
      total: 1,
      time: '',
    });
    mockedClackModule.answers.mockReturnValue({
      ...baseAnswers,
      presetTemplate: 'minimal',
      theme: 'theme-plain',
    });

    await runCommand(['create'], { cwd: '/work' });

    expect(mockedNpmModule.listVivliostyleThemes).toHaveBeenCalled();
    expect(vol.toJSON()['/work/project/vivliostyle.config.js']).toMatch(
      'theme: "theme-plain@^1.2.3"',
    );
  });

  it('does not offer the browser without a terminal', async () => {
    process.stdin.isTTY = false;
    mockedClackModule.answers.mockReturnValue({
      ...baseAnswers,
      presetTemplate: 'minimal',
      theme: THEME_ANSWER_NOT_USE,
    });

    await runCommand(['create'], { cwd: '/work' });

    expect(themeOptionValues()).not.toContain(THEME_ANSWER_BROWSER);
  });

  it('handles an empty theme list', async () => {
    mockedNpmModule.fetchThemeCatalog.mockResolvedValue([]);
    mockedClackModule.answers.mockReturnValue({
      ...baseAnswers,
      presetTemplate: 'minimal',
      theme: THEME_ANSWER_NOT_USE,
    });

    await expect(
      runCommand(['create'], { cwd: '/work' }),
    ).resolves.not.toThrow();
  });

  it('asks before using a hidden theme typed by hand', async () => {
    mockedNpmModule.fetchThemeModeration.mockResolvedValue({
      status: 'hidden',
      reason: 'malware',
    });
    const rounds = answerHiddenThemeThenNone();

    await runCommand(['create'], { cwd: '/work' });

    expect(rounds()).toBe(2);
    expect(vol.toJSON()['/work/project/vivliostyle.config.js']).not.toMatch(
      'theme-hidden',
    );
  });
});

describe('theme templates', () => {
  it('applies the basic template to a theme without templates', async () => {
    mockedClackModule.answers.mockReturnValue({
      ...baseAnswers,
      presetTemplate: PRESET_TEMPLATE_NOT_USE,
      theme: 'theme-plain',
    });

    await runCommand(['create'], { cwd: '/work' });

    expect(vi.mocked(downloadTemplate).mock.calls[0]?.[0]).toBe(
      'gh:vivliostyle/vivliostyle-cli/templates/basic',
    );
  });

  it('rejects a template source outside of the package', async () => {
    mockedClackModule.answers.mockReturnValue({
      ...baseAnswers,
      presetTemplate: PRESET_TEMPLATE_NOT_USE,
      theme: 'theme-relative',
      usingTemplate: 'escape',
    });

    await expect(runCommand(['create'], { cwd: '/work' })).rejects.toThrow(
      'The template source of theme-relative is not a directory inside the package.',
    );
  });
});
