import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import chalk from 'chalk';
import cheerio from 'cheerio';
import fs from 'fs';
import resolvePkg from 'resolve-pkg';
import path from 'upath';
import { pathToFileURL } from 'url';
import { getExecutableBrowserPath } from './browser';
import { MANIFEST_FILENAME, TOC_FILENAME, TOC_TITLE } from './const';
import { CONTAINER_IMAGE } from './container';
import { openEpubToTmpDirectory } from './epub';
import {
  detectInputFormat,
  detectManuscriptMediaType,
  InputFormat,
  ManuscriptMediaType,
} from './input';
import { readMarkdownMetadata } from './markdown';
import {
  checkOutputFormat,
  checkPreflightMode,
  checkRenderMode,
  detectOutputFormat,
  OutputFormat,
} from './output';
import type {
  ContentsEntryObject,
  EntryObject,
  VivliostyleConfigSchema,
} from './schema/vivliostyle.config';
import configSchema from './schema/vivliostyle.config.schema.json';
import { PageSize } from './server';
import { cwd, debug, isUrlString, log, readJSON, touchTmpFile } from './util';

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
  destination: string;
}

export interface PackageTheme {
  type: 'package';
  name: string;
  location: string;
  destination: string;
  style: string;
}

export interface ManuscriptEntry {
  type: ManuscriptMediaType;
  title?: string;
  theme?: ParsedTheme;
  source: string;
  target: string;
  rel?: string | string[];
}

export interface ContentsEntry {
  rel: 'contents';
  title?: string;
  theme?: ParsedTheme;
  target: string;
}

export type ParsedEntry = ManuscriptEntry | ContentsEntry;

export interface CliFlags {
  input?: string;
  configPath?: string;
  targets?: Pick<OutputFormat, 'path' | 'format'>[];
  theme?: string;
  size?: string;
  style?: string;
  userStyle?: string;
  singleDoc?: boolean;
  quick?: boolean;
  pressReady?: boolean;
  title?: string;
  author?: string;
  language?: string;
  verbose?: boolean;
  timeout?: number;
  renderMode?: 'local' | 'docker';
  preflight?: 'press-ready' | 'press-ready-local';
  preflightOption?: string[];
  sandbox?: boolean;
  executableChromium?: string;
  image?: string;
}

export interface WebPublicationManifestConfig {
  manifestPath: string;
  manifestAutoGenerate: {
    title: string;
    author: string;
  } | null;
}
export interface EpubManifestConfig {
  epubOpfPath: string;
}
export interface WebbookEntryConfig {
  webbookEntryPath: string;
}
export type ManifestConfig = XOR<
  [WebPublicationManifestConfig, WebbookEntryConfig, EpubManifestConfig]
>;

export type MergedConfig = {
  entryContextDir: string;
  workspaceDir: string;
  entries: ParsedEntry[];
  input: InputFormat;
  outputs: OutputFormat[];
  themeIndexes: ParsedTheme[];
  includeAssets: string[];
  exportAliases: {
    source: string;
    target: string;
  }[];
  size: PageSize | undefined;
  customStyle: string | undefined;
  customUserStyle: string | undefined;
  singleDoc: boolean;
  quick: boolean;
  language: string | null;
  vfmOptions: {
    hardLineBreaks: boolean;
    disableFormatHtml: boolean;
  };
  cover: string | undefined;
  verbose: boolean;
  timeout: number;
  sandbox: boolean;
  executableChromium: string;
  image: string;
} & ManifestConfig;

const DEFAULT_TIMEOUT = 2 * 60 * 1000; // 2 minutes

const DEFAULT_ASSETS = [
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.svg',
  '**/*.gif',
  '**/*.webp',
  '**/*.apng',
  '**/*.ttf',
  '**/*.otf',
  '**/*.woff',
  '**/*.woff2',
];

export function validateTimeoutFlag(val: string) {
  return Number.isFinite(+val) && +val > 0 ? +val * 1000 : DEFAULT_TIMEOUT;
}

export function contextResolve(
  context: string,
  loc: string | undefined,
): string | undefined {
  return loc && path.resolve(context, loc);
}

