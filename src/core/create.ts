import { downloadTemplate } from '@bluwy/giget-core';
import { pathToFileURL } from 'node:url';
import terminalLink from 'terminal-link';
import upath from 'upath';
import * as v from 'valibot';
import { cyan } from 'yoctocolors';
import {
  ParsedVivliostyleInlineConfig,
  ValidString,
  VivliostyleInlineConfigWithoutChecks,
  VivliostylePackageMetadata,
} from '../config/schema.js';
import { askQuestion } from '../interactive.js';
import { Logger } from '../logger.js';
import {
  createFetch,
  fetchPackageMetadata,
  listVivliostyleThemes,
  PackageJson,
} from '../npm.js';
import { cwd as defaultCwd, toTitleCase } from '../util.js';

export async function create(inlineConfig: ParsedVivliostyleInlineConfig) {
  Logger.setLogLevel(inlineConfig.logLevel);
  Logger.setCustomLogger(inlineConfig.logger);
  Logger.debug('create > inlineConfig %O', inlineConfig);

  const fetch = createFetch(inlineConfig);
  let response = { ...inlineConfig, cwd: inlineConfig.cwd ?? defaultCwd };
  let templateVariables: Record<string, unknown> = {};
  let packageMetadata: VivliostylePackageMetadata | undefined;
  if (!response.name) {
    response = { ...response, ...(await askProjectName()) };
  }
  if (!response.title) {
    response = { ...response, ...(await askTitle(response)) };
  }
  if (!response.author) {
    response = { ...response, ...(await askAuthor()) };
  }
  if (!response.theme) {
    const ret = await askTheme({ fetch });
    response = { ...response, theme: ret.theme };
    packageMetadata = ret.packageMetadata;
  }

  if (packageMetadata?.template && !response.template) {
    const ret = await askTemplateSetting(packageMetadata);
    response = { ...response, template: ret.template };
    templateVariables = { ...ret.extraAnswers };
  }

  if (response.template) {
    using _logger = Logger.startLogging('Downloading a template');
    await setupTemplate({ ...response, templateVariables });
  }
  const formattedOutput = cyan(
    upath.relative(response.cwd, response.name!) || '.',
  );
  Logger.logSuccess(
    `Successfully created the Vivliostyle project to ${terminalLink(
      formattedOutput,
      pathToFileURL(upath.join(response.cwd, response.name!)).href,
      {
        fallback: () => formattedOutput,
      },
    )}`,
  );
}

async function askProjectName() {
  return await askQuestion({
    question: {
      type: 'input',
      name: 'name',
      message: 'Project directory name:',
      hint: 'Specify "." to create files in the current directory.',
    },
    schema: v.pick(VivliostyleInlineConfigWithoutChecks, ['name']),
  });
}

async function askTitle({ name }: { name?: string }) {
  return await askQuestion({
    question: {
      type: 'input',
      name: 'title',
      message: 'Title:',
      initial: toTitleCase(name) || 'My Book Title',
    },
    schema: v.pick(VivliostyleInlineConfigWithoutChecks, ['title']),
  });
}

async function askAuthor() {
  return await askQuestion({
    question: {
      type: 'input',
      name: 'author',
      message: 'Author:',
      initial: 'John Doe',
    },
    schema: v.pick(VivliostyleInlineConfigWithoutChecks, ['author']),
  });
}

async function askTheme({
  fetch,
}: {
  fetch: ReturnType<typeof createFetch>;
}): Promise<
  Pick<ParsedVivliostyleInlineConfig, 'theme'> & {
    packageMetadata: VivliostylePackageMetadata | undefined;
  }
> {
  const NOT_USE = 'Not use Vivliostyle theme';
  const MANUAL = 'Install other themes from npm';

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

  let packageMetadata: VivliostylePackageMetadata | undefined;
  const fetchedPackages: Record<string, PackageJson> = {};
  const validateThemeMetadataSchema = v.customAsync<string>(async (value) => {
    if (value === NOT_USE || value === MANUAL) {
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
    if (!pkg.vivliostyle) {
      return true;
    }
    const ret = v.safeParse(VivliostylePackageMetadata, pkg.vivliostyle);
    if (ret.success) {
      packageMetadata = ret.output;
    }
    return ret.success;
  }, 'Invalid theme package. Please check the schema of the `vivliostyle` field.');

  const { theme } = await askQuestion({
    question: {
      type: 'autocomplete',
      name: 'theme',
      message: 'Select theme:',
      choices: [
        { name: NOT_USE, value: NOT_USE },
        { name: MANUAL, value: MANUAL },
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

  if (theme === NOT_USE) {
    return { theme: undefined, packageMetadata: undefined };
  }
  if (theme === MANUAL) {
    await askQuestion({
      question: {
        type: 'input',
        name: 'theme',
        message: 'Input npm package name:',
      },
      schema: v.objectAsync({
        theme: v.pipeAsync(
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
          v.transform((input) => [{ specifier: input }]),
        ),
      }),
    });
  }

  return { theme: [{ specifier: theme }], packageMetadata };
}

async function askTemplateSetting({
  template,
}: Pick<VivliostylePackageMetadata, 'template'>): Promise<
  Pick<ParsedVivliostyleInlineConfig, 'template'> & {
    extraAnswers: Record<string, unknown>;
  }
> {
  const NOT_USE = 'Not use a template';

  const { usingTemplate } = await askQuestion({
    question: {
      type: 'autocomplete',
      name: 'usingTemplate',
      message: 'Select template:',
      choices: [
        { name: NOT_USE, value: NOT_USE },
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
          return input === NOT_USE ? undefined : template?.[input];
        }),
      ),
    }),
  });

  let extraAnswers: Record<string, unknown> = {};
  if (usingTemplate?.prompt?.length) {
    extraAnswers = await askQuestion({
      question: usingTemplate.prompt,
    });
  }
  return { template: usingTemplate?.source, extraAnswers };
}

async function setupTemplate({
  cwd,
  name,
  templateVariables,
}: Pick<ParsedVivliostyleInlineConfig, 'cwd' | 'name'> & {
  templateVariables: Record<string, unknown>;
}) {
  await downloadTemplate(
    'gh:vivliostyle/themes/packages/@vivliostyle/theme-base/example',
    { dir: name, cwd },
  );
}
