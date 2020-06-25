import path from 'path';
import fs from 'fs';
import program from 'commander';

import { gracefulError, log } from '../util';
import chalk from 'chalk';

export interface PreviewOption {}

program
  .name('vivliostyle init')
  .description('create vivliostyle config file')
  .parse(process.argv);

preview({}).catch(gracefulError);

export default async function preview(cliFlags: PreviewOption) {
  log(`Generated ${chalk.cyan('vivliostyle.config.js')}`);
  const vivliostyleConfigPath = path.join(
    process.cwd(),
    'vivliostyle.config.js',
  );
  const vivliostyleConfig = `module.exports = {
  title: 'Ginga Book', // populated into \`manifest.json\`, default to \`title\` of the first entry or \`name\` in \`package.json\`.
  author: 'uetchy', // default to \`author\` in \`package.json\` or undefined
  language: 'ja', // default to \`en\`,
  size: 'A4',
  theme: '@vivliostyle/theme-bunko', // .css or local dir or npm package. default to undefined
  entryContext: './manuscripts', // default to '.' (relative to \`vivliostyle.config.js\`)
  entry: [ // required
    'introduction.md', // \`title\` is automatically guessed from the file (frontmatter > first heading)
    {
      path: 'epigraph.md',
      title: 'おわりに', // title can be overwritten (entry > file),
      theme: '@vivliostyle/theme-whatever' // theme can be set indivisually. default to root \`theme\`
    },
    'glossary.html' // html is also acceptable
  ], // \`entry\` can be \`string\` or \`object\` if there's only single markdown file
  toc: true, // whether generate and include toc.html or not (does not affect manifest.json), default to \`false\`. if \`string\` given, use it as a custom toc.html.
};
`;
  fs.writeFileSync(vivliostyleConfigPath, vivliostyleConfig);
}
