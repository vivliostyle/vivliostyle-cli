import { Command, Option } from 'commander';
import { createParserProgram } from './cli-flags.js';

function setupCreateParserProgram(): Command {
  const program = new Command();
  program
    .name('vivliostyle create')
    .description('scaffold a new Vivliostyle project')
    .arguments('[name]')
    .option('--title <title>', 'title')
    .option('--author <author>', 'author')
    .option('-T, --theme <theme>', 'theme')
    .option(
      '--template <template>',
      `Template source in format of \`[provider]:repo[/subpath][#ref]\``,
    )
    .addOption(
      new Option('--proxy-server <proxyServer>', `HTTP/SOCK proxy server url`),
    )
    .addOption(
      new Option(
        '--proxy-bypass <proxyBypass>',
        `optional comma-separated domains to bypass proxy`,
      ),
    )
    .addOption(
      new Option(
        '--proxy-user <proxyUser>',
        `optional username for HTTP proxy authentication`,
      ),
    )
    .addOption(
      new Option(
        '--proxy-pass <proxyPass>',
        `optional password for HTTP proxy authentication`,
      ),
    )
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

export const parseCreateCommand = createParserProgram({
  setupProgram: setupCreateParserProgram,
  parseArgs: (options, [name]) => ({ ...options, name }),
});
