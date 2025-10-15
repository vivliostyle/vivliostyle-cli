import { downloadTemplate } from '@bluwy/giget-core';
import { log as promptLog } from '@clack/prompts';
import { isUtf8 } from 'node:buffer';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import terminalLink from 'terminal-link';
import upath from 'upath';
import * as v from 'valibot';
import { cyan } from 'yoctocolors';
import {
  ParsedVivliostyleInlineConfig,
  VivliostyleInlineConfigWithoutChecks,
  VivliostylePackageMetadata,
} from '../config/schema.js';
import {
  cliVersion,
  coreVersion,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_PROJECT_AUTHOR,
  DEFAULT_PROJECT_TITLE,
  languages,
  TEMPLATE_DEFAULT_FILES,
  TEMPLATE_SETTINGS,
  VIVLIOSTYLE_THEME_CATEGORY_RECORD,
} from '../const.js';
import { format, TemplateVariable } from '../create-template.js';
import { askQuestion, caveat, lazyPrompt } from '../interactive.js';
import { Logger } from '../logger.js';
import {
  createFetch,
  fetchPackageMetadata,
  listVivliostyleThemes,
  PackageJson,
} from '../npm.js';
import {
  cwd as defaultCwd,
  exec,
  getOsLocale,
  toTitleCase,
  whichPm,
} from '../util.js';

type VivliostylePackageJson = Pick<PackageJson, 'name' | 'version'> & {
  vivliostyle?: VivliostylePackageMetadata;
};

export async function create(inlineConfig: ParsedVivliostyleInlineConfig) {
  Logger.setLogLevel(inlineConfig.logLevel);
  Logger.setCustomLogger(inlineConfig.logger);
  Logger.debug('create > inlineConfig %O', inlineConfig);

  const fetch = createFetch(inlineConfig);
  let {
    projectPath,
    cwd = defaultCwd,
    title,
    author,
    language,
    theme,
    template,
    createConfigFileOnly = false,
  } = inlineConfig;
  let extraTemplateVariables: Record<string, unknown> = {};
  let themePackage: VivliostylePackageJson | undefined;
  let installDependencies: boolean | undefined;
  let gitInit: boolean | undefined;

  if (!projectPath) {
    ({ projectPath } = await askProjectPath());
  }
  const dist = upath.join(cwd, projectPath);
  if (createConfigFileOnly) {
    if (fs.existsSync(upath.join(dist, DEFAULT_CONFIG_FILENAME))) {
      throw new Error(`${DEFAULT_CONFIG_FILENAME} already exists. Aborting.`);
    }
  } else if (
    (projectPath === '.' &&
      fs.readdirSync(dist).filter((n) => !n.startsWith('.')).length > 0) ||
    (projectPath !== '.' && fs.existsSync(dist))
  ) {
    throw new Error(`Destination ${dist} is not empty.`);
  }

  if (!title) {
    ({ title } = createConfigFileOnly
      ? { title: DEFAULT_PROJECT_TITLE }
      : await askTitle({ projectPath }));
  }
  if (!author) {
    ({ author } = createConfigFileOnly
      ? { author: DEFAULT_PROJECT_AUTHOR }
      : await askAuthor());
  }
  if (!language) {
    ({ language } = createConfigFileOnly
      ? { language: await getOsLocale() }
      : await askLanguage());
  }

  if (!createConfigFileOnly) {
    let presetTemplate: (typeof TEMPLATE_SETTINGS)[number] | undefined;
    if (!template) {
      ({ presetTemplate } = await askPresetTemplate());
      if (presetTemplate) {
        template = presetTemplate.template;
      }
    }
    if (!theme) {
      ({ theme, themePackage } = await askTheme({ presetTemplate, fetch }));
    }
    if (!template) {
      ({ template, extraTemplateVariables } = await askThemeTemplate(
        themePackage?.vivliostyle,
      ));
    }
    ({ installDependencies } = await askInstallDependencies());
    ({ gitInit } = await askGitInit());
  }

  const explicitTemplateVariables = {
    ...extraTemplateVariables,
    projectPath,
    title,
    author,
    language,
    theme: (() => {
      if (!theme) {
        return;
      }
      const arr = theme.map((t) => (t.import ? t : t.specifier));
      return arr.length === 1 ? arr[0] : arr;
    })(),
    themePackage,
    template,
    cliVersion,
    coreVersion,
  } satisfies TemplateVariable;
  Logger.debug(
    'create > explicitTemplateVariables %O',
    explicitTemplateVariables,
  );
  if (createConfigFileOnly) {
    setupConfigFile({
      projectPath,
      cwd,
      templateVariables: {
        ...inlineConfig,
        ...explicitTemplateVariables,
      },
    });
  } else {
    await setupTemplate({
      projectPath,
      cwd,
      template: template!,
      templateVariables: {
        ...inlineConfig,
        ...explicitTemplateVariables,
      },
    });
    if (installDependencies) {
      await performInstallDependencies({ projectPath, cwd });
    }
    if (gitInit) {
      await performGitInit({ projectPath, cwd });
    }
  }

  const output = createConfigFileOnly
    ? upath.join(dist, DEFAULT_CONFIG_FILENAME)
    : dist;
  const relativeOutput = upath.relative(cwd, output) || '.';
  const formattedOutput = terminalLink(
    cyan(relativeOutput),
    pathToFileURL(output).href,
    { fallback: (text) => text },
  );
  if (createConfigFileOnly) {
    Logger.logSuccess(
      `Successfully created a config file at ${formattedOutput}`,
    );
  } else {
    caveat(`Successfully created a project at ${formattedOutput}`, {
      relativeOutput,
      installDependencies: Boolean(installDependencies),
    });
  }
}

