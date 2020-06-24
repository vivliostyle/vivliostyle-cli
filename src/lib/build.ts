import fs from 'fs';
import path, { resolve } from 'path';
import chalk from 'chalk';
import puppeteer from 'puppeteer';
import resolvePkg from 'resolve-pkg';
import shelljs from 'shelljs';
import { stringify } from '@vivliostyle/vfm';

import { Meta, Payload, TOCItem } from './broker';
import { PostProcess } from './postprocess';
import {
  getBrokerUrl,
  launchSourceAndBrokerServer,
  LoadMode,
  PageSize,
} from './server';
import {
  log,
  statFile,
  findEntryPointFile,
  debug,
  launchBrowser,
} from './util';

export interface BuildOption {
  configPath: string;
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

export interface VivliostyleConfig {
  title?: string;
  author?: string;
  language?: string;
  theme: string; // undefined
  outDir?: string; // .vivliostyle
  outFile?: string; // output.pdf
  entry: string | string[];
  entryContext?: string;
  size?: string;
  pressReady?: boolean;
  verbose?: boolean;
  timeout?: number;
  loadMode?: string;
  sandbox?: boolean;
  executableChromium?: string;
}

export interface ThemeConfig {
  title: string;
  style: string;
}

interface EntryItem {
  title: string;
  entry: string;
  entryPath: string;
  entryDir: string;
  contextEntryPath: string;
  targetPath: string;
  targetDir: string;
  relativeTargetPath: string;
}

interface ManifestOption {
  title?: string;
  author?: string;
  language?: string;
  modified: string;
  stylePath: string;
  entries: { title: string; path: string }[];
}

function collectVivliostyleConfig(
  resolvedConfigPath: string,
): { config: VivliostyleConfig; resolvedConfigPath: string } | undefined {
  if (!fs.existsSync(resolvedConfigPath)) {
    return undefined;
  }
  const config = require(resolvedConfigPath) as VivliostyleConfig;
  return { config, resolvedConfigPath };
}

function resolveThemePath(themeString: string): string {
  const pkgRoot = resolvePkg(themeString, { cwd: process.cwd() });
  if (!pkgRoot) {
    throw new Error('package not found: ' + themeString);
  }

  // return bare .css path
  if (pkgRoot.endsWith('.css')) {
    return pkgRoot;
  }

  // node_modules & local path
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'),
  );

  const maybeCSS =
    packageJson?.vivliostyle?.theme?.style ||
    packageJson?.vivliostyle?.theme?.stylesheet ||
    packageJson.style ||
    packageJson.main;

  if (!maybeCSS || !maybeCSS.endsWith('.css')) {
    throw new Error('invalid css file: ' + maybeCSS);
  }

  return path.resolve(pkgRoot, maybeCSS);
}

function generateManifest(outputPath: string, options: ManifestOption) {
  const manifest = {
    '@context': 'https://readium.org/webpub-manifest/context.jsonld',
    metadata: {
      '@type': 'http://schema.org/Book',
      title: options.title,
      author: options.author,
      // identifier: 'urn:isbn:9780000000001', // UUID?
      language: options.language,
      modified: options.modified,
    },
    links: [],
    readingOrder: options.entries.map((entry) => ({
      href: entry.path,
      type: 'text/html',
      title: entry.title,
    })),
    resources: [
      { href: options.stylePath, type: 'text/css' }, // `theme` in `vivliostyle.config.js`
    ],
  };

  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
}

