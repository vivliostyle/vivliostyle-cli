import Ajv from 'ajv';
import chalk from 'chalk';
import fs from 'fs';
import { JSDOM } from 'jsdom';
import process from 'process';
import puppeteer from 'puppeteer';
import resolvePkg from 'resolve-pkg';
import path from 'upath';
import { processMarkdown } from './markdown';
import configSchema from './schema/vivliostyle.config.schema.json';
import { PageSize } from './server';
import { debug, log, readJSON } from './util';

export interface Entry {
  path: string;
  title?: string;
  theme?: string;
}

export interface Output {
  path: string;
  format?: string;
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
  source: string;
  target: string;
}

export const availableOutputFormat = [
  'pdf',
  'pub-manifest',
  'webbook',
] as const;
export type OutputFormat = typeof availableOutputFormat[number];

export interface ParsedOutput {
  path: string;
  format: OutputFormat;
}

export interface VivliostyleConfig {
  title?: string;
  author?: string;
  theme?: string;
  entry: string | Entry | (string | Entry)[];
  entryContext?: string; // .
  output?: string | Output | (string | Output)[];
  size?: string;
  pressReady?: boolean;
  language?: string;
  toc?: boolean | string;
  cover?: string;
  timeout?: number;
}

export interface CliFlags {
  input?: string;
  configPath?: string;
  targets?: {
    output: string;
    format: OutputFormat;
  }[];
  theme?: string;
  size?: string;
  pressReady?: boolean;
  title?: string;
  author?: string;
  language?: string;
  verbose?: boolean;
  timeout?: number;
  sandbox?: boolean;
  executableChromium?: string;
}

export interface MergedConfig {
  entryContextDir: string;
  workspaceDir: string;
  artifactDir: string;
  entries: ParsedEntry[];
  outputs: ParsedOutput[];
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

const DEFAULT_TIMEOUT = 2 * 60 * 1000; // 2 minutes

export function validateTimeoutFlag(val: string) {
  return Number.isFinite(+val) && +val > 0 ? +val * 1000 : DEFAULT_TIMEOUT;
}

export function contextResolve(
  context: string,
  loc: string | undefined,
): string | undefined {
  return loc && path.resolve(context, loc);
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
      name: path.basename(locator),
      location: locator,
    };
  }

  const stylePath = path.resolve(contextDir, locator);

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
    name: path.basename(locator),
    location: stylePath,
  };
}

