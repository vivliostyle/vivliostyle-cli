import { downloadTemplate } from '@bluwy/giget-core';
import { isUtf8 } from 'node:buffer';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import terminalLink from 'terminal-link';
import upath from 'upath';
import * as v from 'valibot';
import { cyan } from 'yoctocolors';
import {
  ParsedVivliostyleInlineConfig,
  ThemeSpecifier,
  ValidString,
  VivliostyleInlineConfigWithoutChecks,
  VivliostylePackageMetadata,
} from '../config/schema.js';
import {
  cliVersion,
  coreVersion,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_PROJECT_AUTHOR,
  DEFAULT_PROJECT_TITLE,
  defaultProjectFiles,
  languages,
} from '../const.js';
import { format, TemplateVariable } from '../create-template.js';
import { askQuestion } from '../interactive.js';
import { Logger } from '../logger.js';
import {
  createFetch,
  fetchPackageMetadata,
  listVivliostyleThemes,
  PackageJson,
} from '../npm.js';
import { cwd as defaultCwd, toTitleCase } from '../util.js';

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
    ({ title } = await askTitle({ projectPath }));
  }
  if (!author) {
    ({ author } = await askAuthor());
  }
  if (!language) {
    ({ language } = await askLanguage());
  }
  if (!createConfigFileOnly && !theme) {
    ({ theme, themePackage } = await askTheme({ fetch }));
  }
  if (
    !createConfigFileOnly &&
    themePackage?.vivliostyle?.template &&
    !template
  ) {
    ({ template, extraTemplateVariables } = await askTemplateSetting(
      themePackage.vivliostyle,
    ));
  }

  const explicitTemplateVariables = {
    ...extraTemplateVariables,
    projectPath,
    title,
    author,
    language,
    theme: theme && flattenThemeField({ theme }),
    themePackage,
    template,
    cliVersion,
    coreVersion,
  } satisfies TemplateVariable;
  Logger.debug(
    'create > explicitTemplateVariables %O',
    explicitTemplateVariables,
  );
  if (template) {
    using _logger = Logger.startLogging('Downloading a template');
    await setupTemplate({
      projectPath,
      cwd,
      template,
      templateVariables: {
        ...inlineConfig,
        ...explicitTemplateVariables,
      },
    });
  } else {
    setupEmptyProject({
      projectPath,
      cwd,
      createConfigFileOnly,
      templateVariables: {
        ...inlineConfig,
        ...explicitTemplateVariables,
      },
    });
  }

  const output = createConfigFileOnly
    ? upath.join(dist, DEFAULT_CONFIG_FILENAME)
    : dist;
  const formattedOutput = cyan(upath.relative(cwd, output) || '.');
  Logger.logSuccess(
    `Successfully created ${terminalLink(
      formattedOutput,
      pathToFileURL(output).href,
      {
        fallback: () => formattedOutput,
      },
    )}`,
  );
}

async function askProjectPath() {
  return await askQuestion({
    question: {
      type: 'input',
      name: 'projectPath',
      message: 'Project directory name:',
      hint: 'Specify "." to create files in the current directory.',
    },
    schema: v.required(
      v.pick(VivliostyleInlineConfigWithoutChecks, ['projectPath']),
    ),
  });
}

async function askTitle({ projectPath }: { projectPath: string }) {
  return await askQuestion({
    question: {
      type: 'input',
      name: 'title',
      message: 'Title:',
      initial: toTitleCase(projectPath) || DEFAULT_PROJECT_TITLE,
    },
    schema: v.required(v.pick(VivliostyleInlineConfigWithoutChecks, ['title'])),
  });
}

async function askAuthor() {
  return await askQuestion({
    question: {
      type: 'input',
      name: 'author',
      message: 'Author:',
      initial: DEFAULT_PROJECT_AUTHOR,
    },
    schema: v.required(
      v.pick(VivliostyleInlineConfigWithoutChecks, ['author']),
    ),
  });
}

async function askLanguage() {
  return await askQuestion({
    question: {
      type: 'autocomplete',
      name: 'language',
      message: 'Language:',
      choices: Object.entries(languages).map(([value, displayName]) => ({
        value,
        name: displayName,
        hint: value,
      })),
      limit: 10,
      // initial: await getOsLocale(),
    },
    schema: v.required(
      v.pick(VivliostyleInlineConfigWithoutChecks, ['language']),
    ),
  });
}

export const THEME_ANSWER_NOT_USE = 'Not use Vivliostyle theme';
export const THEME_ANSWER_MANUAL = 'Install other themes from npm';

async function askTheme({
  fetch,
}: {
  fetch: ReturnType<typeof createFetch>;
}): Promise<
  Pick<ParsedVivliostyleInlineConfig, 'theme'> & {
    themePackage: VivliostylePackageJson | undefined;
  }