function normalizeEntry(
  e: string | EntryObject | ContentsEntryObject,
): EntryObject | ContentsEntryObject {
  if (typeof e === 'object') {
    return e;
  }
  return { path: e };
}

// parse theme locator
export function parseTheme(
  locator: string | undefined,
  contextDir: string,
  workspaceDir: string,
): ParsedTheme | undefined {
  if (typeof locator !== 'string' || locator == '') {
    return undefined;
  }

  // url
  if (isUrlString(locator)) {
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
        destination: path.join(workspaceDir, 'themes/packages', style.name),
        style: style.maybeStyle,
      };
    }
  }

  // bare .css file
  const sourceRelPath = path.relative(contextDir, stylePath);
  return {
    type: 'file',
    name: path.basename(locator),
    location: stylePath,
    destination: path.resolve(workspaceDir, sourceRelPath),
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

function parseFileMetadata(
  type: ManuscriptMediaType,
  sourcePath: string,
  workspaceDir: string,
): { title?: string; theme?: ParsedTheme } {
  const sourceDir = path.dirname(sourcePath);
  let title: string | undefined;
  let theme: ParsedTheme | undefined;
  if (type === 'text/markdown') {
    const metadata = readMarkdownMetadata(sourcePath);
    title = metadata.title;
    theme = parseTheme(metadata.vfm?.theme, sourceDir, workspaceDir);
  } else {
    const $ = cheerio.load(fs.readFileSync(sourcePath, 'utf8'));
    title = $('title')?.text() ?? undefined;
  }
  return { title, theme };
}

export function collectVivliostyleConfig<T extends CliFlags>(
  cliFlags: T,
): {
  cliFlags: T;
  vivliostyleConfig?: VivliostyleConfigSchema;
  vivliostyleConfigPath: string;
} {
  const load = (configPath: string) => {
    if (!fs.existsSync(configPath)) {
      return undefined;
    }
    delete require.cache[configPath]; // clear require cache
    const config = require(configPath) as VivliostyleConfigSchema;

    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    const valid = ajv.validate(configSchema, config);
    if (!valid) {
      throw new Error(
        `Validation of vivliostyle.config failed. Please check the schema: ${configPath}`,
      );
    }
    return config;
  };

  let vivliostyleConfigPath = cliFlags.configPath
    ? path.resolve(cwd, cliFlags.configPath)
    : path.join(cwd, 'vivliostyle.config.js');
  let vivliostyleConfig = load(vivliostyleConfigPath);
  if (
    !vivliostyleConfig &&
    cliFlags.input &&
    path.basename(cliFlags.input).startsWith('vivliostyle.config')
  ) {
    // Load an input argument as a Vivliostyle config
    try {
      const inputPath = path.resolve(cwd, cliFlags.input);
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
  config: VivliostyleConfigSchema | undefined,
  context: string,
): Promise<MergedConfig> {
  debug('context directory', context);
  debug('cliFlags', cliFlags);
  debug('vivliostyle.config.js', config);
  let entryContextDir: string;
  let workspaceDir: string;

  if (cliFlags.input && isUrlString(cliFlags.input)) {
    workspaceDir = entryContextDir = cwd;
  } else {
    entryContextDir = path.resolve(
      cliFlags.input
        ? path.dirname(path.resolve(context, cliFlags.input))
        : contextResolve(context, config?.entryContext) ?? context,
    );
    workspaceDir =
      contextResolve(context, config?.workspaceDir) ?? entryContextDir;
  }

  const includeAssets = config?.includeAssets
    ? Array.isArray(config.includeAssets)
      ? config.includeAssets
      : [config.includeAssets]
    : DEFAULT_ASSETS;

  const language = cliFlags.language ?? config?.language ?? null;
  const sizeFlag = cliFlags.size ?? config?.size;
  const size = sizeFlag ? parsePageSize(sizeFlag) : undefined;
  const customStyle =
    cliFlags.style &&
    (isUrlString(cliFlags.style)
      ? cliFlags.style
      : pathToFileURL(cliFlags.style).href);
  const customUserStyle =
    cliFlags.userStyle &&
    (isUrlString(cliFlags.userStyle)
      ? cliFlags.userStyle
      : pathToFileURL(cliFlags.userStyle).href);
  const singleDoc = cliFlags.singleDoc ?? false;
  const quick = cliFlags.quick ?? false;
  const cover = contextResolve(entryContextDir, config?.cover) ?? undefined;
  const pressReady = cliFlags.pressReady ?? config?.pressReady ?? false;
  const renderMode = cliFlags.renderMode ?? 'local';
  const preflight = cliFlags.preflight ?? (pressReady ? 'press-ready' : null);
  const preflightOption = cliFlags.preflightOption ?? [];

  const vfmOptions = {
    hardLineBreaks: config?.vfm?.hardLineBreaks ?? false,
    disableFormatHtml: config?.vfm?.disableFormatHtml ?? false,
  };

  const verbose = cliFlags.verbose ?? false;
  const timeout = cliFlags.timeout ?? config?.timeout ?? DEFAULT_TIMEOUT;
  const sandbox = cliFlags.sandbox ?? true;
  const executableChromium =
    cliFlags.executableChromium ?? getExecutableBrowserPath();
  const image = cliFlags.image ?? config?.image ?? CONTAINER_IMAGE;

  const themeIndexes: ParsedTheme[] = [];
  const rootTheme =
    parseTheme(cliFlags.theme, cwd, workspaceDir) ??
    parseTheme(config?.theme, context, workspaceDir);
  if (rootTheme) {
    themeIndexes.push(rootTheme);
  }

  const outputs = ((): OutputFormat[] => {
    if (cliFlags.targets?.length) {
      return cliFlags.targets.map(({ path: outputPath, format }) => {
        if (format === 'pdf') {
          return {
            path: path.resolve(outputPath),
            format,
            renderMode,
            preflight,
            preflightOption,
          };
        } else {
          return {
            path: path.resolve(outputPath),
            format,
          };
        }
      });
    }
    if (config?.output) {
      return (Array.isArray(config.output)
        ? config.output
        : [config.output]
      ).map((target) => {
        const targetObj =
          typeof target === 'string' ? { path: target } : target;
        const outputPath = path.resolve(context, targetObj.path);
        const format = targetObj.format ?? detectOutputFormat(outputPath);
        if (!checkOutputFormat(format)) {
          throw new Error(`Unknown format: ${format}`);
        }
        if (format === 'pdf') {
          const outputRenderMode = targetObj.renderMode ?? renderMode;
          const outputPreflight = targetObj.preflight ?? preflight;
          if (!checkRenderMode(outputRenderMode)) {
            throw new Error(`Unknown renderMode: ${outputRenderMode}`);
          }
          if (
            outputPreflight !== null &&
            !checkPreflightMode(outputPreflight)
          ) {
            throw new Error(`Unknown preflight: ${outputPreflight}`);
          }
          return {
            ...targetObj,
            path: outputPath,
            format,
            renderMode: outputRenderMode,
            preflight: outputPreflight,
            preflightOption: targetObj.preflightOption ?? preflightOption,
          };
        } else {
          return { ...targetObj, path: outputPath, format } as OutputFormat;
        }
      });
    }
    // Outputs a pdf file if any output configuration is not set
    const filename = config?.title ? `${config.title}.pdf` : 'output.pdf';
    return [
      {
        path: path.resolve(context, filename),
        format: 'pdf',
        renderMode,
        preflight,
        preflightOption,
      },
    ];
  })();

  const commonOpts: CommonOpts = {
    entryContextDir,
    workspaceDir,
    includeAssets,
    outputs,
    themeIndexes,
    size,
    customStyle,
    customUserStyle,
    singleDoc,
    quick,
    language,
    vfmOptions,
    cover,
    verbose,
    timeout,
    sandbox,
    executableChromium,
    image,
  };
  if (!cliFlags.input && !config) {
    throw new Error(
      'No input is set. Please set an appropriate entry or a Vivliostyle config file.',
    );
  }
  const parsedConfig = cliFlags.input
    ? await composeSingleInputConfig(commonOpts, cliFlags, config)
    : await composeProjectConfig(commonOpts, cliFlags, config, context);
  debug('parsedConfig', parsedConfig);
  checkUnusedCliFlags(parsedConfig, cliFlags);
  return parsedConfig;
}

type CommonOpts = Omit<
  MergedConfig,
  | 'input'
  | 'entries'
  | 'exportAliases'
  | 'manifestPath'
  | 'manifestAutoGenerate'
  | 'epubOpfPath'
  | 'webbookEntryPath'
  | 'projectTitle'
  | 'projectAuthor'
>;

async function composeSingleInputConfig<T extends CliFlags>(
  otherConfig: CommonOpts,
  cliFlags: T,
  config: VivliostyleConfigSchema | undefined,
): Promise<MergedConfig> {
  debug('entering single entry config mode');

  let sourcePath: string;
  let workspaceDir: string;
  let input: InputFormat;
  const entries: ParsedEntry[] = [];
  const exportAliases: { source: string; target: string }[] = [];
  const tmpPrefix = `.vs-${Date.now()}.`;

  if (cliFlags.input && isUrlString(cliFlags.input)) {
    sourcePath = cliFlags.input;
    workspaceDir = otherConfig.workspaceDir;
    input = { format: 'webbook', entry: sourcePath };
  } else {
    sourcePath = path.resolve(cliFlags.input);
    workspaceDir = path.dirname(sourcePath);
    input = detectInputFormat(sourcePath);
  }

  if (input.format === 'markdown') {
    // Single input file; create temporary file
    const type = detectManuscriptMediaType(sourcePath);
    const metadata = parseFileMetadata(type, sourcePath, workspaceDir);
    const target = path
      .resolve(workspaceDir, `${tmpPrefix}${path.basename(sourcePath)}`)
      .replace(/\.md$/, '.html');
    await touchTmpFile(target);
    entries.push({
      type,
      source: sourcePath,
      target,
      title: metadata.title,
      theme: metadata.theme ?? otherConfig.themeIndexes[0],
    });
    exportAliases.push({
      source: target,
      target: path.resolve(
        workspaceDir,
        path.basename(sourcePath).replace(/\.md$/, '.html'),
      ),
    });
  }

  const manifestDeclaration = await (async (): Promise<ManifestConfig> => {
    if (input.format === 'markdown') {
      // create temporary manifest file
      const manifestPath = path.resolve(
        workspaceDir,
        `${tmpPrefix}${MANIFEST_FILENAME}`,
      );
      await touchTmpFile(manifestPath);
      exportAliases.push({
        source: manifestPath,
        target: path.resolve(workspaceDir, MANIFEST_FILENAME),
      });
      return {
        manifestPath,
        manifestAutoGenerate: {
          title:
            cliFlags.title ??
            config?.title ??
            (entries.length === 1 && entries[0].title
              ? (entries[0].title as string)
              : path.basename(sourcePath)),
          author: cliFlags.author ?? config?.author ?? '',
        },
      };
    } else if (input.format === 'html' || input.format === 'webbook') {
      return { webbookEntryPath: input.entry };
    } else if (input.format === 'pub-manifest') {
      return { manifestPath: input.entry, manifestAutoGenerate: null };
    } else if (input.format === 'epub-opf') {
      return { epubOpfPath: input.entry };
    } else if (input.format === 'epub') {
      const { epubOpfPath } = await openEpubToTmpDirectory(input.entry);
      return { epubOpfPath };
    } else {
      throw new Error('Failed to export manifest declaration');
    }
  })();

  return {
    ...otherConfig,
    ...manifestDeclaration,
    entries,
    input,
    exportAliases,
  };
}

async function composeProjectConfig<T extends CliFlags>(
  otherConfig: CommonOpts,
  cliFlags: T,
  config: VivliostyleConfigSchema | undefined,
  context: string,
): Promise<MergedConfig> {
  debug('entering project config mode');

  const { entryContextDir, workspaceDir, themeIndexes, outputs } = otherConfig;
  const pkgJsonPath = path.resolve(context, 'package.json');
  const pkgJson = fs.existsSync(pkgJsonPath)
    ? readJSON(pkgJsonPath)
    : undefined;
  if (pkgJson) {
    debug('located package.json path', pkgJsonPath);
  }

  const autoGeneratedTocPath = path.resolve(
    workspaceDir,
    typeof config?.toc === 'string' ? config.toc : TOC_FILENAME,
  );

  const projectTitle: string | undefined =
    cliFlags.title ?? config?.title ?? pkgJson?.name;
  const projectAuthor: string | undefined =
    cliFlags.author ?? config?.author ?? pkgJson?.author;

  function parseEntry(entry: EntryObject | ContentsEntryObject): ParsedEntry {
    if (!('path' in entry)) {
      const theme =
        parseTheme(entry.theme, context, workspaceDir) ?? themeIndexes[0];
      if (theme && themeIndexes.every((t) => t.location !== theme.location)) {
        themeIndexes.push(theme);
      }
      return {
        rel: 'contents',
        target: autoGeneratedTocPath,
        title: entry.title ?? config?.tocTitle ?? TOC_TITLE,
        theme,
      } as ContentsEntry;
    }
    const sourcePath = path.resolve(entryContextDir, entry.path); // abs
    const contextEntryPath = path.relative(entryContextDir, sourcePath); // rel
    const targetPath = path
      .resolve(workspaceDir, contextEntryPath)
      .replace(/\.md$/, '.html');
    const type = detectManuscriptMediaType(sourcePath);
    const metadata = parseFileMetadata(type, sourcePath, workspaceDir);

    const title = entry.title ?? metadata.title ?? projectTitle;
    const theme =
      parseTheme(entry.theme, context, workspaceDir) ??
      metadata.theme ??
      themeIndexes[0];

    if (theme && themeIndexes.every((t) => t.location !== theme.location)) {
      themeIndexes.push(theme);
    }

    return {
      type,
      source: sourcePath,
      target: targetPath,
      title,
      theme,
      ...(entry.rel && { rel: entry.rel }),
    } as ManuscriptEntry;
  }

  const entries: ParsedEntry[] = config?.entry
    ? (Array.isArray(config.entry) ? config.entry : [config.entry])
        .map(normalizeEntry)
        .map(parseEntry)
    : [];
  if (!entries.length) {
    throw new Error(
      'The entry fields seems to be empty. Make sure your Vivliostyle configuration.',
    );
  }

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
  if (!!config?.toc && !entries.find(({ rel }) => rel === 'contents')) {
    entries.unshift({
      rel: 'contents',
      target: autoGeneratedTocPath,
      title: config?.tocTitle ?? TOC_TITLE,
      theme: themeIndexes[0],
    });
  }

  return {
    ...otherConfig,
    entries,
    input: {
      format: 'pub-manifest',
      entry: path.join(workspaceDir, MANIFEST_FILENAME),
    },
    exportAliases: [],
    manifestPath: path.join(workspaceDir, MANIFEST_FILENAME),
    manifestAutoGenerate: {
      title: projectTitle || fallbackProjectTitle,
      author: projectAuthor || '',
    },
  };
}

export function checkUnusedCliFlags<T extends CliFlags>(
  config: MergedConfig,
  cliFlags: T,
) {
  const unusedFlags: string[] = [];
  if (!config.manifestPath) {
    if (cliFlags.theme) {
      unusedFlags.push('--theme');
    }
    if (cliFlags.title) {
      unusedFlags.push('--title');
    }
    if (cliFlags.author) {
      unusedFlags.push('--author');
    }
    if (cliFlags.language) {
      unusedFlags.push('--language');
    }
  }
  if (unusedFlags.length) {
    log('\n');
    unusedFlags.forEach((flag) => {
      log(
        `${chalk.bold.yellow(flag)}${chalk.bold.yellow(
          ` flag seems to be set but the current export setting doesn't support this. This option will be ignored.`,
        )}`,
      );
    });
  }
}
