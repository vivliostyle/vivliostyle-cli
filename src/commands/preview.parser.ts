import commander from 'commander';

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
      '--executable-chromium <path>',
      'specify a path of executable Chrome(Chromium) you installed',
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
    );
  return program;
}
