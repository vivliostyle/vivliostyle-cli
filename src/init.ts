import chalk from 'chalk';
import fs from 'node:fs';
import { CONTAINER_IMAGE } from './container.js';
import { cwd, log, runExitHandlers, setLogLevel, upath } from './util.js';

export interface InitCliFlags {
  title?: string;
  author?: string;
  language?: string;
  theme?: string;
  size?: string;
  logLevel?: 'silent' | 'info' | 'debug';
}

export async function init(cliFlags: InitCliFlags) {
  setLogLevel(cliFlags.logLevel);

  const vivliostyleConfigPath = upath.join(cwd, 'vivliostyle.config.js');

  if (fs.existsSync(vivliostyleConfigPath)) {
    return log(
      `${chalk.yellow('vivliostyle.config.js already exists. aborting.')}`,
    );
  }

  // prettier-ignore
  const vivliostyleConfig = `// @ts-check
/** @type {import('@vivliostyle/cli').VivliostyleConfigSchema} */
const vivliostyleConfig = {
  title: '${ cliFlags.title || 'Principia'}', // populated into 'publication.json', default to 'title' of the first entry or 'name' in 'package.json'.
  author: '${cliFlags.author || 'Isaac Newton'}', // default to 'author' in 'package.json' or undefined
  ${cliFlags.language ? '' : '// '}language: '${cliFlags.language || 'la'}',
  // readingProgression: 'rtl', // reading progression direction, 'ltr' or 'rtl'.
  ${cliFlags.size ? '' : '// '}size: '${cliFlags.size || 'A4'}',
  ${cliFlags.theme ? '' : '// '}theme: '${cliFlags.theme || ''}', // .css or local dir or npm package. default to undefined
  image: '${CONTAINER_IMAGE}',
  entry: [ // **required field**
    // 'introduction.md', // 'title' is automatically guessed from the file (frontmatter > first heading)
    // {
    //   path: 'epigraph.md',
    //   title: 'おわりに', // title can be overwritten (entry > file),
    //   theme: '@vivliostyle/theme-whatever' // theme can be set individually. default to root 'theme'
    // },
    // 'glossary.html' // html is also acceptable
  ], // 'entry' can be 'string' or 'object' if there's only single markdown file
  // entryContext: './manuscripts', // default to '.' (relative to 'vivliostyle.config.js')
  // output: [ // path to generate draft file(s). default to '{title}.pdf'
  //   './output.pdf', // the output format will be inferred from the name.
  //   {
  //     path: './book',
  //     format: 'webpub',
  //   },
  // ],
  // workspaceDir: '.vivliostyle', // directory which is saved intermediate files.
  // toc: true, // whether generate and include ToC HTML or not, default to 'false'.
  // cover: './cover.png', // cover image. default to undefined.
  // vfm: { // options of VFM processor
  //   replace: [ // specify replace handlers to modify HTML outputs
  //     {
  //       // This handler replaces {current_time} to a current local time tag.
  //       test: /{current_time}/,
  //       match: (_, h) => {
  //         const currentTime = new Date().toLocaleString();
  //         return h('time', { datetime: currentTime }, currentTime);
  //       },
  //     },
  //   ],
  //   hardLineBreaks: true, // converts line breaks of VFM to <br> tags. default to 'false'.
  //   disableFormatHtml: true, // disables HTML formatting. default to 'false'.
  // },
};

module.exports = vivliostyleConfig;
`;

  fs.writeFileSync(vivliostyleConfigPath, vivliostyleConfig);

  runExitHandlers();
  log(`Successfully created ${chalk.cyan('vivliostyle.config.js')}`);
}
