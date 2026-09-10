import { pathToFileURL } from 'node:url';

import { capitalCase, kebabCase } from 'change-case';
import terminalLink from 'terminal-link';
import upath from 'upath';
import * as v from 'valibot';
import { cyan, gray, green, yellow } from 'yoctocolors';

import {
  NpmPackageName,
  type ParsedVivliostyleInlineConfig,
  ValidString,
} from '../config/schema.js';
import {
  DEFAULT_PROJECT_AUTHOR,
  DEFAULT_THEME_LICENSE,
  DEFAULT_THEME_TEMPLATE,
  THEME_CATEGORIES,
} from '../constants.js';
import { askQuestion, InteractiveLogger } from '../interactive.js';
import { Logger } from '../logger.js';
import {
  assertDestinationEmpty,
  performInstallDependencies,
  resolveTemplateSource,
  setupTemplate,
} from '../scaffold.js';
import {
  cliVersion,
  coreVersion,
  cwd as defaultCwd,
  whichPm,
} from '../util.js';

const THEME_PACKAGE_NAME_PREFIX = 'vivliostyle-theme-';

export interface ThemeTemplateVariable extends ParsedVivliostyleInlineConfig {
  projectPath: string;
  name: string;
  themeName: string;
  description: string;
  author: string;
  category: (typeof THEME_CATEGORIES)[number]['value'];
  license: string;
  template: string;
  installDependencies: boolean;
  cliVersion: string;
  coreVersion: string;
}

export async function createTheme(
  inlineConfig: ParsedVivliostyleInlineConfig,
): Promise<void> {
  Logger.setLogOptions(inlineConfig);
  Logger.debug('createTheme > inlineConfig %O', inlineConfig);

  const interactiveLogger = new InteractiveLogger();
  let {
    projectPath,
    cwd = defaultCwd,
    name,
    description,
    author,
    category,
    license = DEFAULT_THEME_LICENSE,
    template: templateSource = DEFAULT_THEME_TEMPLATE,
    installDependencies,
  } = inlineConfig;

  const { template, useLocalTemplate } = resolveTemplateSource({
    template: templateSource,
    cwd,
    presets: [],
    interactiveLogger,
  });

  if (!projectPath) {
    ({ projectPath } = await askProjectPath({ interactiveLogger }));
  }
  assertDestinationEmpty({ cwd, projectPath });

  if (!name) {
    ({ name } = await askThemeName({
      defaultValue: defaultThemePackageName({ cwd, projectPath }),
      interactiveLogger,
    }));
  }
  if (description === undefined) {
    ({ description } = await askThemeDescription({ interactiveLogger }));
  }
  if (!author) {
    ({ author } = await askAuthor({ interactiveLogger }));
  }
  if (!category) {
    ({ category } = await askThemeCategory({ interactiveLogger }));
  }
  if (typeof installDependencies !== 'boolean') {
    ({ installDependencies } = await askInstallDependencies({
      interactiveLogger,
    }));
  }

  const templateVariables = {
    ...inlineConfig,
    projectPath,
    name,
    themeName: toThemeDisplayName(name),
    description,
    author,
    category,
    license,
    template,
    installDependencies,
    cliVersion,
    coreVersion,
  } satisfies ThemeTemplateVariable;
  Logger.debug('createTheme > templateVariables %O', templateVariables);

  if (interactiveLogger.messageHistory.length > 0) {
    interactiveLogger.logOutro(
      'All configurations are set! Creating your theme...',
    );
  }
  using _ = Logger.startLogging(
    useLocalTemplate ? 'Copying a local template' : 'Downloading a template',
  );
  await setupTemplate({
    projectPath,
    cwd,
    template,
    signal: inlineConfig.signal,
    templateVariables,
    useLocalTemplate,
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

  const output = upath.join(cwd, projectPath);
  const relativeOutput = upath.relative(cwd, output) || '.';
  const formattedOutput = terminalLink(
    cyan(relativeOutput),
    pathToFileURL(output).href,
    { fallback: (text) => text },
  );
  caveat(`Successfully created a theme at ${formattedOutput}`, {
    relativeOutput,
    installDependencies,
  });
}

function defaultThemePackageName({
  cwd,
  projectPath,
}: {
  cwd: string;
  projectPath: string;
}): string {
  const base = kebabCase(upath.basename(upath.resolve(cwd, projectPath)));
  return base.startsWith(THEME_PACKAGE_NAME_PREFIX)
    ? base
    : `${THEME_PACKAGE_NAME_PREFIX}${base}`;
}

function toThemeDisplayName(name: string): string {
  const unscoped = name.replace(/^@[^\/]+\//v, '');
  const stripped = unscoped.startsWith(THEME_PACKAGE_NAME_PREFIX)
    ? unscoped.slice(THEME_PACKAGE_NAME_PREFIX.length)
    : unscoped;
  return capitalCase(stripped || unscoped);
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
        message: 'Where should we create your theme?',
        placeholder: 'Specify "." to create files in the current directory.',
        required: true,
      },
    },
    schema: v.object({ projectPath: ValidString }),
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
    schema: v.object({ author: ValidString }),
    interactiveLogger,
  });
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
    schema: v.object({ installDependencies: v.boolean() }),
    interactiveLogger,
  });
}

function askThemeName({
  defaultValue,
  interactiveLogger,
}: {
  defaultValue: string;
  interactiveLogger: InteractiveLogger;
}) {
  return askQuestion({
    question: {
      name: {
        type: 'text',
        message: "What's the npm package name of your theme?",
        defaultValue,
        placeholder: defaultValue,
        validate: (value) => {
          const { success, issues } = v.safeParse(NpmPackageName, value);
          return success ? undefined : issues[0].message;
        },
      },
    },
    schema: v.object({ name: NpmPackageName }),
    interactiveLogger,
  });
}

function askThemeDescription({
  interactiveLogger,
}: {
  interactiveLogger: InteractiveLogger;
}) {
  return askQuestion({
    question: {
      description: {
        type: 'text',
        message: "What's the description of your theme? (optional)",
      },
    },
    schema: v.object({
      description: v.optional(v.pipe(v.string(), v.trim()), ''),
    }),
    interactiveLogger,
  });
}

function askThemeCategory({
  interactiveLogger,
}: {
  interactiveLogger: InteractiveLogger;
}) {
  return askQuestion({
    question: {
      category: {
        type: 'select',
        message: "What's the category of your theme?",
        options: [...THEME_CATEGORIES],
      },
    },
    schema: v.object({
      category: v.picklist(THEME_CATEGORIES.map((c) => c.value)),
    }),
    interactiveLogger,
  });
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
    `Edit ${green('theme.css')} to style your theme`,
    `${cyan('npm run example:preview')} to preview the example document with your theme`,
    `${cyan('npm run validate')} to validate the theme package before publishing`,
    `${cyan('npm publish')} to publish your theme to npm`,
  );

  Logger.logSuccess(message);
  Logger.log(
    `
Next steps:
${steps.map((s, i) => gray(`${i + 1}. `) + s).join('\n')}

For more information, visit ${terminalLink(yellow('https://github.com/vivliostyle/themes'), 'https://github.com/vivliostyle/themes', { fallback: (text) => text })}.

🎨 Happy styling!`,
  );
}
