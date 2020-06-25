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

interface Theme {
  type: 'path' | 'uri';
  name: string;
  location: string;
}

export interface ThemeConfig {
  title: string;
  style: string;
}

export interface Entry {
  path: string;
  title?: string;
  theme?: string;
}

export interface ParsedEntry {
  type: 'markdown' | 'html';
  title?: string;
  theme?: Theme;
  source: { path: string; dir: string };
  target: { path: string; dir: string };
}

export interface VivliostyleConfig {
  title?: string;
  author?: string;
  language?: string;
  theme?: string;
  outDir?: string; // .vivliostyle
  outFile?: string; // output.pdf
  entry: string | Entry | (string | Entry)[];
  entryContext?: string;
  size?: string;
  pressReady?: boolean;
  timeout?: number;
}

export interface BuildCliFlags {
  configPath?: string;
  input: string;
  outFile?: string;
  rootDir?: string;
  theme?: string;
  size?: number | string;
  title?: string;
  language?: string;
  author?: string;
  pressReady?: boolean;
  verbose?: boolean;
  timeout?: number;
  loadMode: LoadMode;
  sandbox: boolean;
  executableChromium?: string;
}

export interface ManifestOption {
  title?: string;
  author?: string;
  language?: string;
  modified: string;
  entries: ParsedEntry[];
  outDir: string;
}

export interface VivliostyleFullConfig extends ManifestOption {
  themes: Theme[];
  artifactDir: string;
  outputPath: string;
  size: number | string | undefined;
  pressReady: boolean;
  verbose: boolean;
  timeout: number;
  sandbox: boolean;
  loadMode: LoadMode;
  executableChromium: string | undefined;
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
  const vivliostyleConfig = collectVivliostyleConfig(configPath);

  const configBaseDir = vivliostyleConfig ? path.dirname(configPath) : cwd;
  const config = setupConfig(vivliostyleConfig, cliFlags, configBaseDir);

  if (config.entries.length === 0) {
    throw new Error('no entry found');
  }

  // setup
  shelljs.rm('-rf', config.outDir);
  shelljs.mkdir('-p', config.artifactDir);

  // populate entries
  for (const entry of config.entries) {
    if (entry.type === 'html') {
      // copy html files
      shelljs.cp(entry.source.path, entry.target.path);
    } else {
      // compile markdown
      const stylesheet = entry.theme
        ? entry.theme.type === 'path'
          ? path.relative(
              entry.target.dir,
              path.join(config.outDir, entry.theme.name),
            )
          : entry.theme.location
        : undefined;
      const file = processMarkdown(entry.source.path, { stylesheet });
      shelljs.mkdir('-p', entry.target.dir);
      fs.writeFileSync(entry.target.path, String(file));
    }
  }

  // copy theme
  for (const theme of config.themes) {
    if (theme.type === 'path') {
      shelljs.cp(theme.location, path.join(config.outDir, theme.name));
    }
  }

  // generate manifest
  const manifestPath = path.join(config.outDir, 'manifest.json');
  const manifest = generateManifest(config);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // generate PDF
  const outputFile = await generatePDF({
    ...config,
    input: manifestPath,
  });

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

function parseTheme(themeString: unknown): Theme | undefined {
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

export function setupConfig(
  config: VivliostyleConfig | undefined,
  cliFlags: BuildCliFlags,
  baseDir: string,
): VivliostyleFullConfig {
  const outDir = path.resolve(ctx(baseDir, config?.outDir) || '.vivliostyle');
  const outputPath = path.resolve(
    cliFlags.outFile || ctx(baseDir, config?.outFile) || './output.pdf',
  );
  const size = cliFlags.size || config?.size;
  const artifactDirName = 'dist';
  const artifactDir = path.join(outDir, artifactDirName);
  const contextDir = path.resolve(
    cliFlags.rootDir || ctx(baseDir, config?.entryContext) || '.',
  );
  const themes: Theme[] = [];
  const theme = cliFlags.theme || config?.theme;
  const rootTheme = theme && parseTheme(theme);
  if (rootTheme) {
    themes.push(rootTheme);
  }

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
        // TODO: collect title and theme attributes
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
        let theme: Theme | undefined;

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

  return {
    title: cliFlags.title || config?.title,
    author: cliFlags.author || config?.author,
    language: config?.language || 'en',
    entries,
    modified: new Date().toISOString(),
    themes,
    outDir,
    artifactDir,
    outputPath,
    size,
    pressReady: cliFlags.pressReady || config?.pressReady || false,
    verbose: cliFlags.verbose || false,
    timeout: cliFlags.timeout || config?.timeout || 3000,
    sandbox: cliFlags.sandbox || true,
    loadMode: cliFlags.loadMode || 'book',
    executableChromium: cliFlags.executableChromium,
  };
}

export function generateManifest(config: ManifestOption): object {
  const manifest = {
    '@context': 'https://readium.org/webpub-manifest/context.jsonld',
    metadata: {
      '@type': 'http://schema.org/Book',
      title: config.title,
      author: config.author,
      // identifier: 'urn:isbn:9780000000001', // UUID?
      language: config.language,
      modified: config.modified,
    },
    links: [],
    readingOrder: config.entries.map((entry) => ({
      href: path.relative(config.outDir, entry.target.path),
      type: 'text/html',
      title: entry.title,
    })),
    resources: [],
  };

  return manifest;
}

async function generatePDF({
  input,
  outDir,
  outputPath,
  size,
  loadMode,
  executableChromium,
  sandbox,
  verbose,
  timeout,
  pressReady,
}: {
  input: string;
  outDir: string | undefined;
  outputPath: string;
  size: string | number | undefined;
  loadMode: LoadMode;
  executableChromium: string | undefined;
  sandbox: boolean;
  verbose: boolean;
  timeout: number;
  pressReady: boolean;
}) {
  const stat = await statFile(input);
  const root = outDir || (stat.isDirectory() ? input : path.dirname(input));
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
