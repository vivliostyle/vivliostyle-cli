import chalk from 'chalk';
import program from 'commander';
import fs from 'fs';
import path from 'upath';
import { gracefulError, log } from '../util';

export interface InitCliFlags {
  title?: string;
  author?: string;
  language?: string;
  theme?: string;
  size?: string;
}

program
  .name('vivliostyle init')
  .description('create vivliostyle config file')
  .option('--title <title>', 'title')
  .option('--author <author>', 'author')
  .option('-l, --language <language>', 'language')
  .option('-s, --size  <size>', 'paper size')
  .option('-t, --theme <theme>', 'theme')
  .parse(process.argv);

init({
  title: program.title,
  author: program.author,
  language: program.language,
  size: program.size,
  theme: program.theme,
}).catch(gracefulError);

export default async function init(cliFlags: InitCliFlags) {
  const vivliostyleConfigPath = path.join(
    process.cwd(),
    'vivliostyle.config.js',
  );

  if (fs.existsSync(vivliostyleConfigPath)) {
    return log(
      `${chalk.yellow('vivliostyle.config.js already exists. aborting.')}`,
    );
  }

  // prettier-ignore
  const vivliostyleConfig = `module.exports = {
  title: '${ cliFlags.title || 'Principia'}', // populated into 'manifest.json', default to 'title' of the first entry or 'name' in 'package.json'.
  author: '${cliFlags.author || 'Isaac Newton'}', // default to 'author' in 'package.json' or undefined
  language: '${cliFlags.language || 'la'}', // default to 'en'
  size: '${cliFlags.size || 'A4'}',
  theme: '${cliFlags.theme || ''}', // .css or local dir or npm package. default to undefined
  entry: [ // **required field**
    // 'introduction.md', // 'title' is automatically guessed from the file (frontmatter > first heading)
    // {
    //   path: 'epigraph.md',
    //   title: 'おわりに', // title can be overwritten (entry > file),
    //   theme: '@vivliostyle/theme-whatever' // theme can be set indivisually. default to root 'theme'
    // },
    // 'glossary.html' // html is also acceptable
  ], // 'entry' can be 'string' or 'object' if there's only single markdown file
  // entryContext: './manuscripts', // default to '.' (relative to 'vivliostyle.config.js')
  // outFile: './output.pdf', // path to generated pdf file. cannot be used with outDir.
  // outDir: './output', // path to the directory where the generated pdf is located. filename is picked from 'title'. cannot be used with outFile.
  // toc: true, // whether generate and include toc.html or not (does not affect manifest.json), default to 'false'. if 'string' given, use it as a custom toc.html.
  // format: 'pdf', // reserved for future usage. default to 'pdf'.
  // distDir: './build', // default to '.vivliostyle',
};
`;

  fs.writeFileSync(vivliostyleConfigPath, vivliostyleConfig);
  log(`Successfully created ${chalk.cyan('vivliostyle.config.js')}`);
}
