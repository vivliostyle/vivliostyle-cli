import Ajv from 'ajv';
import fs from 'fs';
import { JSDOM } from 'jsdom';
import { homedir } from 'os';
import { basename, dirname, join, relative, resolve } from 'path';
import pkgUp from 'pkg-up';
import process from 'process';
import puppeteer from 'puppeteer-core';
import resolvePkg from 'resolve-pkg';
import shelljs from 'shelljs';
import { processMarkdown } from './markdown';
import configSchema from './schema/vivliostyle.config.schema.json';
import { PageSize } from './server';
import { debug, logUpdate, readJSON } from './util';

export interface Entry {
  path: string;
  title?: string;
  theme?: string;
}

export type ParsedTheme = UriTheme | FileTheme | PackageTheme;

export interface UriTheme {
  type: 'uri';
  name: string;
  location: string;
}

export interface FileTheme {
  type: 'file';
  name: string;
  location: string;
}

export interface PackageTheme {
  type: 'package';
  name: string;
  location: string;
  style: string;
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
  toc?: boolean | string;
  cover?: string;
  distDir?: string; // .vivliostyle
  timeout?: number;
}

export interface CliFlags {
  input?: string;
  configPath?: string;
  outFile?: string;
  outDir?: string;
  theme?: string;
  size?: string;
  pressReady?: boolean;
  title?: string;
  author?: string;
  language?: string;
  verbose?: boolean;
  distDir?: string; // .vivliostyle
  timeout?: number;
  sandbox?: boolean;
  executableChromium?: string;
}

export interface MergedConfig {
  entryContextDir: string;
  artifactDir: string;
  distDir: string;
  outputPath: string;
  entries: ParsedEntry[];
  themeIndexes: ParsedTheme[];
  size: PageSize | undefined;
  pressReady: boolean;
  projectTitle: string;
  projectAuthor: string;
  language: string;
  toc: string | boolean;
  cover: string | undefined;
  verbose: boolean;
  timeout: number;
  sandbox: boolean;
  executableChromium: string;
}

export const VIVLIOSTYLE_CACHE_DIR = join(homedir(), '.vivliostyle');
const DEFAULT_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const CHROMIUM_REVISION = '785203';

export function validateTimeoutFlag(val: string) {
  return Number.isFinite(+val) && +val > 0 ? +val * 1000 : DEFAULT_TIMEOUT;
}

export function contextResolve(
  context: string,
  loc: string | undefined,
): string | undefined {
  return loc && resolve(context, loc);
}

function normalizeEntry(e: string | Entry): Entry {
  if (typeof e === 'object') {
    return e;
  }
  return { path: e };
}

// parse theme locator
export function parseTheme(
  locator: string | undefined,
  contextDir: string,
): ParsedTheme | undefined {
  if (typeof locator !== 'string' || locator == '') {
    return undefined;
  }

  // url
  if (/^https?:\/\//.test(locator)) {
    return {
      type: 'uri',
      name: basename(locator),
      location: locator,
    };
  }

  const stylePath = resolve(contextDir, locator);

  // node_modules, local pkg
  const pkgRootDir = resolvePkg(locator, { cwd: contextDir });
  if (!pkgRootDir?.endsWith('.css')) {
    const style = parseStyleLocator(pkgRootDir ?? stylePath, locator);
    if (style) {
      return {
        type: 'package',
        name: style.name,
        location: pkgRootDir ?? stylePath,
        style: style.maybeStyle,
      };
    }
  }

  // bare .css file
  return {
    type: 'file',
    name: basename(locator),
    location: stylePath,
  };
}

function parseStyleLocator(
  pkgRootDir: string,
  locator: string,
): { name: string; maybeStyle: string } | undefined {
  const pkgJsonPath = join(pkgRootDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    return undefined;
  }

  const packageJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  const maybeStyle =
    packageJson?.vivliostyle?.theme?.style ??
    packageJson.style ??
    packageJson.main ??
    packageJson?.vivliostyle?.theme?.stylesheet; // TODO: remove theme.stylesheet

  if (!maybeStyle) {
    throw new Error(
      `invalid style file: ${maybeStyle} while parsing ${locator}`,
    );
  }
  return { name: packageJson.name, maybeStyle };
}

function parsePageSize(size: string): PageSize {
  const [width, height, ...others] = `${size}`.split(',');
  if (others.length) {
    throw new Error(`Cannot parse size: ${size}`);
  } else if (width && height) {
    return {
      width,
      height,
    };
  } else {
    return {
      format: width ?? 'Letter',
    };
  }
}

function parseFileMetadata(type: string, sourcePath: string) {
  const sourceDir = dirname(sourcePath);
  let title: string | undefined;
  let theme: ParsedTheme | undefined;
  if (type === 'markdown') {
    const file = processMarkdown(sourcePath);
    title = file.data.title;
    theme = parseTheme(file.data.theme, sourceDir);
  } else {
    const {
      window: { document },
    } = new JSDOM(fs.readFileSync(sourcePath));
    title = document.querySelector('title')?.textContent ?? undefined;
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="stylesheet"]',
    );
    theme = parseTheme(link?.href, sourceDir);
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

  const ajv = Ajv();
  const valid = ajv.validate(configSchema, config);
  if (!valid) {
    throw new Error('Invalid vivliostyle.config.js');
  }

  return config;
}