export default async function build(cliFlags: BuildOption) {
  const configPath = cliFlags.configPath
    ? path.join(process.cwd(), cliFlags.configPath)
    : path.join(process.cwd(), 'vivliostyle.config.js');
  const { config, resolvedConfigPath } =
    collectVivliostyleConfig(configPath) || {};

  const outDir = cliFlags.rootDir || config?.outDir || '.vivliostyle';
  const outFile = cliFlags.outFile || config?.outFile || 'output.pdf';
  const size = cliFlags.size || config?.size;
  const loadMode = cliFlags.loadMode || config?.loadMode || 'book';
  const executableChromium =
    cliFlags.executableChromium || config?.executableChromium;
  const sandbox = cliFlags.sandbox || config?.sandbox || true;
  const verbose = cliFlags.verbose || config?.verbose || false;
  const timeout = cliFlags.timeout || config?.timeout || 3000;
  const pressReady = cliFlags.pressReady || config?.pressReady || false;
  const workDir = resolvedConfigPath
    ? path.dirname(resolvedConfigPath)
    : process.cwd();
  const rootPath = path.resolve(outDir);
  const distName = 'dist';
  const distPath = path.join(rootPath, distName);
  const context = config?.entryContext || '.';
  const contextPath = path.join(workDir, context);
  const absoluteStylePath =
    cliFlags.theme ||
    (config?.theme ? resolveThemePath(config.theme) : undefined);
  const distStyleName = 'style.css';
  const distStylePath = path.join(rootPath, distStyleName);

  // parse entry items
  const entries: EntryItem[] = (cliFlags.input
    ? [cliFlags.input]
    : config
    ? Array.isArray(config.entry)
      ? config.entry
      : config.entry
      ? [config.entry]
      : []
    : []
  ).map(
    (entry: string): EntryItem => {
      const entryDir = path.dirname(entry);
      const entryPath = path.resolve(contextPath, entry);
      const contextEntryPath = path.relative(contextPath, entryPath);
      const targetPath = path
        .resolve(distPath, contextEntryPath)
        .replace(/\.md$/, '.html');
      const targetDir = path.dirname(targetPath);
      const relativeTargetPath = path.relative(rootPath, targetPath);

      return {
        entry,
        entryPath,
        entryDir,
        contextEntryPath,
        targetPath,
        targetDir,
        relativeTargetPath,
        // TODO: collect title and theme attributes
        title: entry,
      };
    },
  );

  if (entries.length === 0) {
    throw new Error('no entry found');
  }

  // cleanup
  shelljs.rm('-rf', rootPath);

  // compilation
  shelljs.mkdir('-p', distPath);

  for (const entryItem of entries) {
    const { entryDir, entryPath, targetPath, targetDir } = entryItem;

    shelljs.mkdir('-p', targetDir);

    // copy html files
    if (entryItem.entryPath.endsWith('.html')) {
      shelljs.cp(entryPath, targetPath);
      continue;
    }

    // compile markdown
    const relativeStylePath = path.join('..', distStyleName);
    const stylesheet = path.relative(entryDir, relativeStylePath);

    const html = stringify(fs.readFileSync(entryPath, 'utf8'), {
      stylesheet,
    });
    fs.writeFileSync(targetPath, html);
  }

  // copy theme
  absoluteStylePath && shelljs.cp(absoluteStylePath, distStylePath);

  // generate manifest
  const manifestPath = path.join(rootPath, 'manifest.json');
  generateManifest(manifestPath, {
    // TODO: guess title from HTML, package.json
    title: cliFlags.title || config?.title,
    author: cliFlags.author || config?.author,
    language: config?.language || 'en',
    entries: entries.map((entry) => ({
      title: entry.title,
      path: entry.relativeTargetPath,
    })),
    modified: new Date().toString(),
    stylePath: distStylePath,
  });

  // generate PDF
  const outputFile = await generatePDF(
    manifestPath,
    rootPath,
    outFile,
    size,
    loadMode,
    executableChromium,
    sandbox,
    verbose,
    timeout,
    pressReady,
  );

  log(`🎉  Done`);
  log(`${chalk.bold(outputFile)} has been created`);

  // TODO: gracefully exit broker & source server
  process.exit(0);
}

