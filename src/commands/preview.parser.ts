import { Command, Option } from 'commander';

export function setupPreviewParserProgram(): Command {
  const program = new Command();
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
    .option('-m, --crop-marks', 'print crop marks')
    .option(
      '--bleed <bleed>',
      'extent of the bleed area for printing with crop marks [3mm]',
    )
    .option(
      '--crop-offset <offset>',
      'distance between the edge of the trim size and the edge of the media size. [auto (13mm + bleed)]',
    )
    .option(
      '--css <CSS>',
      'custom style CSS code. (ex: ":root {--my-color: lime;}")',
    )
    .option('--style <stylesheet>', 'additional stylesheet URL or path')
    .option('--user-style <user_stylesheet>', 'user stylesheet URL or path')
    .option('-d, --single-doc', 'single HTML document input')
    .option('-q, --quick', 'quick loading with rough page count')
    .option('--title <title>', 'title')
    .option('--author <author>', 'author')
    .option('-l, --language <language>', 'language')
    .option('--verbose', 'verbose log output')
    .option(
      '--no-sandbox',
      `launch chrome without sandbox (use this option to avoid ECONNREFUSED error)`,
    )
    .option(
      '--executable-browser <path>',
      'specify a path of executable browser you installed',
    )
    .option(
      '--http',
      `launch an HTTP server hosting contents instead of file protocol
It is useful that requires CORS such as external web fonts.`,
    )
    .option(
      '--viewer <URL>',
      `specify a URL of displaying viewer instead of vivliostyle-cli's one
It is useful that using own viewer that has staging features. (ex: https://vivliostyle.vercel.app/)`,
    )
    .addOption(
      new Option(
        '--browser <browser>',
        `EXPERIMENTAL SUPPORT: Specify a browser type to launch Vivliostyle viewer [chromium]
Currently, Firefox and Webkit support preview command only!`,
      ).choices(['chromium', 'firefox', 'webkit']),
    )
    // TODO: Remove it in the next major version up
    .addOption(new Option('--executable-chromium <path>').hideHelp());
  return program;
}