export function getVivliostyleConfigPath(configPath?: string) {
  const cwd = process.cwd();
  return configPath
    ? resolve(cwd, configPath)
    : join(cwd, 'vivliostyle.config.js');
}

export async function mergeConfig<T extends CliFlags>(
  cliFlags: T,
  config: VivliostyleConfig | undefined,
  context: string,
): Promise<MergedConfig> {
  const pkgJsonPath = await pkgUp();
  const pkgJson = pkgJsonPath ? readJSON(pkgJsonPath) : undefined;

  const projectTitle = cliFlags.title ?? config?.title ?? pkgJson?.name;
  if (!projectTitle) {
    throw new Error('title not defined');
  }
  const projectAuthor = cliFlags.author ?? config?.author ?? pkgJson?.author;

  debug('cliFlags %O', cliFlags);
  debug('vivliostyle.config.js %O', config);

  const entryContextDir = resolve(
    cliFlags.input ? '.' : contextResolve(context, config?.entryContext) ?? '.',
  );
  const distDir = resolve(
    cliFlags?.distDir ??
      contextResolve(context, config?.distDir) ??
      '.vivliostyle',
  );
  const artifactDir = join(distDir, 'artifacts');

  const format = config?.format ?? 'pdf';
  const outDir = cliFlags.outDir ?? contextResolve(context, config?.outDir);
  const outFile = cliFlags.outFile ?? contextResolve(context, config?.outFile);

  if (outDir && outFile) {
    throw new Error('outDir and outFile cannot be combined.');
  }
  const outputFile = `${projectTitle}.${format}`;
  const outputPath = outDir
    ? resolve(outDir, outputFile)
    : outFile ?? resolve(outputFile);

  const language = config?.language ?? 'en';
  const sizeFlag = cliFlags.size ?? config?.size;
  const size = sizeFlag ? parsePageSize(sizeFlag) : undefined;
  const toc =
    typeof config?.toc === 'string'
      ? contextResolve(context, config?.toc)!
      : config?.toc !== undefined
      ? config.toc
      : false;
  const cover = contextResolve(context, config?.cover) ?? undefined;
  const pressReady = cliFlags.pressReady ?? config?.pressReady ?? false;

  const verbose = cliFlags.verbose ?? false;
  const timeout = cliFlags.timeout ?? config?.timeout ?? DEFAULT_TIMEOUT;
  const sandbox = cliFlags.sandbox ?? true;
  const executableChromium =
    cliFlags.executableChromium ?? (await downloadChrome()).executablePath;

  const themeIndexes: ParsedTheme[] = [];
  const rootTheme =
    parseTheme(cliFlags.theme, process.cwd()) ??
    parseTheme(config?.theme, context);
  if (rootTheme) {
    themeIndexes.push(rootTheme);
  }

  function parseEntry(entry: Entry): ParsedEntry {
    const sourcePath = resolve(entryContextDir, entry.path); // abs
    const sourceDir = dirname(sourcePath); // abs
    const contextEntryPath = relative(entryContextDir, sourcePath); // rel
    const targetPath = resolve(artifactDir, contextEntryPath).replace(
      /\.md$/,
      '.html',
    );
    const targetDir = dirname(targetPath);
    const type = sourcePath.endsWith('.html') ? 'html' : 'markdown';

    const metadata = parseFileMetadata(type, sourcePath);

    const title = entry.title ?? metadata.title ?? projectTitle;
    const theme =
      parseTheme(entry.theme, sourceDir) ?? metadata.theme ?? themeIndexes[0];

    if (theme && themeIndexes.every((t) => t.location !== theme.location)) {
      themeIndexes.push(theme);
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
  const entries: ParsedEntry[] = rawEntries.map(normalizeEntry).map(parseEntry);

  const mergedConfig = {
    entryContextDir,
    artifactDir,
    distDir,
    outputPath,
    entries,
    themeIndexes,
    pressReady,
    size,
    projectTitle,
    projectAuthor,
    language,
    toc,
    cover,
    format,
    verbose,
    timeout,
    sandbox,
    executableChromium,
  };

  debug('mergedConfig %O', mergedConfig);

  return mergedConfig;
}

async function downloadChrome() {
  logUpdate('Fetching Chromium');
  const chromiumRoot = join(VIVLIOSTYLE_CACHE_DIR, 'local-chromium');
  shelljs.mkdir('-p', chromiumRoot);
  const browserFetcher = puppeteer.createBrowserFetcher({ path: chromiumRoot });
  // NOTE: http://omahaproxy.appspot.com/
  // https://github.com/puppeteer/puppeteer/issues/4531
  const revisionInfo = await browserFetcher.download(CHROMIUM_REVISION);
  debug('revisionInfo %O', revisionInfo);
  return revisionInfo;
}