async function generatePDF(
  input: string,
  rootDir: string | undefined,
  outputPath: string,
  size: string | number | undefined,
  loadMode: LoadMode,
  executableChromium: string | undefined,
  sandbox: boolean,
  verbose: boolean,
  timeout: number,
  pressReady: boolean,
) {
  const stat = await statFile(input);
  const root = rootDir || (stat.isDirectory() ? input : path.dirname(input));
  const sourceIndex = await findEntryPointFile(input, root);

  const outputFile =
    fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()
      ? path.resolve(outputPath, 'output.pdf')
      : outputPath;
  const outputSize = size ? parsePageSize(size) : undefined;

  const [source, broker] = await launchSourceAndBrokerServer(root);
  const sourcePort = source.port;
  const brokerPort = broker.port;
  const navigateURL = getBrokerUrl({
    sourcePort,
    sourceIndex,
    brokerPort,
    loadMode,
    outputSize,
  });
  debug('brokerURL', navigateURL);

  log(`Launching build environment...`);
  debug(
    `Executing Chromium path: ${
      executableChromium || puppeteer.executablePath()
    }`,
  );
  const browser = await launchBrowser({
    headless: true,
    executablePath: executableChromium || puppeteer.executablePath(),
    // Why `--no-sandbox` flag? Running Chrome as root without --no-sandbox is not supported. See https://crbug.com/638180.
    args: [sandbox ? '' : '--no-sandbox'],
  });
  const version = await browser.version();
  debug(chalk.green('success'), `version=${version}`);

  const page = await browser.newPage();

  page.on('pageerror', (error) => {
    log(chalk.red(error.message));
  });

  page.on('console', (msg) => {
    if (/time slice/.test(msg.text())) return;
    if (!verbose) return;
    log(chalk.gray(msg.text()));
  });

  page.on('response', (response) => {
    debug(
      chalk.gray('broker:response'),
      chalk.green(response.status().toString()),
      response.url(),
    );
    if (300 > response.status() && 200 <= response.status()) return;
    log(chalk.red(`${response.status()}`, response.url()));
  });

  log('Building pages...');

  await page.goto(navigateURL, { waitUntil: 'networkidle0' });
  await page.waitFor(() => !!window.coreViewer);

  const metadata = await loadMetadata(page);
  const toc = await loadTOC(page);

  await page.emulateMediaType('print');
  await page.waitForFunction(
    () => window.coreViewer.readyState === 'complete',
    {
      polling: 1000,
      timeout,
    },
  );

  log('Generating PDF...');

  const pdf = await page.pdf({
    margin: {
      top: 0,
      bottom: 0,
      right: 0,
      left: 0,
    },
    printBackground: true,
    preferCSSPageSize: true,
  });

  log('Processing PDF...');

  await browser.close();

  const post = await PostProcess.load(pdf);
  await post.metadata(metadata);
  await post.toc(toc);
  await post.save(outputFile, { pressReady });
  return outputFile;
}

function parsePageSize(size: string | number): PageSize {
  const [width, height, ...others] = size ? `${size}`.split(',') : [];
  if (others.length) {
    throw new Error(`Cannot parse size: ${size}`);
  } else if (width && height) {
    return {
      width,
      height,
    };
  } else {
    return {
      format: width || 'Letter',
    };
  }
}

async function loadMetadata(page: puppeteer.Page): Promise<Meta> {
  return page.evaluate(() => window.coreViewer.getMetadata());
}

// Show and hide the TOC in order to read its contents.
// Chromium needs to see the TOC links in the DOM to add
// the PDF destinations used during postprocessing.
async function loadTOC(page: puppeteer.Page): Promise<TOCItem[]> {
  return page.evaluate(
    () =>
      new Promise<TOCItem[]>((resolve) => {
        function listener(payload: Payload) {
          if (payload.a !== 'toc') {
            return;
          }
          window.coreViewer.removeListener('done', listener);
          window.coreViewer.showTOC(false);
          resolve(window.coreViewer.getTOC());
        }
        window.coreViewer.addListener('done', listener);
        window.coreViewer.showTOC(true);
      }),
  );
}
