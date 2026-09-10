import { Command, Option } from 'commander';

import { versionForDisplay } from '../util.js';
import { createParserProgram } from './cli-flags.js';

function setupThemeValidateParserProgram(): Command {
  const program = new Command();
  program
    .name('vivliostyle theme validate')
    .description('validate a Vivliostyle theme package')
    .arguments('[themePath]')
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

export const parseThemeValidateCommand = createParserProgram({
  setupProgram: setupThemeValidateParserProgram,
  parseArgs: (options, [themePath]) => ({ ...options, themePath }),
});
