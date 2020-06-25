import program from 'commander';
import chalk from 'chalk';
import path from 'path';
import process from 'process';

import { LoadMode } from '../server';
import { log, gracefulError } from '../util';
import {
  mergeConfig,
  getVivliostyleConfigPath,
  collectVivliostyleConfig,
  Entry,
  ParsedTheme,
} from '../config';
import { buildArtifacts } from '../builder';
import { buildPDF } from '../pdf';

export interface BuildCliFlags {
  configPath?: string;
  input: string;
  outFile: string;
  rootDir?: string;
  theme?: string;
  size?: number | string;
  title?: string;
  language?: string;
  author?: string;
  pressReady: boolean;
  verbose?: boolean;
  timeout: number;
  loadMode: LoadMode;
  sandbox: boolean;
  executableChromium?: string;
}

const runningVivliostyleTimeout = 60 * 1000;

program
  .name('vivliostyle build')
  .description('build and create PDF file')
  .arguments('<input>')
  .option('-c, --config <config_file>', 'path to vivliostyle.config.js')
  .option(
    '-o, --output <output_file>',
    `specify output file path (default output.pdf)`,
  )
  .option(
    '-r, --root <root_directory>',
    `specify assets root path (default directory of input file)`,
  )
  .option('-t, --theme <theme>', 'theme path or package name')
  .option(
    '-s, --size <size>',
    `output pdf size (ex: 'A4' 'JIS-B5' '182mm,257mm' '8.5in,11in')`,
  )
  .option('--title <title>', 'title')
  .option('--author <author>', 'author')
  .option('--language <language>', 'language')
  .option(
    '--press-ready',
    `make generated PDF compatible with press ready PDF/X-1a`,
  )
  .option('--verbose', 'verbose log output')
  .option(
    '--timeout <seconds>',
    `timeout limit for waiting Vivliostyle process (default: 60s)`,
    (val) =>
      Number.isFinite(+val) && +val > 0
        ? +val * 1000
        : runningVivliostyleTimeout,
  )
  .option(
    '--force-document-mode',
    `force document mode. Further reading: http://vivliostyle.github.io/vivliostyle.js/docs/en/`,
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

build({
  configPath: program.config,
  rootDir: program.root,
  input: program.args?.[0] || program.input,
  outFile: program.output,
  theme: program.theme,
  size: program.size,
  title: program.title,
  author: program.author,
  language: program.language,
  pressReady: program.pressReady,
  verbose: program.verbose,
  timeout: program.timeout,
  loadMode: program.forceDocumentMode ? 'document' : 'book',
  sandbox: program.sandbox,
  executableChromium: program.executableChromium,
}).catch(gracefulError);

export default async function build(cliFlags: BuildCliFlags) {
  const vivliostyleConfigPath = getVivliostyleConfigPath(cliFlags.configPath);
  const vivliostyleConfig = collectVivliostyleConfig(vivliostyleConfigPath);

  const context = vivliostyleConfig
    ? path.dirname(vivliostyleConfigPath)
    : process.cwd();

  const {
    contextDir,
    artifactDir,
    projectTitle,
    themeIndex,
    rawEntries,
    distDir,
    projectAuthor,
    language,
    toc,
    outFile,
    size,
    pressReady,
    verbose,
    timeout,
    loadMode,
    sandbox,
    executableChromium,
  }: {
    contextDir: string;
    artifactDir: string;
    projectTitle: any;
    themeIndex: ParsedTheme[];
    rawEntries: (string | Entry)[];
    distDir: string;
    projectAuthor: any;
    language: string;
    toc: string | boolean;
    outFile: string;
    size: string | number | undefined;
    pressReady: boolean;
    verbose: boolean;
    timeout: number;
    loadMode: LoadMode;
    sandbox: boolean;
    executableChromium: string | undefined;
  } = await mergeConfig(cliFlags, vivliostyleConfig, context);

  // build artifacts
  const manifestPath = buildArtifacts({
    contextDir,
    distDir,
    artifactDir,
    rawEntries,
    toc,
    themeIndex,
    projectTitle,
    projectAuthor,
    language,
  });

  // generate PDF
  const outputFile = await buildPDF({
    input: manifestPath,
    outputPath: outFile,
    rootDir: distDir,
    size,
    pressReady,
    verbose,
    timeout,
    loadMode,
    sandbox,
    executableChromium,
  });

  log(`🎉  Done`);
  log(`${chalk.bold(outputFile)} has been created`);

  // TODO: gracefully exit broker & source server
  process.exit(0);
}