> {
  const themePackages = await (async () => {
    const themes = (await listVivliostyleThemes({ fetch })).objects;
    themes.sort((a, b) => {
      // Prioritize packages in the @vivliostyle namespace
      const aIsOfficial = a.package.name.startsWith('@vivliostyle/') ? 1 : 0;
      const bIsOfficial = b.package.name.startsWith('@vivliostyle/') ? 1 : 0;
      return aIsOfficial ^ bIsOfficial
        ? bIsOfficial - aIsOfficial
        : b.downloads.monthly - a.downloads.monthly;
    });
    return themes.map((theme) => theme.package);
  })();

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
      type: 'autocomplete',
      name: 'theme',
      message: 'Select theme:',
      choices: [
        { name: THEME_ANSWER_NOT_USE, value: THEME_ANSWER_NOT_USE },
        { name: THEME_ANSWER_MANUAL, value: THEME_ANSWER_MANUAL },
        ...themePackages.map((pkg) => ({
          name: pkg.name,
          value: pkg.name,
          hint: pkg.description?.replace(/\s+/g, ' ').slice(0, 20),
        })),
      ],
      limit: 10,
    },
    schema: v.objectAsync({
      theme: v.pipeAsync(ValidString, validateThemeMetadataSchema),
    }),
  });

  if (theme === THEME_ANSWER_NOT_USE) {
    return { theme: undefined, themePackage: undefined };
  }

  if (theme === THEME_ANSWER_MANUAL) {
    theme = await askQuestion({
      question: {
        type: 'input',
        name: 'themeManualInput',
        message: 'Input npm package name:',
      },
      schema: v.objectAsync({
        themeManualInput: v.pipeAsync(
          ValidString,
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
    }).then((ret) => ret.themeManualInput);
  }

  return {
    theme: [
      { specifier: themePackage ? `${theme}@^${themePackage.version}` : theme },
    ],
    themePackage,
  };
}

export const TEMPLATE_ANSWER_NOT_USE = 'Not use a template';

async function askTemplateSetting({
  template,
}: Pick<VivliostylePackageMetadata, 'template'>): Promise<
  Pick<ParsedVivliostyleInlineConfig, 'template'> & {
    extraTemplateVariables: Record<string, unknown>;
  }
> {
  const { usingTemplate } = await askQuestion({
    question: {
      type: 'autocomplete',
      name: 'usingTemplate',
      message: 'Select template:',
      choices: [
        { name: TEMPLATE_ANSWER_NOT_USE, value: TEMPLATE_ANSWER_NOT_USE },
        ...Object.entries(template || {}).map(([value, tmpl]) => ({
          name: tmpl.name || value,
          value,
          hint: tmpl.description?.replace(/\s+/g, ' ').slice(0, 20),
        })),
      ],
      limit: 10,
    },
    schema: v.objectAsync({
      usingTemplate: v.pipe(
        v.string(),
        v.transform((input) => {
          return input === TEMPLATE_ANSWER_NOT_USE
            ? undefined
            : template?.[input];
        }),
      ),
    }),
  });

  let extraTemplateVariables: Record<string, unknown> = {};
  if (usingTemplate?.prompt?.length) {
    extraTemplateVariables = await askQuestion({
      question: usingTemplate.prompt,
    });
  }
  return { template: usingTemplate?.source, extraTemplateVariables };
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
  await downloadTemplate(template, { dir: projectPath, cwd });
  replaceTemplateVariable(upath.join(cwd, projectPath), templateVariables);
}

function setupEmptyProject({
  cwd,
  projectPath,
  createConfigFileOnly,
  templateVariables,
}: Required<
  Pick<
    ParsedVivliostyleInlineConfig,
    'cwd' | 'projectPath' | 'createConfigFileOnly'
  >
> & {
  templateVariables: Record<string, unknown>;
}) {
  const dist = upath.join(cwd, projectPath);
  for (const [file, content] of Object.entries(defaultProjectFiles)) {
    if (createConfigFileOnly && file !== DEFAULT_CONFIG_FILENAME) {
      continue;
    }
    const targetPath = upath.join(dist, file);
    fs.mkdirSync(upath.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
  }
  replaceTemplateVariable(dist, templateVariables);
}

function replaceTemplateVariable(
  destDir: string,
  templateVariables: Record<string, unknown>,
) {
  const replace = (file: string) => {
    const buf = fs.readFileSync(file);
    if (!isUtf8(buf)) {
      return;
    }
    fs.writeFileSync(file, format(buf.toString(), templateVariables), 'utf8');
  };
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = upath.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else {
        replace(entryPath);
      }
    }
  };
  walk(destDir);
}

function flattenThemeField({
  theme,
}: Required<Pick<ParsedVivliostyleInlineConfig, 'theme'>>): ThemeSpecifier {
  const arr = theme.map((t) => (t.import ? t : t.specifier));
  return arr.length === 1 ? arr[0] : arr;
}
