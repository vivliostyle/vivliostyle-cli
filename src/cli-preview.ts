// cli-preview will be called when we uses `preview` subcommand

import path from 'path';
import program from 'commander';
import chalk from 'chalk';
import preview from './lib/preview';

program
  .name('vivliostyle preview')
  .description('launch preview server')
  .arguments('<input>')
  .option(
    '-r, --root <root_directory>',
    `specify assets root path (default directory of input file)`,
    undefined,
  )
  .option(
    '--no-sandbox',
    `launch chrome without sandbox (use this option to avoid ECONNREFUSED error)`,
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
  rootDir: program.root,
  sandbox: program.sandbox,
  executableChromium: program.executableChromium,
}).catch((err) => {
  console.error(`${chalk.red.bold('Error:')} ${err.message}`);
  console.log(`
If you think this is a bug, please report at https://github.com/vivliostyle/vivliostyle-cli/issues`);
});
