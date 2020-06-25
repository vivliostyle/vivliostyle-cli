// cli-preview will be called when we uses `preview` subcommand

import path from 'path';
import program from 'commander';
import chalk from 'chalk';
import puppeteer from 'puppeteer';

import { getBrokerUrl, launchSourceAndBrokerServer, LoadMode } from '../server';
import { findEntryPointFile, statFile, debug, launchBrowser } from '../util';

export interface PreviewOption {
  input: string;
  rootDir?: string;
  sandbox?: boolean;
  executableChromium?: string;
}

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

export default async function preview({
  input,
  rootDir,
  sandbox = true,
  executableChromium,
}: PreviewOption) {
  const stat = await statFile(input);
  const root =
    (rootDir && path.resolve(process.cwd(), rootDir)) ||
    (stat.isDirectory() ? input : path.dirname(input));
  const sourceIndex = await findEntryPointFile(input, root);

  // TODO: watch files and run compilation process
  // TODO: after compilation open browser pointing at .vivliostyle/manifest.json

  try {
    const [source, broker] = await launchSourceAndBrokerServer(root);

    const sourcePort = source.port;
    const brokerPort = broker.port;
    const url = getBrokerUrl({
      sourcePort,
      sourceIndex,
      brokerPort,
      loadMode: 'book',
    });

    console.log(`Opening preview page... ${url}`);
    debug(
      `Executing Chromium path: ${
        executableChromium || puppeteer.executablePath()
      }`,
    );
    const browser = await launchBrowser({
      headless: false,
      executablePath: executableChromium || puppeteer.executablePath(),
      args: [sandbox ? '' : '--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 0, height: 0 });
    await page.goto(url);
  } catch (err) {
    console.trace(err);
    process.exit(1);
  }
}
