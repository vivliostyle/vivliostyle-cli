import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import betterAjvErrors from 'better-ajv-errors';
import chalk from 'chalk';
import cheerio from 'cheerio';
import fs from 'fs';
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
import { vivliostyleConfigSchema } from './schema/vivliostyle';
import type {
  BrowserType,
  EntryObject,
  VivliostyleConfigEntry,
  VivliostyleConfigSchema,
} from './schema/vivliostyleConfig.schema';
import { PageSize } from './server';
import { parsePackageName } from './theme';
import {
  cwd,
  debug,
  DetailError,
  filterRelevantAjvErrors,
  isUrlString,
  log,
  logWarn,
  pathEquals,
  readJSON,
  statFileSync,
  touchTmpFile,
} from './util';

export type ParsedTheme = UriTheme | FileTheme | PackageTheme;

export interface UriTheme {
  type: 'uri';
  name: string;
  location: string;
}

export interface FileTheme {
  type: 'file';
  name: string;
  source: string;
  location: string;
}

export interface PackageTheme {
  type: 'package';
  name: string;
  specifier: string;
  location: string;
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
  cropMarks?: boolean;
  bleed?: string;
  cropOffset?: string;
  css?: string;
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
  executableBrowser?: string;
  image?: string;
  http?: boolean;
  viewer?: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
  /** @deprecated */ executableChromium?: string;
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
  themesDir: string;
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
  cropMarks: boolean;
  bleed: string | undefined;
  cropOffset: string | undefined;
  css: string | undefined;
  customStyle: string | undefined;
  customUserStyle: string | undefined;
  singleDoc: boolean;
  quick: boolean;
  language: string | null;
  readingProgression: 'ltr' | 'rtl' | undefined;
  vfmOptions: {
    hardLineBreaks: boolean;
    disableFormatHtml: boolean;
  };
  cover: string | undefined;
  verbose: boolean;
  timeout: number;
  sandbox: boolean;
  executableBrowser: string;
  browserType: BrowserType;
  image: string;
  httpServer: boolean;
  viewer: string | undefined;
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

function normalizeEntry(e: string | EntryObject): EntryObject {
  if (typeof e === 'object') {
    return e;
  }
  return { path: e };
}

// parse theme locator
export function parseTheme({
  specifier,
  entryContextDir,
  workspaceDir,
  themesDir,
}: {
  specifier: string;
  entryContextDir: string;
  workspaceDir: string;
  themesDir: string;
}): ParsedTheme {
  // url
  if (isUrlString(specifier)) {
    return {
      type: 'uri',
      name: path.basename(specifier),
      location: specifier,
    };
  }

  // bare .css file
  const stylePath = path.resolve(entryContextDir, specifier);
  if (fs.existsSync(stylePath) && stylePath.endsWith('.css')) {
    const sourceRelPath = path.relative(entryContextDir, stylePath);
    return {
      type: 'file',
      name: path.basename(specifier),
      source: stylePath,
      location: path.resolve(workspaceDir, sourceRelPath),
    };
  }

  // node_modules, local pkg
  const parsed = parsePackageName(specifier, entryContextDir);

  if (!parsed) {
    throw new Error(`Invalid package name: ${specifier}`);
  }
  // To security reason, Vivliostyle CLI disallow other than npm registry or local file as download source
  // TODO: Add option that user can allow an unofficial registry explicitly
  if (!parsed.registry && parsed.type !== 'directory') {
    throw new Error(`This package specifier is not allowed: ${specifier}`);
  }
  let name = parsed.name;
  if (parsed.type === 'directory' && parsed.fetchSpec) {
    const pkgJsonPath = path.join(parsed.fetchSpec, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      name = packageJson.name;
    }
  }
  if (!name) {
    throw new Error(`Could not determine the package name: ${specifier}`);
  }
  return {
    type: 'package',
    name,
    specifier,
    location: path.join(themesDir, 'packages', name),
  };
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

function parseFileMetadata({
  type,
  sourcePath,
  workspaceDir,
  themesDir,
}: {
  type: ManuscriptMediaType;
  sourcePath: string;
  workspaceDir: string;
  themesDir?: string;
}): { title?: string; theme?: ParsedTheme } {
  const sourceDir = path.dirname(sourcePath);
  let title: string | undefined;
  let theme: ParsedTheme | undefined;
  if (type === 'text/markdown') {
    const metadata = readMarkdownMetadata(sourcePath);
    title = metadata.title;
    if (
      metadata.vfm?.theme &&
      typeof metadata.vfm.theme === 'string' &&
      themesDir
    ) {
      theme = parseTheme({
        specifier: metadata.vfm?.theme,
        entryContextDir: sourceDir,
        workspaceDir,
        themesDir,
      });
    }
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
  vivliostyleConfig?: VivliostyleConfigEntry[];
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
    const validate = ajv.compile(vivliostyleConfigSchema);
    const valid = validate(config);
    if (!valid) {
      let jsonRaw: string | undefined;
      try {
        jsonRaw = fs.readFileSync(configPath, 'utf8');
        // Check JSON validity
        JSON.parse(jsonRaw);
      } catch {
        jsonRaw = undefined;
      }
      const message = `Validation of vivliostyle.config failed. Please check the schema: ${configPath}`;
      const detailMessage =
        validate.errors &&
        betterAjvErrors(
          vivliostyleConfigSchema,
          config,
          filterRelevantAjvErrors(validate.errors),
          typeof jsonRaw === 'string' ? { json: jsonRaw } : { indent: 2 },
        );
      throw detailMessage
        ? new DetailError(message, detailMessage)
        : new Error(message);
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

  if (cliFlags.executableChromium) {
    logWarn(
      chalk.yellowBright(
        "'--executable-chromium' option was deprecated and will be removed in a future release. Please replace with '--executable-browser' option.",
      ),
    );
    cliFlags.executableBrowser = cliFlags.executableChromium;
  }

  return {
    cliFlags,
    vivliostyleConfig:
      vivliostyleConfig &&
      // Config file allows both single input and list of inputs
      (Array.isArray(vivliostyleConfig)
        ? vivliostyleConfig
        : [vivliostyleConfig]),
    vivliostyleConfigPath,
  };
}

export async function mergeConfig<T extends CliFlags>(
  cliFlags: T,
  config: VivliostyleConfigEntry | undefined,
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
  const themesDir = path.join(workspaceDir, 'themes');

  const includeAssets = config?.includeAssets
    ? Array.isArray(config.includeAssets)
      ? config.includeAssets
      : [config.includeAssets]
    : DEFAULT_ASSETS;

  const language = cliFlags.language ?? config?.language ?? null;
  const readingProgression = config?.readingProgression ?? undefined;
  const sizeFlag = cliFlags.size ?? config?.size;
  const size = sizeFlag ? parsePageSize(sizeFlag) : undefined;
  const cropMarks = cliFlags.cropMarks ?? false;
  const bleed = cliFlags.bleed;
  const cropOffset = cliFlags.cropOffset;
  const css = cliFlags.css;
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
    ...config?.vfm,
    hardLineBreaks: config?.vfm?.hardLineBreaks ?? false,
    disableFormatHtml: config?.vfm?.disableFormatHtml ?? false,
  };

  const verbose = cliFlags.verbose ?? false;
  const timeout = cliFlags.timeout ?? config?.timeout ?? DEFAULT_TIMEOUT;
  const sandbox = cliFlags.sandbox ?? true;
  const browserType = cliFlags.browser ?? config?.browser ?? 'chromium';
  const executableBrowser =
    cliFlags.executableBrowser ?? getExecutableBrowserPath(browserType);
  const image = cliFlags.image ?? config?.image ?? CONTAINER_IMAGE;
  const httpServer = cliFlags.http ?? config?.http ?? false;
  const viewer = cliFlags.viewer ?? config?.viewer ?? undefined;

  const themeIndexes: ParsedTheme[] = [];
  const rootTheme = cliFlags.theme
    ? parseTheme({
        specifier: cliFlags.theme,
        entryContextDir: cwd,
        workspaceDir,
        themesDir,
      })
    : config?.theme
    ? parseTheme({
        specifier: config.theme,
        entryContextDir,
        workspaceDir,
        themesDir,
      })
    : undefined;
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
      return (
        Array.isArray(config.output) ? config.output : [config.output]
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
    themesDir,
    includeAssets,
    outputs,
    themeIndexes,
    size,
    cropMarks,
    bleed,
    cropOffset,
    css,
    customStyle,
    customUserStyle,
    singleDoc,
    quick,
    language,
    readingProgression,
    vfmOptions,
    cover,
    verbose,
    timeout,
    sandbox,
    executableBrowser,
    browserType,
    image,
    httpServer,
    viewer,
  };
  if (!cliFlags.input && !config) {
    throw new Error(
      'No input is set. Please set an appropriate entry or a Vivliostyle config file.',
    );
  }
  const parsedConfig = cliFlags.input
    ? await composeSingleInputConfig(commonOpts, cliFlags, config)
    : await composeProjectConfig(commonOpts, cliFlags, config);
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
  config: VivliostyleConfigEntry | undefined,
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
    // Check file exists
    statFileSync(sourcePath);
  }

  if (input.format === 'markdown') {
    // Single input file; create temporary file
    const type = detectManuscriptMediaType(sourcePath);
    const metadata = parseFileMetadata({ type, sourcePath, workspaceDir });
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
  config: VivliostyleConfigEntry | undefined,
): Promise<MergedConfig> {
  debug('entering project config mode');

  const { entryContextDir, workspaceDir, themesDir, themeIndexes, outputs } =
    otherConfig;
  const pkgJsonPath = path.resolve(entryContextDir, 'package.json');
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

  function parseEntry(entry: EntryObject): ParsedEntry {
    if (!('path' in entry)) {
      const theme =
        (entry.theme &&
          parseTheme({
            specifier: entry.theme,
            entryContextDir,
            workspaceDir,
            themesDir,
          })) ??
        themeIndexes[0];
      if (
        theme &&
        themeIndexes.every((t) => !pathEquals(t.location, theme.location))
      ) {
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
    if (!isUrlString(sourcePath)) {
      // Check file exists
      statFileSync(sourcePath);
    }
    const type = detectManuscriptMediaType(sourcePath);
    const metadata = parseFileMetadata({
      type,
      sourcePath,
      workspaceDir,
      themesDir,
    });

    const title = entry.title ?? metadata.title ?? projectTitle;
    const theme =
      (entry.theme &&
        parseTheme({
          specifier: entry.theme,
          entryContextDir,
          workspaceDir,
          themesDir,
        })) ??
      metadata.theme ??
      themeIndexes[0];

    if (
      theme &&
      themeIndexes.every((t) => !pathEquals(t.location, theme.location))
    ) {
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
