import chalk from 'chalk';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'url';
import * as v from 'valibot';
import { getExecutableBrowserPath } from '../browser.js';
import {
  COVER_HTML_FILENAME,
  COVER_HTML_IMAGE_ALT,
  EPUB_OUTPUT_VERSION,
  MANIFEST_FILENAME,
  TOC_FILENAME,
  TOC_TITLE,
} from '../const.js';
import { CONTAINER_IMAGE } from '../container.js';
import {
  InputFormat,
  ManuscriptMediaType,
  detectInputFormat,
  detectManuscriptMediaType,
} from '../input/input-types.js';
import {
  OutputFormat,
  checkOutputFormat,
  checkPreflightMode,
  checkRenderMode,
  detectOutputFormat,
} from '../output/output-types.js';
import { readMarkdownMetadata } from '../processor/markdown.js';
import { parsePackageName } from '../processor/theme.js';
import { PageSize } from '../server.js';
import {
  DetailError,
  cwd,
  debug,
  isUrlString,
  log,
  logWarn,
  openEpubToTmpDirectory,
  parseJsonc,
  pathEquals,
  prettifySchemaError,
  readJSON,
  statFileSync,
  touchTmpFile,
  upath,
} from '../util.js';
import {
  ArticleEntryObject,
  BrowserType,
  ContentsEntryObject,
  CoverEntryObject,
  EntryObject,
  StructuredDocument,
  StructuredDocumentSection,
  ThemeObject,
  VivliostyleConfigEntry,
  VivliostyleConfigSchema,
} from './schema.js';

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
  importPath?: string | string[];
}

export interface ManuscriptEntry {
  type: ManuscriptMediaType;
  title?: string;
  themes: ParsedTheme[];
  source: string;
  template?: undefined;
  target: string;
  rel?: string | string[];
}

export interface ContentsEntry {
  rel: 'contents';
  title?: string;
  themes: ParsedTheme[];
  source?: undefined;
  template?: {
    source: string;
    type: ManuscriptMediaType;
  };
  target: string;
  tocTitle: string;
  sectionDepth: number;
  transform: {
    transformDocumentList:
      | ((
          nodeList: StructuredDocument[],
        ) => (propsList: { children: any }[]) => any)
      | undefined;
    transformSectionList:
      | ((
          nodeList: StructuredDocumentSection[],
        ) => (propsList: { children: any }[]) => any)
      | undefined;
  };
  pageBreakBefore?: 'left' | 'right' | 'recto' | 'verso';
  pageCounterReset?: number;
}

export interface CoverEntry {
  rel: 'cover';
  title?: string;
  themes: ParsedTheme[];
  source?: undefined;
  template?: {
    source: string;
    type: ManuscriptMediaType;
  };
  target: string;
  coverImageSrc: string;
  coverImageAlt: string;
  pageBreakBefore?: 'left' | 'right' | 'recto' | 'verso';
}

export type ParsedEntry = ManuscriptEntry | ContentsEntry | CoverEntry;

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
  /** @deprecated */ verbose?: boolean;
  timeout?: number;
  renderMode?: 'local' | 'docker';
  preflight?: 'press-ready' | 'press-ready-local';
  preflightOption?: string[];
  sandbox?: boolean;
  executableBrowser?: string;
  image?: string;
  http?: boolean;
  viewer?: string;
  viewerParam?: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
  readingProgression?: 'ltr' | 'rtl';
  logLevel?: 'silent' | 'info' | 'verbose' | 'debug';
  /** @deprecated */ executableChromium?: string;
}

export interface WebPublicationManifestConfig {
  manifestPath: string;
  needToGenerateManifest?: boolean;
}
export interface EpubManifestConfig {
  epubOpfPath: string;
}
export interface WebbookEntryConfig {
  webbookEntryUrl: string;
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
  themeIndexes: Set<ParsedTheme>;
  rootThemes: ParsedTheme[];
  copyAsset: {
    includes: string[];
    excludes: string[];
    fileExtensions: string[];
  };
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
  title: string | undefined;
  author: string | undefined;
  language: string | undefined;
  readingProgression: 'ltr' | 'rtl' | undefined;
  vfmOptions: {
    hardLineBreaks: boolean;
    disableFormatHtml: boolean;
  };
  cover:
    | {
        src: string;
        name: string;
        htmlPath: string | undefined;
      }
    | undefined;
  timeout: number;
  sandbox: boolean;
  executableBrowser: string;
  browserType: BrowserType;
  image: string;
  httpServer: boolean;
  viewer: string | undefined;
  viewerParam: string | undefined;
  logLevel: 'silent' | 'info' | 'verbose' | 'debug';
} & ManifestConfig;

