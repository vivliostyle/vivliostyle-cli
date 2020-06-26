import chokidar from 'chokidar';
import program from 'commander';
import path from 'path';
import puppeteer from 'puppeteer';
import { buildArtifacts } from '../builder';
import {
  CliFlags,
  collectVivliostyleConfig,
  getVivliostyleConfigPath,
  mergeConfig,
  validateTimeout,
} from '../config';
import { getBrokerUrl, launchSourceAndBrokerServer } from '../server';
import {
  debug,
  gracefulError,
  launchBrowser,
  logSuccess,
  startLogging,
  stopLogging,
} from '../util';

export interface PreviewCliFlags extends CliFlags {}

program
  .name('vivliostyle preview')
  .description('launch preview server')
  .arguments('<input>')
  .arguments('<input>')
  .option('-c, --config <config_file>', 'path to vivliostyle.config.js')
  .option(
    '-o, --out-file <output file>',
    `specify output file path (default ./output.pdf)`,
  )
  .option('-d, --out-dir <output directory>', `specify output directory`)
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
  .option(
    '--entry-context <context directory>',
    `specify assets root path (default directory of input file)`,
  )
  .option('--verbose', 'verbose log output')
  .option(
    '--timeout <seconds>',
    `timeout limit for waiting Vivliostyle process (default: 60s)`,
    validateTimeout,
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

let timer: NodeJS.Timeout;

preview({
  configPath: program.config,
  input: program.args?.[0] || program.input,
  title: program.title,
  author: program.author,
  theme: program.theme,
  size: program.size,
  outDir: program.outDir,
  outFile: program.outFile,
  language: program.language,
  entryContext: program.entryContext,
  verbose: program.verbose,
  timeout: program.timeout,
  sandbox: program.sandbox,
  executableChromium: program.executableChromium,
}).catch(gracefulError);

export default async function preview(cliFlags: PreviewCliFlags) {
  startLogging('Preparing preview');

  const vivliostyleConfigPath = getVivliostyleConfigPath(cliFlags.configPath);
  const vivliostyleConfig = collectVivliostyleConfig(vivliostyleConfigPath);

  const context = vivliostyleConfig
    ? path.dirname(vivliostyleConfigPath)
    : process.cwd();

  const config = await mergeConfig(cliFlags, vivliostyleConfig, context);

  // build artifacts
  const { manifestPath } = buildArtifacts(config);

  const [source, broker] = await launchSourceAndBrokerServer(config.distDir);

  const url = getBrokerUrl({
    sourceIndex: path.relative(config.distDir, manifestPath),
    sourcePort: source.port,
    brokerPort: broker.port,
    loadMode: config.loadMode,
  });

  debug(url);
  debug(
    `Executing Chromium path: ${
      config.executableChromium || puppeteer.executablePath()
    }`,
  );
  const browser = await launchBrowser({
    headless: false,
    executablePath: config.executableChromium || puppeteer.executablePath(),
    args: [config.sandbox ? '' : '--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 0, height: 0 });
  await page.goto(url);

  stopLogging('Up and running ([ctrl+c] to quit)', '🚀');

  function handleChangeEvent(path: string) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      startLogging(`Rebuilding ${path}`);
      // build artifacts
      buildArtifacts(config);
      page.reload();
      logSuccess(`Built ${path}`);
    }, 2000);
  }

  chokidar
    .watch('**', {
      ignored: (p: string) => {
        return /node_modules|\.git/.test(p) || p.startsWith(config.distDir);
      },
      cwd: context,
    })
    .on('all', (event, path) => {
      if (!/\.(md|markdown|html?|css|jpe?g|png|gif|svg)$/i.test(path)) return;
      handleChangeEvent(path);
    });
}