async function askProjectPath() {
  return await askQuestion({
    question: {
      projectPath: {
        type: 'text',
        message: 'Where should we create your project?',
        placeholder: 'Specify "." to create files in the current directory.',
        required: true,
      },
    },
    schema: v.required(
      v.pick(VivliostyleInlineConfigWithoutChecks, ['projectPath']),
    ),
  });
}

async function askTitle({ projectPath }: { projectPath: string }) {
  return await askQuestion({
    question: {
      title: {
        type: 'text',
        message: "What's the title of your publication?",
        defaultValue: toTitleCase(projectPath) || DEFAULT_PROJECT_TITLE,
        placeholder: toTitleCase(projectPath) || DEFAULT_PROJECT_TITLE,
      },
    },
    schema: v.required(v.pick(VivliostyleInlineConfigWithoutChecks, ['title'])),
  });
}

async function askAuthor() {
  return await askQuestion({
    question: {
      author: {
        type: 'text',
        message: "What's the author name?",
        defaultValue: DEFAULT_PROJECT_AUTHOR,
        placeholder: DEFAULT_PROJECT_AUTHOR,
      },
    },
    schema: v.required(
      v.pick(VivliostyleInlineConfigWithoutChecks, ['author']),
    ),
  });
}

async function askLanguage() {
  const initialValue = await getOsLocale();
  return await askQuestion({
    question: {
      language: {
        type: 'autocomplete',
        message: "What's the language?",
        options: Object.entries(languages).map(([value, displayName]) => ({
          value,
          label: displayName,
          hint: value,
        })),
        initialValue,
      },
    },
    schema: v.required(
      v.pick(VivliostyleInlineConfigWithoutChecks, ['language']),
    ),
  });
}

export const PRESET_TEMPLATE_NOT_USE = 'Use templates from the community theme';

async function askPresetTemplate(): Promise<{
  presetTemplate: (typeof TEMPLATE_SETTINGS)[number] | undefined;
}> {
  const { presetTemplate } = await askQuestion({
    question: {
      presetTemplate: {
        type: 'select',
        message: "What's the project template?",
        options: [
          ...TEMPLATE_SETTINGS,
          {
            value: PRESET_TEMPLATE_NOT_USE,
            label: PRESET_TEMPLATE_NOT_USE,
            hint: 'If a theme includes a template, you can choose it in the next step.',
          },
        ],
      },
    },
    schema: v.object({
      presetTemplate: v.pipe(
        v.string(),
        v.transform((value) =>
          value === PRESET_TEMPLATE_NOT_USE
            ? undefined
            : TEMPLATE_SETTINGS.find((t) => t.value === value),
        ),
      ),
    }),
  });
  return { presetTemplate };
}

const truncateString = (str: string) => {
  const trimmed = str.replace(/\s+/g, ' ');
  return trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed;
};

export const THEME_ANSWER_NOT_USE = 'Not use Vivliostyle theme';
export const THEME_ANSWER_MANUAL = 'Install other themes from npm';

async function askTheme({
  template,
  presetTemplate,
  fetch,
}: Pick<ParsedVivliostyleInlineConfig, 'template'> & {
  presetTemplate: (typeof TEMPLATE_SETTINGS)[number] | undefined;
  fetch: ReturnType<typeof createFetch>;
}): Promise<
  Pick<ParsedVivliostyleInlineConfig, 'theme'> & {
    themePackage: VivliostylePackageJson | undefined;
  }
