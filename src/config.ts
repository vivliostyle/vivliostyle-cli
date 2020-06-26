import fs from 'fs';
import { JSDOM } from 'jsdom';
import path from 'path';
import pkgUp from 'pkg-up';
import process from 'process';
import puppeteer from 'puppeteer';
import resolvePkg from 'resolve-pkg';
import { processMarkdown } from './markdown';
import { LoadMode, PageSize } from './server';
import { debug } from './util';

export interface Entry {
  path: string;
  title?: string;
  theme?: string;
}

export interface ParsedTheme {
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
  theme?: string;
  entry: string | Entry | (string | Entry)[];
  entryContext?: string; // .
  size?: string;
  format?: 'pdf';
  pressReady?: boolean;
  outDir?: string;
  outFile?: string; // output.pdf
  language?: string;
  cover?: string;
  toc?: boolean | string;

  timeout?: number;
  distDir?: string; // .vivliostyle
}

export interface CliFlags {
  configPath?: string;
  input?: string;
  size?: number | string;
  outFile?: string;
  outDir?: string;
  theme?: string;
  pressReady?: boolean;
  title?: string;
  author?: string;
  language?: string;
  entryContext?: string;
  verbose?: boolean;

  timeout?: number;
  loadMode?: LoadMode;
  sandbox?: boolean;
  executableChromium?: string;
}

export interface MergedConfig {
  entryContextDir: string;
  artifactDir: string;
  distDir: string;
  outputPath: string;
  entries: ParsedEntry[];
  themeIndex: ParsedTheme[];
  toc: string | boolean;
  size: PageSize | undefined;
  pressReady: boolean;
  projectTitle: string;
  projectAuthor: string;
  language: string;
  verbose: boolean;
  timeout: number;
  loadMode: LoadMode;
  sandbox: boolean;
  executableChromium: string;
}

const runningVivliostyleTimeout = 60 * 1000;
export function validateTimeout(val: string) {
  return Number.isFinite(+val) && +val > 0
    ? +val * 1000
    : runningVivliostyleTimeout;
}

export function contextResolve(
  context: string,
  loc: string | undefined,
): string | undefined {
  return loc && path.resolve(context, loc);
}
function normalizeEnry(e: string | Entry): Entry {
  if (typeof e === 'object') {
    return e;
  }
  return { path: e };
}

export function parseTheme(themeString: unknown): ParsedTheme | undefined {
  if (typeof themeString !== 'string') {
    return themeString === null
      ? { type: 'uri', name: '', location: '' }
      : undefined;
  }

  // handle url
  if (/^https?:\/\//.test(themeString)) {
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

function parseFileMetadata(type: string, sourcePath: string) {
  let title: string | undefined;
  let theme: ParsedTheme | undefined;
  if (type === 'markdown') {
    const file = processMarkdown(sourcePath);
    title = file.data.title;
    theme = parseTheme(file.data.theme);
  } else {
    const {
      window: { document },
    } = new JSDOM(fs.readFileSync(sourcePath));
    title = document.querySelector('title')?.textContent || undefined;
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="stylesheet"]',
    );
    theme = parseTheme(link?.href);
  }
  return { title, theme };
}

export function collectVivliostyleConfig(
  configPath: string,
): VivliostyleConfig | undefined {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  const config = require(configPath) as VivliostyleConfig;
  return config;
}

export function getVivliostyleConfigPath(configPath?: string) {
  const cwd = process.cwd();
  return configPath
    ? path.resolve(cwd, configPath)
    : path.join(cwd, 'vivliostyle.config.js');
}

export async function mergeConfig<T extends CliFlags>(
  cliFlags: T,
  config: VivliostyleConfig | undefined,
  context: string,
): Promise<MergedConfig> {
  const pkgJsonPath = await pkgUp();
  const pkgJson = pkgJsonPath ? require(pkgJsonPath) : undefined;

  // TODO: use dirname of cliFlags.input if it was given

  const projectTitle = cliFlags.title || config?.title || pkgJson?.name;
  if (!projectTitle) {
    throw new Error('title not defined');
  }
  const projectAuthor = cliFlags.author || config?.author || pkgJson?.author;

  const entryContextDir = path.resolve(
    cliFlags.input
      ? '.'
      : cliFlags.entryContext ||
          contextResolve(context, config?.entryContext) ||
          '.',
  );
  const distDir = path.resolve(
    contextResolve(context, config?.distDir) || '.vivliostyle',
  );
  const artifactDir = path.join(distDir, 'artifacts');

  const outDir = cliFlags.outDir || contextResolve(context, config?.outDir);
  const outFile = cliFlags.outFile || contextResolve(context, config?.outFile);

  if (outDir && outFile) {
    throw new Error('outDir and outFile cannot be combined.');
  }
  const outputPath = outDir
    ? path.resolve(outDir, `${projectTitle}.pdf`)
    : outFile || path.resolve('./output.pdf');
  debug('outputPath', outputPath);

  const language = config?.language || 'en';
  const sizeFlag = cliFlags.size || config?.size;
  const size = sizeFlag ? parsePageSize(sizeFlag) : undefined;
  const toc =
    typeof config?.toc === 'string'
      ? contextResolve(context, config?.toc)!
      : config?.toc !== undefined
      ? config.toc
      : true;
  const pressReady = cliFlags.pressReady || config?.pressReady || false;
  const verbose = cliFlags.verbose || false;
  const timeout = cliFlags.timeout || config?.timeout || 3000;
  const sandbox = cliFlags.sandbox || true;
  const loadMode = cliFlags.loadMode || 'book';
  const executableChromium =
    cliFlags.executableChromium || puppeteer.executablePath();

  const themeIndex: ParsedTheme[] = [];
  const projectTheme = cliFlags.theme || config?.theme;
  const rootTheme = projectTheme ? parseTheme(projectTheme) : undefined;
  if (rootTheme) {
    themeIndex.push(rootTheme);
  }

  function parseEntry(entry: Entry): ParsedEntry {
    const sourcePath = path.resolve(entryContextDir, entry.path); // abs
    const sourceDir = path.dirname(sourcePath); // abs
    const contextEntryPath = path.relative(entryContextDir, sourcePath); // rel
    const targetPath = path
      .resolve(artifactDir, contextEntryPath)
      .replace(/\.md$/, '.html');
    const targetDir = path.dirname(targetPath);
    const type = sourcePath.endsWith('.html') ? 'html' : 'markdown';

    const metadata = parseFileMetadata(type, sourcePath);

    const title = entry.title || metadata.title || projectTitle;
    const theme = parseTheme(entry.theme) || metadata.theme || themeIndex[0];

    if (theme && themeIndex.every((t) => t.name !== theme.name)) {
      themeIndex.push(theme);
    }

    return {
      type,
      source: { path: sourcePath, dir: sourceDir },
      target: { path: targetPath, dir: targetDir },
      title,
      theme,
    };
  }

  const rawEntries = cliFlags.input
    ? [cliFlags.input]
    : config
    ? Array.isArray(config.entry)
      ? config.entry
      : config.entry
      ? [config.entry]
      : []
    : [];
  const entries: ParsedEntry[] = rawEntries.map(normalizeEnry).map(parseEntry);

  const parsedConfig = {
    entryContextDir,
    artifactDir,
    distDir,
    outputPath,
    entries,
    themeIndex,
    toc,
    size,
    pressReady,
    projectTitle,
    projectAuthor,
    language,
    verbose,
    timeout,
    loadMode,
    sandbox,
    executableChromium,
  };

  debug(parsedConfig);

  return parsedConfig;
}
