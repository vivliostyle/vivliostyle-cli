import { Command, Option } from 'commander';
import { versionForDisplay } from '../const.js';
import { createParserProgram } from './cli-flags.js';

function setupCreateParserProgram(): Command {
  const program = new Command();
  program
    .name('vivliostyle create')
    .description('scaffold a new Vivliostyle project')
    .arguments('[projectPath]')
    .option('--title <title>', 'title')
    .option('--author <author>', 'author')
    .option('-l, --language <language>', 'language')
    .option('-s, --size <size>', 'paper size')
    .option('-T, --theme <theme>', 'theme')
    .option(
      '--template <template>',
      `Template source in the format of \`[provider]:repo[/subpath][#ref]\` or as a local directory to copy from.`,
    )
    .option(
      '--install-dependencies',
      'Install dependencies after creating a project.',
    )
    .option(
      '--no-install-dependencies',
      'Do not install dependencies after creating a project.',
    )
    .option(
      '--create-config-file-only',
      `Create a Vivliostyle config file without generating project template files.`,
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
    )
    .version(versionForDisplay, '-v, --version');
  return program;
}

export const parseCreateCommand = createParserProgram({
  setupProgram: setupCreateParserProgram,
  parseArgs: (options, [projectPath]) => ({ ...options, projectPath }),
});