> {
  const recommendedThemes = (
    presetTemplate?.category
      ? VIVLIOSTYLE_THEME_CATEGORY_RECORD[presetTemplate.category]
      : []
  ) as string[];
  const useCommunityThemes = !presetTemplate && !template;
  const themePackages = await lazyPrompt(async () => {
    let themes = (await listVivliostyleThemes({ fetch })).objects;
    if (useCommunityThemes) {
      // Show only community themes
      themes = themes.filter(
        (theme) => !theme.package.name.startsWith('@vivliostyle/'),
      );
    }
    themes.sort((a, b) => {
      // Prioritize recommended themes for the selected template
      const aIsRecommended = recommendedThemes.includes(a.package.name) ? 1 : 0;
      const bIsRecommended = recommendedThemes.includes(b.package.name) ? 1 : 0;
      if (aIsRecommended ^ bIsRecommended) {
        return bIsRecommended - aIsRecommended;
      }
      // Prioritize packages in the @vivliostyle namespace
      const aIsOfficial = a.package.name.startsWith('@vivliostyle/') ? 1 : 0;
      const bIsOfficial = b.package.name.startsWith('@vivliostyle/') ? 1 : 0;
      return aIsOfficial ^ bIsOfficial
        ? bIsOfficial - aIsOfficial
        : b.downloads.monthly - a.downloads.monthly;
    });
    return themes.map((theme) => theme.package);
  }, 'Fetching a list of Vivliostyle themes');

  let themePackage: VivliostylePackageJson | undefined;
  const fetchedPackages: Record<string, PackageJson> = {};
  const validateThemeMetadataSchema = v.customAsync<string>(async (value) => {
    if (value === THEME_ANSWER_NOT_USE || value === THEME_ANSWER_MANUAL) {
      return true;
    }
    if (typeof value !== 'string') {
      return false;
    }
    fetchedPackages[value] ??= await fetchPackageMetadata({
      fetch,
      packageName: value,
      version: 'latest',
    });
    const pkg = fetchedPackages[value];
    const ret = v.safeParse(
      v.object({
        name: v.string(),
        version: v.string(),
        vivliostyle: v.optional(VivliostylePackageMetadata),
      }),
      pkg,
    );
    if (ret.success) {
      themePackage = ret.output;
    }
    return ret.success;
  }, 'Invalid theme package. Please check the schema of the `vivliostyle` field.');

  let { theme } = await askQuestion({
    question: {
      theme: {
        type: 'autocomplete',
        message: "What's the project theme?",
        options: [
          ...(!useCommunityThemes
            ? [{ label: THEME_ANSWER_NOT_USE, value: THEME_ANSWER_NOT_USE }]
            : []),
          { label: THEME_ANSWER_MANUAL, value: THEME_ANSWER_MANUAL },
          ...themePackages.map((pkg) => ({
            label: `${pkg.name}${recommendedThemes.includes(pkg.name) ? ' (Recommended)' : ''}`,
            value: pkg.name,
            hint: truncateString(pkg.description || ''),
          })),
        ],
        initialValue: themePackages[0].name,
      },
    },
    schema: v.objectAsync({ theme: validateThemeMetadataSchema }),
    validateProgressMessage: 'Fetching package metadata...',
  });

  if (theme === THEME_ANSWER_NOT_USE) {
    return { theme: undefined, themePackage: undefined };
  }

  if (theme === THEME_ANSWER_MANUAL) {
    theme = await askQuestion({
      question: {
        themeManualInput: {
          type: 'text',
          message: 'Input npm package name:',
          required: true,
        },
      },
      schema: v.objectAsync({
        themeManualInput: v.pipeAsync(
          v.string(),
          v.customAsync(async (packageName) => {
            if (typeof packageName !== 'string') {
              return false;
            }
            try {
              fetchedPackages[packageName] = await fetchPackageMetadata({
                fetch,
                packageName,
                version: 'latest',
              });
              return true;
            } catch (error) {
              return false;
            }
          }, 'Package not found'),
          validateThemeMetadataSchema,
        ),
      }),
      validateProgressMessage: 'Fetching package metadata',
    }).then((ret) => ret.themeManualInput);
  }

  return {
    theme: [
      { specifier: themePackage ? `${theme}@^${themePackage.version}` : theme },
    ],
    themePackage,
  };
}

