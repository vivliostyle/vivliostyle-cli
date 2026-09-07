import { Command, Option } from 'commander';

import { DEFAULT_THEME_LICENSE, THEME_CATEGORIES } from '../constants.js';
import { versionForDisplay } from '../util.js';
import { createParserProgram } from './cli-flags.js';

function setupThemeCreateParserProgram(): Command {
  const program = new Command();
  program
    .name('vivliostyle theme create')
    .description('scaffold a new Vivliostyle theme package')
    .arguments('[projectPath]')
    .option(
      '--name <name>',
      'npm package name of the theme (default: "vivliostyle-theme-<directory name>")',
    )
    .option('--description <description>', 'description of the theme')
    .option('--author <author>', 'author')
    .addOption(
      new Option('--category <category>', 'category of the theme').choices(
        THEME_CATEGORIES.map((c) => c.value),
      ),
    )
    .addOption(
      new Option(
        '--license <license>',
        'SPDX license identifier of the theme',
      ).default(DEFAULT_THEME_LICENSE),
    )
    .option(
      '--template <template>',
      `Template source in the format of \`[provider]:repo[/subpath][#ref]\` or as a local directory to copy from.`,
    )
    .option(
      '--install-dependencies',
      'Install dependencies after creating a theme.',
    )
    .option(
      '--no-install-dependencies',
      'Do not install dependencies after creating a theme.',
    )
    .addOption(
      new Option(
        '--log-level <level>',
        'specify a log level of console outputs',
      )
        .choices(['silent', 'info', 'verbose', 'debug'])
        .default('info'),
    )
    .version(versionForDisplay, '-v, --version');
  return program;
}

export const parseThemeCreateCommand = createParserProgram({
  setupProgram: setupThemeCreateParserProgram,
  parseArgs: (options, [projectPath]) => ({ ...options, projectPath }),
});
