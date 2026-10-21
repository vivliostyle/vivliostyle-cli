import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import terminalLink from 'terminal-link';
import upath from 'upath';
import * as v from 'valibot';
import { cyan, dim, gray, green, yellow } from 'yoctocolors';

import { locateVivliostyleConfig } from '../config/load.js';
import {
  type ParsedVivliostyleInlineConfig,
  VivliostyleInlineConfigWithoutChecks,
  VivliostylePackageMetadata,
} from '../config/schema.js';
import {
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_PROJECT_AUTHOR,
  DEFAULT_PROJECT_TITLE,
  LANGUAGES,
  TEMPLATE_DEFAULT_PACKAGE_JSON,
  TEMPLATE_DEFAULT_VIVLIOSTYLE_CONFIG_JS,
  TEMPLATE_SETTINGS,
} from '../constants.js';
import { format, type TemplateVariable } from '../create-template.js';
import { askQuestion, InteractiveLogger } from '../interactive.js';
import { Logger } from '../logger.js';
import {
  createFetch,
  fetchPackageMetadata,
  fetchThemeCatalog,
  fetchThemeModeration,
  getThemeSiteUrl,
  installPackageForTemplate,
  listVivliostyleThemes,
  type PackageJson,
} from '../npm.js';
import {
  assertDestinationEmpty,
  performInstallDependencies,
  resolveTemplateSource,
  setupTemplate,
} from '../scaffold.js';
import { pickThemeInBrowser } from '../theme-picker.js';
import {
  cliVersion,
  coreVersion,
  cwd as defaultCwd,
  DetailError,
  getDefaultBrowserTag,
  getOsLocale,
  pathContains,
  toTitleCase,
  useTmpDirectory,
  whichPm,
} from '../util.js';

type VivliostylePackageJson = Pick<PackageJson, 'name' | 'version'> & {
  vivliostyle?: VivliostylePackageMetadata;
};

