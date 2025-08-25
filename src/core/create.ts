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
  ValidString,
  VivliostyleInlineConfigWithoutChecks,
  VivliostylePackageMetadata,
} from '../config/schema.js';
import { defaultProjectFiles } from '../const.js';
import { format } from '../create-template.js';
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
  let response = { ...inlineConfig, cwd: inlineConfig.cwd ?? defaultCwd };
  let templateVariables: Record<string, unknown> = {};
  let packageJson: VivliostylePackageJson | undefined;
  if (!response.name) {
    response = { ...response, ...(await askProjectName()) };
  }
  const { name, cwd } = response;
  /* v8 ignore next 3 */
  if (!name || !cwd) {
    return;
  }
  const dist = upath.join(cwd, name);
  if (
    (name === '.' &&
      fs.readdirSync(dist).filter((n) => !n.startsWith('.')).length > 0) ||
    (name !== '.' && fs.existsSync(dist))
  ) {
    throw new Error(`Destination ${dist} is not empty.`);
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
    packageJson = ret.packageJson;
  }

  if (packageJson?.vivliostyle?.template && !response.template) {
    const ret = await askTemplateSetting(packageJson.vivliostyle);
    response = { ...response, template: ret.template };
    templateVariables = { ...ret.extraAnswers };
  }

  templateVariables = {
    ...templateVariables,
    ...response,
    theme: packageJson
      ? `${packageJson.name}@^${packageJson.version}`
      : undefined,
  };
  Logger.debug('create > response %O', response);
  Logger.debug('create > templateVariables %O', templateVariables);
  if (response.template) {
    using _logger = Logger.startLogging('Downloading a template');
    await setupTemplate({
      name,
      cwd,
      template: response.template,
      templateVariables,
    });
  } else {
    setupEmptyProject({ name, cwd, templateVariables });
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

export const THEME_ANSWER_NOT_USE = 'Not use Vivliostyle theme';
export const THEME_ANSWER_MANUAL = 'Install other themes from npm';

async function askTheme({
  fetch,
}: {
  fetch: ReturnType<typeof createFetch>;
}): Promise<
  Pick<ParsedVivliostyleInlineConfig, 'theme'> & {
    packageJson: VivliostylePackageJson | undefined;
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

  let packageJson: VivliostylePackageJson | undefined;
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
      packageJson = ret.output;
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
    return { theme: undefined, packageJson: undefined };
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

  return { theme: [{ specifier: theme }], packageJson };
}

export const TEMPLATE_ANSWER_NOT_USE = 'Not use a template';

async function askTemplateSetting({
  template,
}: Pick<VivliostylePackageMetadata, 'template'>): Promise<
  Pick<ParsedVivliostyleInlineConfig, 'template'> & {
    extraAnswers: Record<string, unknown>;
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
  template,
  templateVariables,
}: Required<
  Pick<ParsedVivliostyleInlineConfig, 'cwd' | 'name' | 'template'>
> & {
  templateVariables: Record<string, unknown>;
}) {
  await downloadTemplate(template, { dir: name, cwd });
  replaceTemplateVariable(upath.join(cwd, name), templateVariables);
}

function setupEmptyProject({
  cwd,
  name,
  templateVariables,
}: Required<Pick<ParsedVivliostyleInlineConfig, 'cwd' | 'name'>> & {
  templateVariables: Record<string, unknown>;
}) {
  const dist = upath.join(cwd, name);
  for (const [file, content] of Object.entries(defaultProjectFiles)) {
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
