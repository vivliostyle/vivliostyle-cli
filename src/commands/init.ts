import chalk from 'chalk';
import fs from 'fs';
import path from 'upath';
import { gracefulError, log } from '../util';
import { InitCliFlags, setupInitParserProgram } from './init.parser';

try {
  const program = setupInitParserProgram();
  program.parse(process.argv);
  init({
    title: program.title,
    author: program.author,
    language: program.language,
    size: program.size,
    theme: program.theme,
  }).catch(gracefulError);
} catch (err) {
  gracefulError(err);
}

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
  ${cliFlags.language ? '' : '// '}language: '${cliFlags.language || 'la'}', // default to 'en'
  ${cliFlags.size ? '' : '// '}size: '${cliFlags.size || 'A4'}',
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
  // outputs: [ // path to generate draft file(s). default to '{title}.pdf'
  //   './output.pdf', // the output format will be inferred from the name.
  //   {
  //     path: './book',
  //     format: 'webbook',
  //   },
  // ],
  // toc: true, // whether generate and include toc.html or not (does not affect manifest.json), default to 'false'. if 'string' given, use it as a custom toc.html.
  // cover: './cover.png', // cover image. default to undefined.
};
`;

  fs.writeFileSync(vivliostyleConfigPath, vivliostyleConfig);
  log(`Successfully created ${chalk.cyan('vivliostyle.config.js')}`);
}