export async function create(
  inlineConfig: ParsedVivliostyleInlineConfig,
): Promise<void> {
  Logger.setLogOptions(inlineConfig);
  Logger.debug('create > inlineConfig %O', inlineConfig);

  const fetch = createFetch(inlineConfig);
  const interactiveLogger = new InteractiveLogger();
  let {
    projectPath,
    cwd = defaultCwd,
    title,
    author,
    language,
    theme,
    template,
    installDependencies,
    createConfigFileOnly = false,
  } = inlineConfig;
  let extraTemplateVariables: Record<string, unknown> = {};
  let themePackage: VivliostylePackageJson | undefined;
  let templateId: string | undefined;
  let useLocalTemplate = false;

  if (template) {
    ({ template, useLocalTemplate } = resolveTemplateSource({
      template,
      cwd,
      presets: TEMPLATE_SETTINGS,
      interactiveLogger,
    }));
  }

  if (!projectPath) {
    ({ projectPath } = await askProjectPath({ interactiveLogger }));
  }
  const dist = upath.join(cwd, projectPath);
  if (createConfigFileOnly) {
    if (fs.existsSync(upath.join(dist, DEFAULT_CONFIG_FILENAME))) {
      throw new Error(`${DEFAULT_CONFIG_FILENAME} already exists. Aborting.`);
    }
  } else {
    assertDestinationEmpty({ cwd, projectPath });
  }

  if (!title) {
    ({ title } = createConfigFileOnly
      ? { title: DEFAULT_PROJECT_TITLE }
      : await askTitle({ projectPath, interactiveLogger }));
  }
  if (!author) {
    ({ author } = createConfigFileOnly
      ? { author: DEFAULT_PROJECT_AUTHOR }
      : await askAuthor({ interactiveLogger }));
  }
  if (!language) {
    ({ language } = createConfigFileOnly
      ? { language: getOsLocale() }
      : await askLanguage({ interactiveLogger }));
  }

  if (!createConfigFileOnly) {
    let presetTemplate: (typeof TEMPLATE_SETTINGS)[number] | undefined;
    if (!template) {
      ({ presetTemplate } = await askPresetTemplate({ interactiveLogger }));
      if (presetTemplate) {
        template = presetTemplate.template;
      }
    }
    if (!theme && theme !== false) {
      ({ theme, themePackage, templateId } = await askTheme({
        presetTemplate,
        template,
        fetch,
        interactiveLogger,
      }));
    }
    if (!template) {
      ({ template, extraTemplateVariables, useLocalTemplate } =
        await askThemeTemplate({
          themePackage,
          templateId,
          interactiveLogger,
        }));
    }
    if (typeof installDependencies !== 'boolean') {
      ({ installDependencies } = await askInstallDependencies({
        interactiveLogger,
      }));
    }
  }

  const browserType = 'chrome' as const;
  const browserTag = getDefaultBrowserTag(browserType);
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
    browser: { type: browserType, tag: browserTag },
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
    if (interactiveLogger.messageHistory.length > 0) {
      interactiveLogger.logOutro(
        'All configurations are set! Creating your project...',
      );
    }
    using _ = Logger.startLogging(
      useLocalTemplate ? 'Copying a local template' : 'Downloading a template',
    );
    /* v8 ignore next 3 */
    if (!template) {
      throw new Error('No template is set to create a project.');
    }
    await setupTemplate({
      projectPath,
      cwd,
      template,
      signal: inlineConfig.signal,
      templateVariables: {
        ...inlineConfig,
        ...explicitTemplateVariables,
      },
      useLocalTemplate,
      writeDefaultFiles: writeDefaultProjectFiles,
    });
    if (installDependencies) {
      const pm = whichPm();
      using _ = Logger.suspendLogging(`Installing dependencies with ${pm}`);
      await performInstallDependencies({
        projectPath,
        cwd,
        pm,
        signal: inlineConfig.signal,
      });
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

function askProjectPath({
  interactiveLogger,
}: {
  interactiveLogger: InteractiveLogger;
}) {
  return askQuestion({
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
    interactiveLogger,
  });
}

function askTitle({
  projectPath,
  interactiveLogger,
}: {
  projectPath: string;
  interactiveLogger: InteractiveLogger;
}) {
  return askQuestion({
    question: {
      title: {
        type: 'text',
        message: "What's the title of your publication?",
        defaultValue: toTitleCase(projectPath) || DEFAULT_PROJECT_TITLE,
        placeholder: toTitleCase(projectPath) || DEFAULT_PROJECT_TITLE,
      },
    },
    schema: v.required(v.pick(VivliostyleInlineConfigWithoutChecks, ['title'])),
    interactiveLogger,
  });
}

function askAuthor({
  interactiveLogger,
}: {
  interactiveLogger: InteractiveLogger;
}) {
  return askQuestion({
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
    interactiveLogger,
  });
}

function askLanguage({
  interactiveLogger,
}: {
  interactiveLogger: InteractiveLogger;
}) {
  const initialValue = getOsLocale();
  return askQuestion({
    question: {
      language: {
        type: 'autocomplete',
        message: "What's the language?",
        options: Object.entries(LANGUAGES).map(([value, displayName]) => ({
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
    interactiveLogger,
  });
}

export const PRESET_TEMPLATE_NOT_USE = 'Use templates from the community theme';

async function askPresetTemplate({
  interactiveLogger,
}: {
  interactiveLogger: InteractiveLogger;
}): Promise<{
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
    interactiveLogger,
  });
  return { presetTemplate };
}

const TRUNCATE_LENGTH = 60;
const truncateString = (str: string) => {
  const trimmed = str.replaceAll(/\s+/gv, ' ');
  return trimmed.length > TRUNCATE_LENGTH
    ? trimmed.slice(0, TRUNCATE_LENGTH) + '…'
    : trimmed;
};

export const THEME_ANSWER_NOT_USE = 'Not use Vivliostyle theme';
export const THEME_ANSWER_MANUAL = 'Install other themes from npm';
export const THEME_ANSWER_BROWSER = 'Choose a theme in the browser';

const HIDDEN_REASONS: Record<string, string> = {
  deprecated: 'the package is deprecated',
  unpublished: 'the package was unpublished',
  'invalid-package': 'the package is not a valid theme',
  'not-a-theme': 'the package is not marked as a Vivliostyle theme',
  spam: 'it was reported as spam',
  malware: 'it was reported as malicious',
  inappropriate: 'it was reported as inappropriate',
  infringement: 'it was reported as infringing rights',
  impersonation: 'it was reported as an impersonation',
  broken: 'it was reported as not working',
};

/**
 * Lists themes from theme.vivliostyle.org, which leaves out deprecated,
 * invalid, and moderated packages, and falls back to the npm search.
 */
async function listThemes({
  fetch,
  communityOnly,
  interactiveLogger,
}: {
  fetch: ReturnType<typeof createFetch>;
  communityOnly: boolean;
  interactiveLogger: InteractiveLogger;
}): Promise<{ name: string; description?: string }[]> {
  let catalogError: unknown;
  const themes = await interactiveLogger.logLoading(
    'Fetching a list of Vivliostyle themes...',
    async () => {
      try {
        return await fetchThemeCatalog({
          fetch,
          source: communityOnly ? 'community' : undefined,
        });
      } catch (error) {
        catalogError = error;
      }
      let objects = (await listVivliostyleThemes({ fetch })).objects;
      if (communityOnly) {
        objects = objects.filter(
          (theme) => !theme.package.name.startsWith('@vivliostyle/'),
        );
      }
      objects.sort((a, b) => {
        // Prioritize packages in the @vivliostyle namespace
        const aIsOfficial = a.package.name.startsWith('@vivliostyle/') ? 1 : 0;
        const bIsOfficial = b.package.name.startsWith('@vivliostyle/') ? 1 : 0;
        return aIsOfficial ^ bIsOfficial
          ? bIsOfficial - aIsOfficial
          : b.downloads.monthly - a.downloads.monthly;
      });
      return objects.map((theme) => theme.package);
    },
  );
  if (catalogError) {
    Logger.debug('listThemes > catalog error %O', catalogError);
    interactiveLogger.logWarn(
      `Could not fetch the list of themes from ${getThemeSiteUrl()}. Showing the npm search results instead, which may include deprecated or hidden themes.`,
    );
  }
  return themes;
}

const ThemePackageSchema = v.object({
  name: v.string(),
  version: v.string(),
  vivliostyle: v.optional(VivliostylePackageMetadata),
});

/** Warns about a theme hidden on theme.vivliostyle.org and asks to proceed. */
async function confirmHiddenTheme({
  fetch,
  packageName,
  interactiveLogger,
}: {
  fetch: ReturnType<typeof createFetch>;
  packageName: string;
  interactiveLogger: InteractiveLogger;
}): Promise<boolean> {
  const moderation = await fetchThemeModeration({ fetch, packageName });
  if (moderation?.status !== 'hidden') {
    return true;
  }
  const reason =
    (moderation.reason && HIDDEN_REASONS[moderation.reason]) ||
    'it was hidden by the moderators';
  interactiveLogger.logWarn(
    `${packageName} is not listed on ${getThemeSiteUrl()} because ${reason}.`,
  );
  const { proceed } = await askQuestion({
    question: {
      proceed: {
        type: 'select',
        message: 'Do you want to use this theme anyway?',
        options: [
          { value: 'no', label: 'No, choose another theme' },
          { value: 'yes', label: 'Yes, use this theme' },
        ],
      },
    },
    schema: v.object({ proceed: v.picklist(['no', 'yes']) }),
    interactiveLogger,
  });
  return proceed === 'yes';
}

async function askThemeInBrowser({
  fetch,
  allowTemplate,
  communityOnly,
  interactiveLogger,
}: {
  fetch: ReturnType<typeof createFetch>;
  allowTemplate: boolean;
  communityOnly: boolean;
  interactiveLogger: InteractiveLogger;
}): Promise<
  | {
      themePackage: VivliostylePackageJson;
      templateId: string | undefined;
    }
  | undefined
> {
  const result = await pickThemeInBrowser({
    siteUrl: getThemeSiteUrl(),
    locale: getOsLocale(),
    allowTemplate,
    communityOnly,
    onUrl: (url) =>
      interactiveLogger.logInfo(
        `Choose a theme in your browser. If it does not open, visit:\n${cyan(url)}\n${dim('Press Esc to go back to the list.')}`,
      ),
  });
  if (result.type === 'timeout') {
    interactiveLogger.logWarn('No theme was chosen in the browser in time.');
    return;
  }
  if (result.type === 'cancelled') {
    return;
  }
  const { name, version, templateId } = result.selection;
  const pkg = await interactiveLogger.logLoading(
    'Fetching package metadata...',
    () => fetchPackageMetadata({ fetch, packageName: name, version }),
  );
  const parsed = v.safeParse(ThemePackageSchema, pkg);
  if (!parsed.success) {
    interactiveLogger.logWarn(
      `${name}@${version} is not a valid theme package. Please choose another theme.`,
    );
    return;
  }
  return { themePackage: parsed.output, templateId };
}

async function askTheme({
  template,
  presetTemplate,
  fetch,
  interactiveLogger,
}: Pick<ParsedVivliostyleInlineConfig, 'template'> & {
  presetTemplate: (typeof TEMPLATE_SETTINGS)[number] | undefined;
  fetch: ReturnType<typeof createFetch>;
  interactiveLogger: InteractiveLogger;
}): Promise<
  Pick<ParsedVivliostyleInlineConfig, 'theme'> & {
    themePackage: VivliostylePackageJson | undefined;
    templateId?: string;
  }
> {
  const useCommunityThemes = !presetTemplate && !template;
  const themePackages = await listThemes({
    fetch,
    communityOnly: useCommunityThemes,
    interactiveLogger,
  });
  // The page in the browser needs a terminal to cancel the wait from.
  const canChooseInBrowser = process.stdin.isTTY;

  let themePackage: VivliostylePackageJson | undefined;
  const fetchedPackages: Record<string, PackageJson> = {};
  const validateThemeMetadataSchema = v.customAsync<string>(async (value) => {
    if (
      value === THEME_ANSWER_NOT_USE ||
      value === THEME_ANSWER_MANUAL ||
      value === THEME_ANSWER_BROWSER
    ) {
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
    const ret = v.safeParse(ThemePackageSchema, pkg);
    if (ret.success) {
      themePackage = ret.output;
    }
    return ret.success;
  }, 'Invalid theme package. Please check the schema of the `vivliostyle` field.');

  while (true) {
    let { theme } = await askQuestion({
      question: {
        theme: {
          type: 'autocomplete',
          message: "What's the project theme?",
          options: [
            ...(useCommunityThemes
              ? []
              : [{ label: THEME_ANSWER_NOT_USE, value: THEME_ANSWER_NOT_USE }]),
            ...(canChooseInBrowser
              ? [
                  {
                    label: THEME_ANSWER_BROWSER,
                    value: THEME_ANSWER_BROWSER,
                    hint: `Preview themes on ${getThemeSiteUrl()}`,
                  },
                ]
              : []),
            { label: THEME_ANSWER_MANUAL, value: THEME_ANSWER_MANUAL },
            ...themePackages.map((pkg) => ({
              label: pkg.name,
              value: pkg.name,
              hint: truncateString(pkg.description || ''),
            })),
          ],
          initialValue: themePackages[0]?.name,
        },
      },
      schema: v.objectAsync({ theme: validateThemeMetadataSchema }),
      validateProgressMessage: 'Fetching package metadata...',
      interactiveLogger,
    });

    if (theme === THEME_ANSWER_NOT_USE) {
      return { theme: undefined, themePackage: undefined };
    }

    if (theme === THEME_ANSWER_BROWSER) {
      const chosen = await askThemeInBrowser({
        fetch,
        // A template chosen before the theme cannot be replaced.
        allowTemplate: useCommunityThemes,
        communityOnly: useCommunityThemes,
        interactiveLogger,
      });
      if (!chosen) {
        continue;
      }
      return {
        theme: [
          {
            specifier: `${chosen.themePackage.name}@^${chosen.themePackage.version}`,
          },
        ],
        themePackage: chosen.themePackage,
        templateId: chosen.templateId,
      };
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
        validateProgressMessage: 'Fetching package metadata...',
        interactiveLogger,
      }).then((ret) => ret.themeManualInput);
      if (
        !(await confirmHiddenTheme({
          fetch,
          packageName: theme,
          interactiveLogger,
        }))
      ) {
        continue;
      }
    }

    return {
      theme: [
        {
          specifier: themePackage ? `${theme}@^${themePackage.version}` : theme,
        },
      ],
      themePackage,
    };
  }
}

/**
 * A template `source` starting with `./` or `../` is a directory inside the
 * theme package, taken from the same version as the chosen theme.
 */
async function resolveThemeTemplateSource({
  source,
  themePackage,
  interactiveLogger,
}: {
  source: string;
  themePackage: VivliostylePackageJson;
  interactiveLogger: InteractiveLogger;
}): Promise<{ template: string; useLocalTemplate: boolean }> {
  if (!source.startsWith('./') && !source.startsWith('../')) {
    return { template: source, useLocalTemplate: false };
  }
  const [dir] = await useTmpDirectory();
  const packageDir = await interactiveLogger.logLoading(
    `Downloading ${themePackage.name}@${themePackage.version}...`,
    () =>
      installPackageForTemplate({
        packageName: themePackage.name,
        version: themePackage.version,
        dir,
      }),
  );
  const templateDir = upath.resolve(packageDir, source);
  if (
    !pathContains(packageDir, templateDir) ||
    !fs.existsSync(templateDir) ||
    !fs.statSync(templateDir).isDirectory()
  ) {
    throw new DetailError(
      `The template source of ${themePackage.name} is not a directory inside the package.`,
      source,
    );
  }
  return { template: templateDir, useLocalTemplate: true };
}

async function askThemeTemplate({
  interactiveLogger,
  themePackage,
  templateId,
}: {
  interactiveLogger: InteractiveLogger;
  themePackage?: VivliostylePackageJson;
  /** A template already chosen, e.g. in the browser. */
  templateId?: string;
}): Promise<
  Required<Pick<ParsedVivliostyleInlineConfig, 'template'>> & {
    extraTemplateVariables: Record<string, unknown>;
    useLocalTemplate: boolean;
  }
> {
  const themeTemplate = themePackage?.vivliostyle?.template;
  const options = Object.entries(themeTemplate ?? {}).map(([value, tmpl]) => ({
    label: tmpl.name || value,
    value,
    hint: truncateString(tmpl.description || ''),
  }));
  if (!themePackage || !themeTemplate || options.length === 0) {
    // theme.vivliostyle.org previews such themes with the basic template, so
    // the project matches what the user saw there.
    interactiveLogger.logWarn(
      'The chosen theme does not set template settings. Applying the basic template.',
    );
    const basicTemplate = TEMPLATE_SETTINGS.find((t) => t.value === 'basic');
    /* v8 ignore next 3 */
    if (!basicTemplate) {
      throw new Error('The basic template setting is not found.');
    }
    return {
      template: basicTemplate.template,
      extraTemplateVariables: {},
      useLocalTemplate: false,
    };
  }

  let usingTemplate =
    templateId === undefined ? undefined : themeTemplate[templateId];
  if (templateId !== undefined && !usingTemplate) {
    interactiveLogger.logWarn(
      `The theme has no template "${templateId}". Please choose one.`,
    );
  }
  if (!usingTemplate) {
    ({ usingTemplate } = await askQuestion({
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
      interactiveLogger,
    }));
  }

  let extraTemplateVariables: Record<string, unknown> = {};
  if (usingTemplate.prompt?.length) {
    extraTemplateVariables = await askQuestion({
      question: Object.fromEntries(
        usingTemplate.prompt.map((q) => [q.name, q]),
      ),
      interactiveLogger,
    });
  }
  const { template, useLocalTemplate } = await resolveThemeTemplateSource({
    source: usingTemplate.source,
    themePackage,
    interactiveLogger,
  });
  return { template, extraTemplateVariables, useLocalTemplate };
}

function askInstallDependencies({
  interactiveLogger,
}: {
  interactiveLogger: InteractiveLogger;
}) {
  return askQuestion({
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
    interactiveLogger,
  });
}

function writeDefaultProjectFiles(projectDir: string) {
  const packageJsonPath = upath.join(projectDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    fs.writeFileSync(packageJsonPath, TEMPLATE_DEFAULT_PACKAGE_JSON, 'utf8');
  }
  if (!locateVivliostyleConfig({ cwd: projectDir })) {
    fs.writeFileSync(
      upath.join(projectDir, DEFAULT_CONFIG_FILENAME),
      TEMPLATE_DEFAULT_VIVLIOSTYLE_CONFIG_JS,
      'utf8',
    );
  }
}

function setupConfigFile({
  cwd,
  projectPath,
  templateVariables,
}: Required<Pick<ParsedVivliostyleInlineConfig, 'cwd' | 'projectPath'>> & {
  templateVariables: Record<string, unknown>;
}) {
  const targetPath = upath.join(cwd, projectPath, DEFAULT_CONFIG_FILENAME);
  const content = TEMPLATE_DEFAULT_VIVLIOSTYLE_CONFIG_JS;
  fs.mkdirSync(upath.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, format(content, templateVariables), 'utf8');
}

function caveat(
  message: string,
  {
    relativeOutput,
    installDependencies,
  }: { relativeOutput: string; installDependencies: boolean },
): void {
  const steps = [];
  if (relativeOutput !== '.') {
    steps.push(`Navigate to ${green(relativeOutput)}`);
  }
  if (!installDependencies) {
    steps.push(`${cyan('npm install')} to install dependencies`);
  }
  steps.push(
    'Create and edit Markdown files',
    `Modify the ${cyan('entry')} field in ${green('vivliostyle.config.js')}`,
    `${cyan('npm run preview')} to open a preview browser window`,
    `${cyan('npm run build')} to generate the output file`,
  );

  Logger.logSuccess(message);
  Logger.log(
    `
Next steps:
${steps.map((s, i) => gray(`${i + 1}. `) + s).join('\n')}

For more information, visit ${terminalLink(yellow('https://docs.vivliostyle.org'), 'https://docs.vivliostyle.org', { fallback: (text) => text })}.

🖋 Happy writing!`,
  );
}
