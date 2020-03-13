// cli-preview will be called when we uses `preview` subcommand

import path from 'path';
import program from 'commander';
import chalk from 'chalk';
import preview from './lib/preview';

program
  .name('vivliostyle preview')
  .description('Open preview page and save PDF interactively')
  .arguments('<input>')
  .option(
    '-b, --book',
    `load document as book mode
                             It can load multi-HTML documents such as an unzipped EPUB and a Web Publication.
                             Please see also http://vivliostyle.github.io/vivliostyle.js/docs/en/`,
  )
  .option(
    '--no-sandbox',
    `launch chrome without sandbox (use this option to avoid ECONNREFUSED error)`,
  )
  .option(
    '-r, --root <root_directory>',
    `specify assets root path (default directory of input file)`,
    undefined,
  )
  .option(
    '--executable-chromium <path>',
    'specify a path of executable Chrome(Chromium) you installed',
  )
  .parse(process.argv);

if (program.args.length < 1) {
  program.help();
}

preview({
  input: path.resolve(process.cwd(), program.args[0]),
  rootDir: program.root && path.resolve(process.cwd(), program.root),
  loadMode: program.book ? 'book' : 'document',
  sandbox: program.sandbox,
  executableChromium: program.executableChromium,
}).catch((err) => {
  console.error(`${chalk.red.bold('Error:')} ${err.message}`);
  console.log(`
If you think this is a bug, please report at https://github.com/vivliostyle/vivliostyle-cli/issues`);
});