async function askThemeTemplate(
  themeMetadata?: VivliostylePackageMetadata,
): Promise<
  Required<Pick<ParsedVivliostyleInlineConfig, 'template'>> & {
    extraTemplateVariables: Record<string, unknown>;
  }
> {
  const themeTemplate = themeMetadata?.template;
  const options = Object.entries(themeTemplate || {}).map(([value, tmpl]) => ({
    label: tmpl.name || value,
    value,
    hint: truncateString(tmpl.description || ''),
  }));
  if (!themeTemplate || options.length === 0) {
    promptLog.info(
      'The chosen theme does not set template settings. Applying the minimal template.',
    );
    return {
      template: TEMPLATE_SETTINGS.find((t) => t.value === 'minimal')!.template,
      extraTemplateVariables: {},
    };
  }

  const { usingTemplate } = await askQuestion({
    question: {
      usingTemplate: {
        type: 'autocomplete',
        message: 'Which template do you want to use?',
        options,
      },
    },
    schema: v.object({
      usingTemplate: v.pipe(
        v.string(),
        v.transform((input) => themeTemplate[input]),
      ),
    }),
  });

  let extraTemplateVariables: Record<string, unknown> = {};
  if (usingTemplate.prompt?.length) {
    extraTemplateVariables = await askQuestion({
      question: Object.fromEntries(
        usingTemplate.prompt.map((q) => [q.name, q]),
      ),
    });
  }
  return { template: usingTemplate.source, extraTemplateVariables };
}

async function askInstallDependencies() {
  return await askQuestion({
    question: {
      installDependencies: {
        type: 'select',
        message:
          'Should we install dependencies? (You can install them later.)',
        options: [
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ],
      },
    },
    schema: v.object({
      installDependencies: v.boolean(),
    }),
  });
}

async function askGitInit() {
  return await askQuestion({
    question: {
      gitInit: {
        type: 'select',
        message:
          'Should we initialize a git repository? (You can initialize it later.)',
        options: [
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ],
      },
    },
    schema: v.object({
      gitInit: v.boolean(),
    }),
  });
}

async function setupTemplate({
  cwd,
  projectPath,
  template,
  templateVariables,
}: Required<
  Pick<ParsedVivliostyleInlineConfig, 'cwd' | 'projectPath' | 'template'>
> & {
  templateVariables: Record<string, unknown>;
}) {
  await lazyPrompt(
    async () => {
      await downloadTemplate(template, { dir: projectPath, cwd });
      for (const [file, content] of Object.entries(TEMPLATE_DEFAULT_FILES)) {
        const targetPath = upath.join(cwd, projectPath, file);
        if (fs.existsSync(targetPath)) {
          continue;
        }
        fs.mkdirSync(upath.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content, 'utf8');
      }

      const replaceTemplateVariable = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const entryPath = upath.join(dir, entry.name);
          if (entry.isDirectory()) {
            replaceTemplateVariable(entryPath);
          } else {
            const buf = fs.readFileSync(entryPath);
            if (!isUtf8(buf)) {
              continue;
            }
            fs.writeFileSync(
              entryPath,
              format(buf.toString(), templateVariables),
              'utf8',
            );
          }
        }
      };
      replaceTemplateVariable(upath.join(cwd, projectPath));
    },
    'Downloading a template',
    0,
  );
}

function setupConfigFile({
  cwd,
  projectPath,
  templateVariables,
}: Required<Pick<ParsedVivliostyleInlineConfig, 'cwd' | 'projectPath'>> & {
  templateVariables: Record<string, unknown>;
}) {
  const targetPath = upath.join(cwd, projectPath, DEFAULT_CONFIG_FILENAME);
  const content = TEMPLATE_DEFAULT_FILES[DEFAULT_CONFIG_FILENAME];
  fs.mkdirSync(upath.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, format(content, templateVariables), 'utf8');
}

async function performInstallDependencies({
  cwd,
  projectPath,
}: Required<Pick<ParsedVivliostyleInlineConfig, 'cwd' | 'projectPath'>>) {
  const pm = whichPm();
  await lazyPrompt(
    async () => {
      await exec(pm, ['install'], { cwd: upath.join(cwd, projectPath) });
    },
    `Installing dependencies with ${pm}`,
    0,
  );
}

async function performGitInit({
  cwd,
  projectPath,
}: Required<Pick<ParsedVivliostyleInlineConfig, 'cwd' | 'projectPath'>>) {
  const targetPath = upath.join(cwd, projectPath);
  await lazyPrompt(
    async () => {
      await exec('git', ['init'], { cwd: targetPath });
    },
    'Initializing a git repository',
    0,
  );
}