const DEFAULT_TIMEOUT = 2 * 60 * 1000; // 2 minutes

const DEFAULT_ASSET_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'svg',
  'gif',
  'webp',
  'apng',
  'ttf',
  'otf',
  'woff',
  'woff2',
];

const require = createRequire(import.meta.url);

export function validateTimeoutFlag(val: string) {
  return Number.isFinite(+val) && +val > 0 ? +val * 1000 : DEFAULT_TIMEOUT;
}

export function contextResolve(
  context: string,
  loc: string | undefined,
): string | undefined {
  return loc && upath.resolve(context, loc);
}

function normalizeEntry(e: string | EntryObject): EntryObject {
  if (typeof e === 'object') {
    return e;
  }
  return { path: e };
}

// parse theme locator
export function parseTheme({
  theme,
  context,
  workspaceDir,
  themesDir,
}: {
  theme: string | ThemeObject;
  context: string;
  workspaceDir: string;
  themesDir: string;
}): ParsedTheme {
  const { specifier, import: importPath } =
    typeof theme === 'string' ? { specifier: theme, import: undefined } : theme;

  // url
  if (isUrlString(specifier)) {
    return {
      type: 'uri',
      name: upath.basename(specifier),
      location: specifier,
    };
  }

  // bare .css file
  const stylePath = upath.resolve(context, specifier);
  if (fs.existsSync(stylePath) && stylePath.endsWith('.css')) {
    const sourceRelPath = upath.relative(context, stylePath);
    return {
      type: 'file',
      name: upath.basename(specifier),
      source: stylePath,
      location: upath.resolve(workspaceDir, sourceRelPath),
    };
  }

  // node_modules, local pkg
  const parsed = parsePackageName(specifier, context);

  if (!parsed) {
    throw new Error(`Invalid package name: ${specifier}`);
  }
  // To security reason, Vivliostyle CLI disallow other than npm registry or local file as download source
  // TODO: Add option that user can allow an unofficial registry explicitly
  if (!parsed.registry && parsed.type !== 'directory') {
    throw new Error(`This package specifier is not allowed: ${specifier}`);
  }
  let name = parsed.name;
  let resolvedSpecifier = specifier;
  if (parsed.type === 'directory' && parsed.fetchSpec) {
    const pkgJsonPath = upath.join(parsed.fetchSpec, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      name = packageJson.name;
      resolvedSpecifier = parsed.fetchSpec;
    }
  }
  if (!name) {
    throw new Error(`Could not determine the package name: ${specifier}`);
  }
  return {
    type: 'package',
    name,
    specifier: resolvedSpecifier,
    location: upath.join(themesDir, 'packages', name),
    importPath,
  };
}

