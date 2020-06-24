import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import puppeteer from 'puppeteer';
import resolvePkg from 'resolve-pkg';
import shelljs from 'shelljs';
import process from 'process';
import vfile, { VFile } from 'vfile';
import { VFM, StringifyMarkdownOptions } from '@vivliostyle/vfm';

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

export interface Entry {
  path: string;
  title?: string;
  theme?: string;
}

interface ParsedTheme {
  type: 'path' | 'uri';
  name: string;
  location: string;
}

export interface ParsedEntry {
  type: 'markdown' | 'html';
  title?: string;
  theme?: ParsedTheme;
  source: { path: string; dir: string };
  target: { path: string; dir: string };
}

export interface VivliostyleConfig {
  title?: string;
  author?: string;
  language?: string;
  theme: string; // undefined
  outDir?: string; // .vivliostyle
  outFile?: string; // output.pdf
  entry: string | string[] | Entry | Entry[];
  entryContext?: string;
  size?: string;
  pressReady?: boolean;
  timeout?: number;
}

export interface BuildCliFlags {
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

export interface ManifestOption {
  title?: string;
  author?: string;
  language?: string;
  modified: string;
  entries: Entry[];
}

interface File extends VFile {
  data: {
    title?: string;
    theme?: string;
  };
}
export default async function build(cliFlags: BuildCliFlags) {
  const cwd = process.cwd();
  const configPath = cliFlags.configPath
    ? path.resolve(cwd, cliFlags.configPath)
    : path.join(cwd, 'vivliostyle.config.js');
  const config = collectVivliostyleConfig(configPath);

  const configBaseDir = config ? path.dirname(configPath) : cwd;
  const distDir = path.resolve(
    ctx(configBaseDir, config?.outDir) || '.vivliostyle',
  );
  const outFile = path.resolve(
    cliFlags.outFile || ctx(configBaseDir, config?.outFile) || './output.pdf',
  );
  const size = cliFlags.size || config?.size;
  const artifactDirName = 'dist';
  const artifactDir = path.join(distDir, artifactDirName);
  const contextDir = path.resolve(
    cliFlags.rootDir || ctx(configBaseDir, config?.entryContext) || '.',
  );
  const themes: ParsedTheme[] = [];
  const theme = cliFlags.theme || config?.theme;
  const rootTheme = theme && parseTheme(theme);
  if (rootTheme) {
    themes.push(rootTheme);
  }

  const pressReady = cliFlags.pressReady || config?.pressReady || false;
  const verbose = cliFlags.verbose || false;
  const timeout = cliFlags.timeout || config?.timeout || 3000;
  const sandbox = cliFlags.sandbox || true;
  const loadMode = cliFlags.loadMode || 'book';
  const executableChromium = cliFlags.executableChromium;

  // parse entry items
  const entries: ParsedEntry[] = (cliFlags.input
    ? [cliFlags.input]
    : config
    ? Array.isArray(config.entry)
      ? config.entry
      : config.entry
      ? [config.entry]
      : []
    : []
  )
    .map(
      (e: string | Entry): Entry => {
        if (typeof e === 'object') {
          return e;
        }
        return { path: e };
      },
    )
    .map(
      (entry: Entry): ParsedEntry => {
        const sourcePath = path.resolve(contextDir, entry.path); // abs
        const sourceDir = path.dirname(sourcePath); // abs
        const contextEntryPath = path.relative(contextDir, sourcePath); // rel
        const targetPath = path
          .resolve(artifactDir, contextEntryPath)
          .replace(/\.md$/, '.html');
        const targetDir = path.dirname(targetPath);
        const type = sourcePath.endsWith('.html') ? 'html' : 'markdown';

        let title: string | undefined;
        let theme: ParsedTheme | undefined;

        if (type === 'markdown') {
          const file = processMarkdown(sourcePath);
          title = file.data.title;
          theme = parseTheme(file.data.theme);
        }

        const parsedTheme = parseTheme(entry.theme) || theme || themes[0];

        if (parsedTheme && themes.every((t) => t.name !== parsedTheme.name)) {
          themes.push(parsedTheme);
        }

        return {
          type,
          source: { path: sourcePath, dir: sourceDir },
          target: { path: targetPath, dir: targetDir },
          title: entry.title || title || config?.title,
          theme: parsedTheme,
        };
      },
    );

  if (entries.length === 0) {
    throw new Error('no entry found');
  }

  // setup
  shelljs.rm('-rf', distDir);
  shelljs.mkdir('-p', artifactDir);

  // populate entries
  for (const entry of entries) {
    if (entry.type === 'html') {
      // copy html files
      shelljs.cp(entry.source.path, entry.target.path);
    } else {
      // compile markdown
      const stylesheet = entry.theme
        ? entry.theme.type === 'path'
          ? path.relative(
              entry.target.dir,
              path.join(distDir, entry.theme.name),
            )
          : entry.theme.location
        : undefined;
      const file = processMarkdown(entry.source.path, { stylesheet });
      shelljs.mkdir('-p', entry.target.dir);
      fs.writeFileSync(entry.target.path, String(file));
    }
  }

  // copy theme
  for (const theme of themes) {
    if (theme.type === 'path') {
      shelljs.cp(theme.location, path.join(distDir, theme.name));
    }
  }

  // generate manifest
  const manifestPath = path.join(distDir, 'manifest.json');
  generateManifest(manifestPath, {
    title: cliFlags.title || config?.title,
    author: cliFlags.author || config?.author,
    language: config?.language || 'en',
    entries: entries.map((entry) => ({
      title: entry.title,
      path: path.relative(distDir, entry.target.path),
    })),
    modified: new Date().toISOString(),
  });

  // TODO: generate toc

  // generate PDF
  const outputFile = await generatePDF(
    manifestPath,
    distDir,
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

function ctx(context: string, loc: string | undefined): string | undefined {
  return loc && path.resolve(context, loc);
}

function collectVivliostyleConfig(
  configPath: string,
): VivliostyleConfig | undefined {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  return require(configPath) as VivliostyleConfig;
}

function parseTheme(themeString: unknown): ParsedTheme | undefined {
  if (typeof themeString !== 'string') {
    return undefined;
  }

  // handle url
  if (/^https?:\/\/.+\.css$/.test(themeString)) {
    return {
      type: 'uri',
      name: path.basename(themeString),
      location: themeString,
    };
  }

  const pkgRoot = resolvePkg(themeString, { cwd: process.cwd() });
  if (!pkgRoot) {
    throw new Error('package not found: ' + themeString);
  }

  // return bare .css path
  if (pkgRoot.endsWith('.css')) {
    return { type: 'path', name: path.basename(pkgRoot), location: pkgRoot };
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

  return {
    type: 'path',
    name: `${packageJson.name.replace(/\//g, '-')}.css`,
    location: path.resolve(pkgRoot, maybeCSS),
  };
}

function processMarkdown(
  filepath: string,
  options: StringifyMarkdownOptions = {},
): File {
  const vfm = VFM(options);
  const processed = vfm.processSync(
    vfile({ path: filepath, contents: fs.readFileSync(filepath, 'utf8') }),
  ) as File;
  return processed;
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
    resources: [],
  };

  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
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
