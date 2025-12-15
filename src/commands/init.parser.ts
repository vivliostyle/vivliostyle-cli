import { Command, Option } from 'commander';
import { versionForDisplay } from '../const.js';
import { createParserProgram } from './cli-flags.js';

function setupInitParserProgram(): Command {
  const program = new Command();
  program
    .name('vivliostyle init')
    .description('create vivliostyle config file')
    .option('--title <title>', 'title')
    .option('--author <author>', 'author')
    .option('-l, --language <language>', 'language')
    .option('-s, --size <size>', 'paper size')
    .option('-T, --theme <theme>', 'theme')
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

// The `init` command is actually an alias for `create --create-config-file-only`
export const parseInitCommand = createParserProgram({
  setupProgram: setupInitParserProgram,
  parseArgs: (options) => ({
    ...options,
    projectPath: '.',
    createConfigFileOnly: true,
    template: undefined,
  }),
});