function parseStyleLocator(
  pkgRootDir: string,
  locator: string,
): { name: string; maybeStyle: string } | undefined {
  const pkgJsonPath = path.join(pkgRootDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    return undefined;
  }

  const packageJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  const maybeStyle =
    packageJson?.vivliostyle?.theme?.style ??
    packageJson.style ??
    packageJson.main;

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
  const sourceDir = path.dirname(sourcePath);
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

export function collectVivliostyleConfig<T extends CliFlags>(
  cliFlags: T,
): {
  cliFlags: T;
  vivliostyleConfig?: VivliostyleConfig;
  vivliostyleConfigPath: string;
} {
  const load = (configPath: string) => {
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
  };

  const cwd = process.cwd();
  let vivliostyleConfigPath = cliFlags.configPath
    ? path.resolve(cwd, cliFlags.configPath)
    : path.join(cwd, 'vivliostyle.config.js');
  let vivliostyleConfig = load(vivliostyleConfigPath);
  if (!vivliostyleConfig && cliFlags.input) {
    // Load an input argument as a Vivliostyle config
    try {
      const inputPath = path.resolve(process.cwd(), cliFlags.input);
      const inputConfig = load(inputPath);
      if (inputConfig) {
        cliFlags = {
          ...cliFlags,
          input: undefined,
        };
        vivliostyleConfigPath = inputPath;
        vivliostyleConfig = inputConfig;
      }
    } catch (_err) {}
  }
  return {
    cliFlags,
    vivliostyleConfig,
    vivliostyleConfigPath,
  };
}

export async function mergeConfig<T extends CliFlags>(
  cliFlags: T,
  config: VivliostyleConfig | undefined,
  context: string,
  workspaceDir: string,
): Promise<MergedConfig> {
  debug('context directory', context);

  const pkgJsonPath = path.resolve(context, 'package.json');
  const pkgJson = fs.existsSync(pkgJsonPath)
    ? readJSON(pkgJsonPath)
    : undefined;
  if (pkgJson) {
    debug('located package.json path', pkgJsonPath);
  }

  const projectTitle: string | undefined =
    cliFlags.title ?? config?.title ?? pkgJson?.name;
  const projectAuthor: string | undefined =
    cliFlags.author ?? config?.author ?? pkgJson?.author;

  debug('cliFlags', cliFlags);
  debug('vivliostyle.config.js', config);

  const entryContextDir = path.resolve(
    cliFlags.input
      ? '.'
      : contextResolve(context, config?.entryContext) ?? context,
  );
  const artifactDir = path.join(workspaceDir, 'artifact');

  const language = cliFlags.language ?? config?.language ?? 'en';
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
    cliFlags.executableChromium ?? puppeteer.executablePath();

  const themeIndexes: ParsedTheme[] = [];
  const rootTheme =
    parseTheme(cliFlags.theme, process.cwd()) ??
    parseTheme(config?.theme, context);
  if (rootTheme) {
    themeIndexes.push(rootTheme);
  }

  function parseEntry(entry: Entry): ParsedEntry {
    const sourcePath = path.resolve(entryContextDir, entry.path); // abs
    const sourceDir = path.dirname(sourcePath); // abs
    const contextEntryPath = path.relative(entryContextDir, sourcePath); // rel
    const targetPath = path
      .resolve(artifactDir, contextEntryPath)
      .replace(/\.md$/, '.html');
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
      source: sourcePath,
      target: targetPath,
      title,
      theme,
    };
  }

  const rawEntries = cliFlags.input
    ? [cliFlags.input]
    : config?.entry
    ? Array.isArray(config.entry)
      ? config.entry
      : [config.entry]
    : [];
  const entries: ParsedEntry[] = rawEntries.map(normalizeEntry).map(parseEntry);

  const outputs = ((): ParsedOutput[] => {
    if (cliFlags.targets?.length) {
      return cliFlags.targets.map(({ output, format }) => ({
        path: path.resolve(output),
        format,
      }));
    }
    if (config?.output) {
      return (Array.isArray(config.output)
        ? config.output
        : [config.output]
      ).map((target) => {
        if (typeof target === 'string') {
          return {
            path: path.resolve(context, target),
            format: inferenceFormatByName(target),
          };
        }
        const format = target.format ?? inferenceFormatByName(target.path);
        if (!availableOutputFormat.includes(format as OutputFormat)) {
          throw new Error(`Unknown format: ${format}`);
        }
        return {
          path: path.resolve(context, target.path),
          format: format as OutputFormat,
        };
      });
    }
    // Outputs a pdf file if any output configuration is not set
    const filename = config?.title ? `${config.title}.pdf` : 'output.pdf';
    return [
      {
        path: path.resolve(context, filename),
        format: 'pdf',
      },
    ];
  })();

  let fallbackProjectTitle: string = '';
  if (!projectTitle) {
    if (entries.length === 1 && entries[0].title) {
      fallbackProjectTitle = entries[0].title;
    } else {
      fallbackProjectTitle = path.basename(outputs[0].path);
      log(
        `\n${chalk.yellow(
          'Could not find any appropriate publication title. We set ',
        )}${chalk.bold.yellow(`"${fallbackProjectTitle}"`)}${chalk.yellow(
          ' as a fallback.',
        )}`,
      );
    }
  }

  const parsedConfig = {
    entryContextDir,
    workspaceDir,
    artifactDir,
    entries,
    outputs,
    themeIndexes,
    pressReady,
    size,
    projectTitle: projectTitle || fallbackProjectTitle,
    projectAuthor: projectAuthor || '',
    language,
    toc,
    cover,
    verbose,
    timeout,
    sandbox,
    executableChromium,
  };

  debug('parsedConfig', parsedConfig);

  return parsedConfig;
}

export function inferenceFormatByName(filename: string): OutputFormat {
  const ext = path.extname(filename);
  switch (ext) {
    case '.pdf':
      return 'pdf';
    case '.json':
      return 'pub-manifest';
    default:
      return 'webbook';
  }
}
