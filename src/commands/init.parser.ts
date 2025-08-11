import { Command, Option } from 'commander';
import { createParserProgram } from './cli-flags.js';

function setupInitParserProgram(): Command {
  const program = new Command();
  program
    .name('vivliostyle init')
    .description('create vivliostyle config file')
    .option('--title <title>', 'title')
    .option('--author <author>', 'author')
    .option('-l, --language <language>', 'language')
    .option('-s, --size  <size>', 'paper size')
    .option('-T, --theme <theme>', 'theme')
    .addOption(
      new Option(
        '--log-level <level>',
        'specify a log level of console outputs',
      )
        .choices(['silent', 'info', 'verbose', 'debug'])
        .default('info'),
    );
  return program;
}

export const parseInitCommand = createParserProgram({
  setupProgram: setupInitParserProgram,
});