function parsePageSize(size: string): PageSize {
  const [width, height, ...others] = `${size}`.split(',');
  if (!width || others.length) {
    throw new Error(`Cannot parse size: ${size}`);
  } else if (width && height) {
    return {
      width,
      height,
    };
  } else {
    return {
      format: width,
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
}): { title?: string; themes?: ParsedTheme[] } {
  const sourceDir = upath.dirname(sourcePath);
  let title: string | undefined;
  let themes: ParsedTheme[] | undefined;
  if (type === 'text/markdown') {
    const metadata = readMarkdownMetadata(sourcePath);
    title = metadata.title;
    if (metadata.vfm?.theme && themesDir) {
      themes = [metadata.vfm.theme]
        .flat()
        .filter(
          (entry) =>
            !!entry && (typeof entry === 'string' || typeof entry === 'object'),
        )
        .map((theme) =>
          parseTheme({
            theme,
            context: sourceDir,
            workspaceDir,
            themesDir,
          }),
        );
    }
  } else {
    const $ = cheerio.load(fs.readFileSync(sourcePath, 'utf8'));
    title = $('title')?.text() || undefined;
  }
  return { title, themes };
}

export async function collectVivliostyleConfig<T extends CliFlags>(
  cliFlags: T,
): Promise<
  {
    cliFlags: T;
  } & (
    | {
        vivliostyleConfig: VivliostyleConfigEntry[];
        vivliostyleConfigPath: string;
      }
    | {
        vivliostyleConfig?: undefined;
        vivliostyleConfigPath?: undefined;
      }
  )
> {
  const load = async (configPath: string) => {
    let config: unknown;
    let jsonRaw: string | undefined;
    try {
      if (upath.extname(configPath) === '.json') {
        jsonRaw = fs.readFileSync(configPath, 'utf8');
        config = parseJsonc(jsonRaw);
      } else {
        // Clear require cache to reload CJS config files
        delete require.cache[require.resolve(configPath)];
        const url = pathToFileURL(configPath);
        // Invalidate cache for ESM config files
        // https://github.com/nodejs/node/issues/49442
        url.search = `version=${Date.now()}`;
        config = (await import(url.href)).default;
        jsonRaw = JSON.stringify(config, null, 2);
      }
    } catch (error) {
      const thrownError = error as Error;
      throw new DetailError(
        `An error occurred on loading a config file: ${configPath}`,
        thrownError.stack ?? thrownError.message,
      );
    }

    const result = v.safeParse(VivliostyleConfigSchema, config);
    if (result.success) {
      return result.output;
    } else {
      const errorString = prettifySchemaError(jsonRaw, result.issues);
      throw new DetailError(
        `Validation of vivliostyle config failed. Please check the schema: ${configPath}`,
        errorString,
      );
    }
  };

  let configEntry:
    | {
        vivliostyleConfig: VivliostyleConfigEntry[];
        vivliostyleConfigPath: string;
      }
    | {
        vivliostyleConfig?: undefined;
        vivliostyleConfigPath?: undefined;
      } = {};
  let vivliostyleConfigPath: string | undefined;
  if (cliFlags.configPath) {
    vivliostyleConfigPath = upath.resolve(cwd, cliFlags.configPath);
  } else {
    vivliostyleConfigPath = ['.js', '.mjs', '.cjs']
      .map((ext) => upath.join(cwd, `vivliostyle.config${ext}`))
      .find((p) => fs.existsSync(p));
  }
  // let vivliostyleConfig: VivliostyleConfigSchema | undefined;
  if (vivliostyleConfigPath) {
    configEntry = {
      vivliostyleConfigPath,
      vivliostyleConfig: [await load(vivliostyleConfigPath)].flat(),
    };
  } else if (
    cliFlags.input &&
    upath.basename(cliFlags.input).startsWith('vivliostyle.config')
  ) {
    // Load an input argument as a Vivliostyle config
    try {
      const inputPath = upath.resolve(cwd, cliFlags.input);
      const inputConfig = await load(inputPath);
      cliFlags = {
        ...cliFlags,
        input: undefined,
      };
      configEntry = {
        vivliostyleConfigPath: inputPath,
        vivliostyleConfig: [inputConfig].flat(),
      };
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

  if (cliFlags.verbose) {
    logWarn(
      chalk.yellowBright(
        "'--verbose' option was deprecated and will be removed in a future release. Please replace with '--log-level verbose' option.",
      ),
    );
  }

  if (cliFlags.sandbox === false) {
    logWarn(
      chalk.yellowBright(
        "'--no-sandbox' option was deprecated and will be removed in a future release. It is no longer necessary because the sandbox is disabled by default.",
      ),
    );
  }

  const configEntries = (configEntry.vivliostyleConfig ?? []).flat();
  if (configEntries.some((config) => config.includeAssets)) {
    logWarn(
      chalk.yellowBright(
        "'includeAssets' property of Vivliostyle config was deprecated and will be removed in a future release. Please use 'copyAsset.includes' property instead.",
      ),
    );
  }

  if (configEntries.some((config) => config.tocTitle)) {
    logWarn(
      chalk.yellowBright(
        "'tocTitle' property of Vivliostyle config was deprecated and will be removed in a future release. Please use 'toc.title' property instead.",
      ),
    );
  }

  return {
    cliFlags,
    ...configEntry,
  };
}

export async function mergeConfig<T extends CliFlags>(
  cliFlags: T,
  config: VivliostyleConfigEntry | undefined,
  context: string,
  prevConfig?: MergedConfig,
): Promise<MergedConfig> {
  debug('context directory', context);
  debug('cliFlags', cliFlags);
  debug('vivliostyle.config.js', config);
  let entryContextDir: string;
  let workspaceDir: string;

  if (cliFlags.input && !config && isUrlString(cliFlags.input)) {
    workspaceDir = entryContextDir = cwd;
  } else {
    entryContextDir = upath.resolve(
      cliFlags.input && !config
        ? upath.dirname(upath.resolve(context, cliFlags.input))
        : (contextResolve(context, config?.entryContext) ?? context),
    );
    workspaceDir =
      contextResolve(context, config?.workspaceDir) ?? entryContextDir;
  }
  const themesDir = upath.join(workspaceDir, 'themes');

  const language = cliFlags.language ?? config?.language ?? undefined;
  const readingProgression =
    cliFlags.readingProgression ?? config?.readingProgression ?? undefined;
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
  const pressReady = cliFlags.pressReady ?? config?.pressReady ?? false;
  const renderMode = cliFlags.renderMode ?? 'local';
  const preflight = cliFlags.preflight ?? (pressReady ? 'press-ready' : null);
  const preflightOption = cliFlags.preflightOption ?? [];

  const vfmOptions = {
    ...config?.vfm,
    hardLineBreaks: config?.vfm?.hardLineBreaks ?? false,
    disableFormatHtml: config?.vfm?.disableFormatHtml ?? false,
  };

  const timeout = cliFlags.timeout ?? config?.timeout ?? DEFAULT_TIMEOUT;
  const sandbox = cliFlags.sandbox ?? false;
  const browserType = cliFlags.browser ?? config?.browser ?? 'chromium';
  const executableBrowser =
    cliFlags.executableBrowser ?? getExecutableBrowserPath(browserType);
  const image = cliFlags.image ?? config?.image ?? CONTAINER_IMAGE;
  const httpServer = cliFlags.http ?? config?.http ?? false;
  const viewer = cliFlags.viewer ?? config?.viewer ?? undefined;
  const viewerParam = cliFlags.viewerParam ?? config?.viewerParam ?? undefined;
  const logLevel =
    cliFlags.logLevel ??
    ((cliFlags.verbose && 'verbose') || undefined) ??
    'silent';

  const rootThemes = cliFlags.theme
    ? [
        parseTheme({
          theme: cliFlags.theme,
          context: cwd,
          workspaceDir,
          themesDir,
        }),
      ]
    : config?.theme
      ? [config.theme].flat().map((theme) =>
          parseTheme({
            theme,
            context,
            workspaceDir,
            themesDir,
          }),
        )
      : [];
  const themeIndexes = new Set(rootThemes);

  const outputs = ((): OutputFormat[] => {
    if (cliFlags.targets?.length) {
      return cliFlags.targets.map(({ path: outputPath, format }) => {
        if (format === 'pdf') {
          return {
            path: upath.resolve(outputPath),
            format,
            renderMode,
            preflight,
            preflightOption,
          };
        } else if (format === 'epub') {
          return {
            path: upath.resolve(outputPath),
            format,
            version: EPUB_OUTPUT_VERSION,
          };
        } else {
          return {
            path: upath.resolve(outputPath),
            format,
          };
        }
      });
    }
    if (config?.output) {
      return (
        Array.isArray(config.output) ? config.output : [config.output]
      ).map((target): OutputFormat => {
        const targetObj =
          typeof target === 'string' ? { path: target } : target;
        const outputPath = upath.resolve(context, targetObj.path);
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
        } else if (format === 'epub') {
          return {
            ...targetObj,
            path: outputPath,
            format,
            version: EPUB_OUTPUT_VERSION,
          };
        } else {
          return { ...targetObj, path: outputPath, format };
        }
      });
    }
    // Outputs a pdf file if any output configuration is not set
    const filename = config?.title ? `${config.title}.pdf` : 'output.pdf';
    return [
      {
        path: upath.resolve(context, filename),
        format: 'pdf',
        renderMode,
        preflight,
        preflightOption,
      },
    ];
  })();

  const cover = ((): MergedConfig['cover'] => {
    if (!config?.cover) {
      return undefined;
    }
    const obj =
      typeof config.cover === 'string' ? { src: config.cover } : config.cover;
    if (!('htmlPath' in obj)) {
      obj.htmlPath = COVER_HTML_FILENAME;
    }
    return {
      src: upath.resolve(entryContextDir, obj.src),
      name: obj.name || COVER_HTML_IMAGE_ALT,
      htmlPath:
        (obj.htmlPath && upath.resolve(workspaceDir, obj.htmlPath)) ||
        undefined,
    };
  })();

  const copyAsset = (() => {
    const {
      includes: _includes,
      excludes = [],
      includeFileExtensions = [],
      excludeFileExtensions = [],
    } = config?.copyAsset || {};
    const includes = _includes || [config?.includeAssets ?? []].flat();
    const notAllowedPatternRe = /(^\s*[/\\]|^(.*[/\\])?\s*\.\.\s*([/\\].*)?$)/g;
    // See the special characters of glob pattern
    // https://github.com/mrmlnc/fast-glob
    const notAllowedExtensionRe = /([\\/*?@+!|(){}[\]]|\.\.|^\s*\.)/g;
    Object.entries({ includes, excludes }).forEach(([propName, patterns]) => {
      patterns.forEach((pattern) => {
        if (notAllowedPatternRe.test(pattern)) {
          throw new Error(
            `Invalid pattern was found in copyAsset.${propName} option: ${pattern}`,
          );
        }
      });
    });
    Object.entries({ includeFileExtensions, excludeFileExtensions }).forEach(
      ([propName, patterns]) => {
        patterns.forEach((pattern) => {
          if (notAllowedExtensionRe.test(pattern)) {
            throw new Error(
              `Invalid pattern was found in copyAsset.${propName} option: ${pattern}`,
            );
          }
        });
      },
    );
    return {
      includes,
      excludes,
      fileExtensions: [
        ...new Set([...DEFAULT_ASSET_EXTENSIONS, ...includeFileExtensions]),
      ].filter((ext) => !excludeFileExtensions.includes(ext)),
    };
  })();

  const commonOpts: CommonOpts = {
    entryContextDir,
    workspaceDir,
    themesDir,
    copyAsset,
    outputs,
    themeIndexes,
    rootThemes,
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
    timeout,
    sandbox,
    executableBrowser,
    browserType,
    image,
    httpServer,
    viewer,
    viewerParam,
    logLevel,
  };
  if (!cliFlags.input && !config) {
    throw new Error(
      'No input is set. Please set an appropriate entry or a Vivliostyle config file.',
    );
  }
  const parsedConfig = cliFlags.input
    ? await composeSingleInputConfig(commonOpts, cliFlags, config, prevConfig)
    : await composeProjectConfig(
        commonOpts,
        cliFlags,
        config,
        context,
        prevConfig,
      );
  debug('parsedConfig', JSON.stringify(parsedConfig, null, 2));
  return parsedConfig;
}

type CommonOpts = Omit<
  MergedConfig,
  | 'input'
  | 'entries'
  | 'exportAliases'
  | 'manifestPath'
  | 'needToGenerateManifest'
  | 'epubOpfPath'
  | 'webbookEntryUrl'
  | 'title'
  | 'author'
>;

async function composeSingleInputConfig<T extends CliFlags>(
  otherConfig: CommonOpts,
  cliFlags: T,
  config: VivliostyleConfigEntry | undefined,
  prevConfig?: MergedConfig,
): Promise<MergedConfig> {
  debug('entering single entry config mode');

  let sourcePath: string;
  let input: InputFormat;
  const title = cliFlags.title ?? config?.title;
  const author = cliFlags.author ?? config?.author;
  const workspaceDir = otherConfig.workspaceDir;
  const entries: ParsedEntry[] = [];
  const exportAliases: { source: string; target: string }[] = [];
  const tmpPrefix = `.vs-${Date.now()}.`;

  if (cliFlags.input && isUrlString(cliFlags.input)) {
    sourcePath = cliFlags.input;
    input = { format: 'webbook', entry: sourcePath };
  } else {
    sourcePath = upath.resolve(cliFlags.input);
    input = detectInputFormat(sourcePath);
    // Check file exists
    statFileSync(sourcePath);
  }

  if (input.format === 'markdown') {
    // Single input file; create temporary file
    const type = detectManuscriptMediaType(sourcePath);
    const metadata = parseFileMetadata({ type, sourcePath, workspaceDir });
    const relDir = upath.relative(
      otherConfig.entryContextDir,
      upath.dirname(sourcePath),
    );

    let target: string;
    if (prevConfig) {
      const prevEntry = prevConfig.entries.find((e) => e.source === sourcePath);
      if (!prevEntry) {
        throw new Error('Failed to reload config');
      }
      target = prevEntry.target;
    } else {
      target = upath
        .resolve(
          workspaceDir,
          relDir,
          `${tmpPrefix}${upath.basename(sourcePath)}`,
        )
        .replace(/\.md$/, '.html');
      await touchTmpFile(target);
    }
    const themes = metadata.themes ?? [...otherConfig.rootThemes];
    themes.forEach((t) => otherConfig.themeIndexes.add(t));
    entries.push({
      type,
      source: sourcePath,
      target,
      title: metadata.title,
      themes,
    });
    exportAliases.push({
      source: target,
      target: upath.resolve(
        upath.dirname(target),
        upath.basename(sourcePath).replace(/\.md$/, '.html'),
      ),
    });
  }

  let fallbackTitle: string | undefined;
  const manifestDeclaration = await (async (): Promise<ManifestConfig> => {
    if (input.format === 'markdown') {
      // create temporary manifest file
      const manifestPath = upath.resolve(
        workspaceDir,
        `${tmpPrefix}${MANIFEST_FILENAME}`,
      );
      await touchTmpFile(manifestPath);
      exportAliases.push({
        source: manifestPath,
        target: upath.resolve(workspaceDir, MANIFEST_FILENAME),
      });
      fallbackTitle =
        entries.length === 1 && entries[0].title
          ? (entries[0].title as string)
          : upath.basename(sourcePath);
      return { manifestPath, needToGenerateManifest: true };
    } else if (input.format === 'html' || input.format === 'webbook') {
      const url = isUrlString(input.entry)
        ? new URL(input.entry)
        : pathToFileURL(input.entry);
      // Ensures trailing slash or explicit HTML extensions
      if (
        (url.protocol === 'http:' || url.protocol === 'https:') &&
        !url.pathname.endsWith('/') &&
        !/\.html?$/.test(url.pathname)
      ) {
        url.pathname = `${url.pathname}/`;
      }
      return {
        webbookEntryUrl: url.href,
      };
    } else if (input.format === 'pub-manifest') {
      return { manifestPath: input.entry };
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
    title: title || fallbackTitle,
    author: author,
  };
}

async function composeProjectConfig<T extends CliFlags>(
  otherConfig: CommonOpts,
  cliFlags: T,
  config: VivliostyleConfigEntry | undefined,
  context: string,
  prevConfig?: MergedConfig,
): Promise<MergedConfig> {
  debug('entering project config mode');

  const {
    entryContextDir,
    workspaceDir,
    themesDir,
    themeIndexes,
    rootThemes,
    outputs,
    cover,
  } = otherConfig;
  const pkgJsonPath = upath.resolve(entryContextDir, 'package.json');
  const pkgJson = fs.existsSync(pkgJsonPath)
    ? readJSON(pkgJsonPath)
    : undefined;
  if (pkgJson) {
    debug('located package.json path', pkgJsonPath);
  }
  const exportAliases: { source: string; target: string }[] = [];
  const tmpPrefix = `.vs-${Date.now()}.`;

  const tocConfig = (() => {
    const c =
      typeof config?.toc === 'object'
        ? config.toc
        : typeof config?.toc === 'string'
          ? { htmlPath: config.toc }
          : {};
    return {
      tocTitle: c.title ?? config?.tocTitle ?? TOC_TITLE,
      target: upath.resolve(workspaceDir, c.htmlPath ?? TOC_FILENAME),
      sectionDepth: c.sectionDepth ?? 0,
      transform: {
        transformDocumentList: c.transformDocumentList,
        transformSectionList: c.transformSectionList,
      },
    };
  })();

  const ensureCoverImage = (src?: string) => {
    const absPath = src && upath.resolve(entryContextDir, src);
    if (absPath) {
      statFileSync(absPath, {
        errorMessage: 'Specified cover image does not exist',
      });
    }
    return absPath;
  };

  const projectTitle: string | undefined =
    cliFlags.title ?? config?.title ?? pkgJson?.name;
  const projectAuthor: string | undefined =
    cliFlags.author ?? config?.author ?? pkgJson?.author;

  const isContentsEntry = (entry: EntryObject): entry is ContentsEntryObject =>
    entry.rel === 'contents';
  const isCoverEntry = (entry: EntryObject): entry is CoverEntryObject =>
    entry.rel === 'cover';
  const isArticleEntry = (entry: EntryObject): entry is ArticleEntryObject =>
    !isContentsEntry(entry) && !isCoverEntry(entry);

  async function parseEntry(entry: EntryObject): Promise<ParsedEntry> {
    const getInputInfo = (entryPath: string) => {
      const source = upath.resolve(entryContextDir, entryPath);
      if (!isUrlString(source)) {
        statFileSync(source);
      }
      const type = detectManuscriptMediaType(source);
      return {
        ...parseFileMetadata({
          type,
          sourcePath: source,
          workspaceDir,
          themesDir,
        }),
        source,
        type,
      };
    };

    const getTargetPath = (source: string) =>
      upath.resolve(
        workspaceDir,
        upath.relative(entryContextDir, source).replace(/\.md$/, '.html'),
      );

    if ((isContentsEntry(entry) || isCoverEntry(entry)) && entry.path) {
      const source = upath.resolve(entryContextDir, entry.path);
      try {
        statFileSync(source);
        /* v8 ignore next 10 */
      } catch (error) {
        // For backward compatibility, we allow missing files then assume that option as `output` field.
        logWarn(
          chalk.yellowBright(
            `The "path" option is set but the file does not exist: ${source}\nMaybe you want to set the "output" field instead.`,
          ),
        );
        entry.output = entry.path;
        entry.path = undefined;
      }
    }

    if (isContentsEntry(entry)) {
      const inputInfo = entry.path ? getInputInfo(entry.path) : undefined;
      let target = entry.output
        ? upath.resolve(workspaceDir, entry.output)
        : inputInfo?.source && getTargetPath(inputInfo.source);
      const themes = entry.theme
        ? [entry.theme].flat().map((theme) =>
            parseTheme({
              theme,
              context,
              workspaceDir,
              themesDir,
            }),
          )
        : (inputInfo?.themes ?? [...rootThemes]);
      themes.forEach((t) => themeIndexes.add(t));
      target ??= tocConfig.target;
      if (inputInfo?.source && pathEquals(inputInfo.source, target)) {
        const tmpPath = upath.resolve(
          upath.dirname(target),
          `${tmpPrefix}${upath.basename(target)}`,
        );
        exportAliases.push({ source: tmpPath, target });
        await touchTmpFile(tmpPath);
        target = tmpPath;
      }
      const parsedEntry: ContentsEntry = {
        rel: 'contents',
        ...tocConfig,
        target,
        title: entry.title ?? inputInfo?.title ?? projectTitle,
        themes,
        pageBreakBefore: entry.pageBreakBefore,
        pageCounterReset: entry.pageCounterReset,
        ...(inputInfo && {
          template: { source: inputInfo.source, type: inputInfo.type },
        }),
      };
      return parsedEntry;
    }

    if (isCoverEntry(entry)) {
      const inputInfo = entry.path ? getInputInfo(entry.path) : undefined;
      let target = entry.output
        ? upath.resolve(workspaceDir, entry.output)
        : inputInfo?.source && getTargetPath(inputInfo.source);
      const themes = entry.theme
        ? [entry.theme].flat().map((theme) =>
            parseTheme({
              theme,
              context,
              workspaceDir,
              themesDir,
            }),
          )
        : (inputInfo?.themes ?? []); // Don't inherit rootThemes for cover documents
      themes.forEach((t) => themeIndexes.add(t));
      const coverImageSrc = ensureCoverImage(entry.imageSrc || cover?.src);
      if (!coverImageSrc) {
        throw new Error(
          `A CoverEntryObject is set in the entry list but a location of cover file is not set. Please set 'cover' property in your config file.`,
        );
      }
      target ??= upath.resolve(
        workspaceDir,
        entry.path || cover?.htmlPath || COVER_HTML_FILENAME,
      );
      if (inputInfo?.source && pathEquals(inputInfo.source, target)) {
        const tmpPath = upath.resolve(
          upath.dirname(target),
          `${tmpPrefix}${upath.basename(target)}`,
        );
        exportAliases.push({ source: tmpPath, target });
        await touchTmpFile(tmpPath);
        target = tmpPath;
      }
      const parsedEntry: CoverEntry = {
        rel: 'cover',
        target,
        title: entry.title ?? inputInfo?.title ?? projectTitle,
        themes,
        coverImageSrc,
        coverImageAlt: entry.imageAlt || cover?.name || COVER_HTML_IMAGE_ALT,
        pageBreakBefore: entry.pageBreakBefore,
        ...(inputInfo && {
          template: { source: inputInfo.source, type: inputInfo.type },
        }),
      };
      return parsedEntry;
    }

    if (isArticleEntry(entry)) {
      const inputInfo = getInputInfo(entry.path);
      const target = entry.output
        ? upath.resolve(workspaceDir, entry.output)
        : getTargetPath(inputInfo.source);
      const themes = entry.theme
        ? [entry.theme]
            .flat()
            .map((theme) =>
              parseTheme({ theme, context, workspaceDir, themesDir }),
            )
        : (inputInfo.themes ?? [...rootThemes]);
      themes.forEach((t) => themeIndexes.add(t));

      const parsedEntry: ManuscriptEntry = {
        type: inputInfo.type,
        source: inputInfo.source,
        target,
        title: entry.title ?? inputInfo.title ?? projectTitle,
        themes,
        ...(entry.rel && { rel: entry.rel }),
      };
      return parsedEntry;
    }

    /* v8 ignore next */
    throw new Error('Unknown entry type');
  }

  const entries: ParsedEntry[] = await Promise.all(
    [config?.entry || []].flat().map(normalizeEntry).map(parseEntry),
  );
  if (!entries.length) {
    throw new Error(
      'The entry fields seems to be empty. Make sure your Vivliostyle configuration.',
    );
  }

  let fallbackProjectTitle: string | undefined;
  if (!projectTitle) {
    if (entries.length === 1 && entries[0].title) {
      fallbackProjectTitle = entries[0].title;
    } else {
      fallbackProjectTitle = upath.basename(outputs[0].path);
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
      ...tocConfig,
      themes: [...rootThemes],
    });
  }
  if (cover?.htmlPath && !entries.find(({ rel }) => rel === 'cover')) {
    entries.unshift({
      rel: 'cover',
      target: cover.htmlPath,
      title: projectTitle,
      themes: [], // Don't inherit rootThemes for cover documents
      coverImageSrc: ensureCoverImage(cover.src)!,
      coverImageAlt: cover.name,
    });
  }

  const coverEntires = entries.filter(({ rel }) => rel === 'cover');
  if (coverEntires.length !== new Set(coverEntires.map((v) => v.target)).size) {
    throw new Error(
      'Multiple cover entries which has same output were found. Each cover entries must have an unique path.',
    );
  }

  return {
    ...otherConfig,
    entries,
    input: {
      format: 'pub-manifest',
      entry: upath.join(workspaceDir, MANIFEST_FILENAME),
    },
    exportAliases,
    manifestPath: upath.join(workspaceDir, MANIFEST_FILENAME),
    title: projectTitle || fallbackProjectTitle,
    author: projectAuthor,
    needToGenerateManifest: true,
  };
}
