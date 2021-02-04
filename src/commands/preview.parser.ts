import commander from 'commander';
import { CliFlags } from '../config';

export interface PreviewCliFlags extends CliFlags {}

export function setupPreviewParserProgram(): commander.Command {
  const program = new commander.Command();
  program
    .name('vivliostyle preview')
    .description('launch preview server')
    .arguments('[input]')
    .option('-c, --config <config_file>', 'path to vivliostyle.config.js')
    .option('-T, --theme <theme>', 'theme path or package name')
    .option(
      '-s, --size <size>',
      `output pdf size [Letter]
preset: A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger
custom(comma separated): 182mm,257mm or 8.5in,11in`,
    )
    .option('--title <title>', 'title')
    .option('--author <author>', 'author')
    .option('-l, --language <language>', 'language')
    .option('--verbose', 'verbose log output')
    .option(
      '--no-sandbox',
      `launch chrome without sandbox (use this option to avoid ECONNREFUSED error)`,
    )
    .option(
      '--executable-chromium <path>',
      'specify a path of executable Chrome(Chromium) you installed',
    );
  return program;
}
