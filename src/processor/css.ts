import fs from 'node:fs';

import postcss from 'postcss';
import postcssrc from 'postcss-load-config';
import valueParser from 'postcss-value-parser';
import { exports as resolvePackageExports } from 'resolve.exports';
import {
  satisfies as semverSatisfies,
  validRange as semverValidRange,
} from 'semver';
import upath from 'upath';

import type { ParsedTheme, ResolvedTaskConfig } from '../config/resolve.js';
import { Logger } from '../logger.js';
import {
  DetailError,
  findPackageDir,
  getFormattedError,
  isFileSync,
  isValidUri,
  pathContains,
  readPackageJson,
  toError,
} from '../util.js';

export interface CssBareImportResolution {
  file: string;
  pkgName: string;
  pkgDir: string;
}

export interface BareImportSpecifier {
  pkgName: string;
  version: string | undefined;
  subpath: string;
}

/**
 * Returns undefined for specifiers that must keep the standard CSS URL
 * semantics (relative or absolute URLs). The package name may carry an
 * npm-style version specifier, e.g. `@scope/pkg@^1.0.0/theme.css`.
 */
export function parseBareImportSpecifier(
  specifier: string,
): BareImportSpecifier | undefined {
  if (!specifier || isValidUri(specifier) || /^[.\/]/v.test(specifier)) {
    return undefined;
  }
  const matched = specifier.match(
    /^(@[^\/@]+\/[^\/@]+|[^@\/][^\/@]*)(?:@([^\/]+))?(?:\/(.*))?$/v,
  );
  if (!matched) {
    return undefined;
  }
  return {
    pkgName: matched[1],
    version: matched[2],
    subpath: matched[3] ?? '',
  };
}

function stripUrlQuery(specifier: string): string {
  return specifier.split(/[?#]/v)[0];
}

export function resolveLocalStyleFile(
  pathCandidate: string,
  contextDir: string,
): string | undefined {
  const file = upath.resolve(contextDir, pathCandidate);
  return file.endsWith('.css') && isFileSync(file) ? file : undefined;
}

function findThemePackageDir(
  pkgName: string,
  importerDir: string,
  themesDir: string,
): string | undefined {
  return (
    // Importers inside the themes directory resolve against their own tree
    // first so that nested node_modules layouts are respected
    findPackageDir(pkgName, importerDir, { boundary: themesDir }) ??
    // The themes directory takes precedence over the project node_modules
    findPackageDir(pkgName, themesDir, { boundary: themesDir }) ??
    // Fall back to the Node.js style resolution walking up from the importer
    findPackageDir(pkgName, importerDir)
  );
}

function resolveExportsSubpath(
  pkgDir: string,
  subpath: '.' | `./${string}`,
): string | undefined {
  const pkgJson = readPackageJson(upath.join(pkgDir, 'package.json'));
  if (pkgJson.exports === undefined || pkgJson.exports === null) {
    return undefined;
  }
  let targets: string[] | undefined;
  try {
    targets =
      resolvePackageExports(pkgJson, subpath, {
        unsafe: true,
        conditions: ['style'],
      }) ?? undefined;
  } catch (error) {
    throw new DetailError(
      `The path ${subpath} is not exported from the package: ${pkgJson.name}`,
      toError(error).message,
    );
  }
  const target = targets?.[0];
  if (!target) {
    return undefined;
  }
  const file = upath.join(pkgDir, target);
  if (!pathContains(pkgDir, file)) {
    throw new DetailError(
      `The exported path ${subpath} escapes the package directory: ${pkgJson.name}`,
      `Resolved to ${file}`,
    );
  }
  if (!fs.existsSync(file)) {
    throw new DetailError(
      `The exported path ${subpath} does not exist in the package: ${pkgJson.name}`,
      `Resolved to ${file}`,
    );
  }
  return file;
}

export function resolvePackageCssEntry(pkgDir: string): string {
  const pkgJson = readPackageJson(upath.join(pkgDir, 'package.json'));
  const declaredStyle = pkgJson.vivliostyle?.theme?.style ?? pkgJson.style;
  if (declaredStyle) {
    const file = upath.join(pkgDir, declaredStyle);
    if (!fs.existsSync(file)) {
      throw new DetailError(
        `Could not find a style file for the theme: ${pkgJson.name}.`,
        `The declared style file does not exist: ${file}`,
      );
    }
    return file;
  }
  let exported: string | undefined;
  try {
    exported = resolveExportsSubpath(pkgDir, '.');
  } catch {
    // Fall back to the main field when the root subpath is not exported
  }
  // Accept only stylesheet results; the default condition may resolve the
  // root subpath to a JavaScript entry point
  if (exported?.endsWith('.css')) {
    return exported;
  }
  if (pkgJson.main) {
    const file = upath.join(pkgDir, pkgJson.main);
    if (fs.existsSync(file)) {
      return file;
    }
  }
  throw new DetailError(
    `Could not find a style file for the theme: ${pkgJson.name}.`,
    'Please ensure this package satisfies a `vivliostyle.theme.style` property.',
  );
}

export function resolvePackageCssSubpath(
  pkgDir: string,
  subpath: string,
): string {
  const normalized = upath.normalize(subpath);
  const exported = resolveExportsSubpath(pkgDir, `./${normalized}`);
  if (exported) {
    return exported;
  }
  const file = upath.join(pkgDir, normalized);
  if (!pathContains(pkgDir, file)) {
    throw new DetailError(
      `The path ${subpath} escapes the package directory`,
      `Resolved to ${file}`,
    );
  }
  if (!isFileSync(file)) {
    throw new DetailError(
      `Could not find the imported path in the package: ${subpath}`,
      `Expected file location: ${file}`,
    );
  }
  return file;
}

export class ThemeCssResolver {
  #workspaceDir: string;
  #themesDir: string;
  #mounts = new Map<string, string>();
  #checkedVersions = new Set<string>();

  constructor({
    workspaceDir,
    themesDir,
  }: Pick<ResolvedTaskConfig, 'workspaceDir' | 'themesDir'>) {
    this.#workspaceDir = workspaceDir;
    this.#themesDir = themesDir;
  }

  /** Mapping of package names to package root directories located outside the workspace */
  get mounts(): ReadonlyMap<string, string> {
    return this.#mounts;
  }

  resolveBareImport(
    specifier: string,
    importer: string,
  ): CssBareImportResolution {
    const parsed = parseBareImportSpecifier(specifier);
    if (!parsed) {
      throw new Error(`Invalid import specifier: ${specifier}`);
    }
    const { pkgName, version, subpath } = parsed;
    const pkgDir = findThemePackageDir(
      pkgName,
      upath.dirname(importer),
      this.#themesDir,
    );
    if (!pkgDir) {
      throw new DetailError(
        `Could not resolve the CSS import: ${specifier} (imported from ${importer})`,
        [
          'The specifier was not found as a file relative to the importing stylesheet,',
          `and the package is not installed: ${pkgName}`,
          `To fix this, install the package in your project: npm install ${version ? `${pkgName}@${version}` : pkgName}`,
        ].join('\n'),
      );
    }
    if (version) {
      this.#warnUnsatisfiedVersion(pkgName, version, pkgDir);
    }
    const file = subpath
      ? resolvePackageCssSubpath(pkgDir, stripUrlQuery(subpath))
      : resolvePackageCssEntry(pkgDir);
    return { file, pkgName, pkgDir };
  }

  #warnUnsatisfiedVersion(
    pkgName: string,
    version: string,
    pkgDir: string,
  ): void {
    const requested = `${pkgName}@${version}`;
    if (this.#checkedVersions.has(requested) || !semverValidRange(version)) {
      return;
    }
    this.#checkedVersions.add(requested);
    const installed = readPackageJson(
      upath.join(pkgDir, 'package.json'),
    ).version;
    if (
      !installed ||
      semverSatisfies(installed, version, { includePrerelease: true })
    ) {
      return;
    }
    Logger.logWarn(
      `The installed theme package ${pkgName}@${installed} does not satisfy the requested version: ${requested}`,
    );
  }

  /**
   * Map a resolved file to its location on the server URL space (rooted at
   * the workspace directory).
   */
  urlPathOf({ file, pkgName, pkgDir }: CssBareImportResolution): string {
    if (pathContains(this.#themesDir, file)) {
      return `/${upath.relative(this.#workspaceDir, file)}`;
    }
    // Known limitation: mounts are keyed by the package name alone, so when
    // multiple instances of the same package exist (e.g. different versions
    // in nested node_modules), their imports are rewritten to the same URL
    // and the instance registered last wins, serving the wrong package for
    // imports rewritten earlier.
    const registered = this.#mounts.get(pkgName);
    if (registered && registered !== pkgDir) {
      Logger.logWarn(
        `The theme package ${pkgName} is imported from multiple locations: ${registered}, ${pkgDir}`,
      );
    }
    this.#mounts.set(pkgName, pkgDir);
    return `/themes/node_modules/${pkgName}/${upath.relative(pkgDir, file)}`;
  }

  /**
   * Map a requested URL pathname under `/themes/node_modules/` back to a file
   * of a registered mount.
   */
  resolveMountedFile(pathname: string): string | undefined {
    const prefix = '/themes/node_modules/';
    if (!pathname.startsWith(prefix)) {
      return undefined;
    }
    const rest = pathname.slice(prefix.length);
    const matched = rest.match(/^(@[^\/]+\/[^\/]+|[^@\/][^\/]*)\/(.+)$/v);
    if (!matched) {
      return undefined;
    }
    const [, pkgName, subpath] = matched;
    const pkgDir = this.#mounts.get(pkgName);
    if (!pkgDir) {
      return undefined;
    }
    const file = upath.join(pkgDir, upath.normalize(subpath));
    if (!pathContains(pkgDir, file) || !isFileSync(file)) {
      return undefined;
    }
    return file;
  }
}

export interface PostcssConfig {
  plugins: postcss.AcceptedPlugin[];
  options: postcss.ProcessOptions;
  file?: string;
}

const postcssConfigCache = new Map<
  string,
  Promise<PostcssConfig | undefined>
>();

export function loadPostcssConfig(
  searchDir: string,
): Promise<PostcssConfig | undefined> {
  const dir = upath.normalize(searchDir);
  let loading = postcssConfigCache.get(dir);
  if (!loading) {
    loading = (async (): Promise<PostcssConfig | undefined> => {
      try {
        const config = await postcssrc({ cwd: dir }, dir);
        Logger.debug('css > postcss config %s', config.file);
        return { ...config, file: upath.normalize(config.file) };
      } catch (error) {
        const { message } = toError(error);
        if (!message.startsWith('No PostCSS Config found')) {
          throw new DetailError('Failed to load the PostCSS config', message);
        }
      }
    })();
    postcssConfigCache.set(dir, loading);
  }
  return loading;
}

export function clearPostcssConfigCache(): void {
  postcssConfigCache.clear();
}

/**
 * Resolve the `postcss` option in the same way as Vite: an object is used as
 * the inline PostCSS config without searching for a config file, and a string
 * specifies the directory to search for the config file from. Temporary
 * server roots have no directory to search, so no config is loaded.
 */
export async function resolvePostcssConfig({
  postcss: postcssOption,
}: Pick<ResolvedTaskConfig, 'postcss'>): Promise<PostcssConfig | undefined> {
  if (typeof postcssOption === 'object') {
    const { plugins = [], ...options } = postcssOption;
    return { plugins, options };
  }
  const loaded =
    typeof postcssOption === 'string'
      ? await loadPostcssConfig(postcssOption)
      : undefined;
  return loaded;
}

function processCss({
  code,
  file,
  postcssConfig,
  plugins = [],
}: {
  code: string;
  file: string;
  postcssConfig: PostcssConfig | undefined;
  plugins?: postcss.AcceptedPlugin[];
}): Promise<postcss.Result> {
  return postcss([...(postcssConfig?.plugins ?? []), ...plugins]).process(
    code,
    { ...postcssConfig?.options, from: file, to: file },
  );
}

interface CssImportRef {
  specifier: string;
  setSpecifier: (value: string) => void;
}

function collectImportRules(
  root: postcss.Root | postcss.Document,
): CssImportRef[] {
  const refs: CssImportRef[] = [];
  root.walkAtRules((atRule) => {
    if (atRule.name.toLowerCase() !== 'import') {
      return;
    }
    const params = valueParser(atRule.params);
    const [node] = params.nodes;
    let urlNode: valueParser.Node | undefined;
    if (node?.type === 'string') {
      urlNode = node;
    } else if (
      node?.type === 'function' &&
      node.value.toLowerCase() === 'url'
    ) {
      const inner = node.nodes[0];
      if (inner && (inner.type === 'string' || inner.type === 'word')) {
        urlNode = inner;
      }
    }
    if (!urlNode) {
      return;
    }
    const target = urlNode;
    refs.push({
      specifier: target.value,
      setSpecifier: (value) => {
        target.value = value;
        atRule.params = valueParser.stringify(params.nodes);
      },
    });
  });
  return refs;
}

/**
 * Rewrite npm-style bare specifiers in `@import` rules into relative URLs
 * that work on the server URL space. Specifiers that resolve as relative
 * files keep the standard CSS semantics and are left untouched. The plugins
 * of the project's PostCSS config run before the rewriting, so that the
 * `@import` rules they emit are rewritten as well.
 */
export async function transformCssImports({
  code,
  importer,
  importerUrlPath,
  resolver,
  postcssConfig,
}: {
  code: string;
  importer: string;
  importerUrlPath: string;
  resolver: ThemeCssResolver;
  postcssConfig?: PostcssConfig | undefined;
}): Promise<{ code: string; modified: boolean; errors: Error[] }> {
  const errors: Error[] = [];
  let modified = false;
  const rewriteImports: postcss.Plugin = {
    postcssPlugin: 'vivliostyle:rewrite-css-imports',
    OnceExit(root) {
      for (const ref of collectImportRules(root)) {
        const { specifier } = ref;
        if (!specifier || isValidUri(specifier) || specifier.startsWith('/')) {
          continue;
        }
        // Prefer the standard CSS semantics: a specifier pointing to an
        // existing .css file relative to the importing stylesheet is kept as is
        if (
          resolveLocalStyleFile(
            stripUrlQuery(specifier),
            upath.dirname(importer),
          )
        ) {
          continue;
        }
        if (!parseBareImportSpecifier(specifier)) {
          continue;
        }
        try {
          const resolution = resolver.resolveBareImport(specifier, importer);
          const targetUrlPath = resolver.urlPathOf(resolution);
          ref.setSpecifier(
            upath.relative(upath.dirname(importerUrlPath), targetUrlPath),
          );
          modified = true;
        } catch (error) {
          errors.push(toError(error));
        }
      }
    },
  };

  let result: postcss.Result;
  try {
    result = await processCss({
      code,
      file: importer,
      postcssConfig,
      plugins: [rewriteImports],
    });
  } catch (error) {
    return { code, modified: false, errors: [toError(error)] };
  }
  for (const warning of result.warnings()) {
    Logger.logWarn(warning.toString());
  }
  const processed = (postcssConfig?.plugins.length ?? 0) > 0;
  return { code: modified || processed ? result.css : code, modified, errors };
}

async function walkCssImports({
  entryFiles,
  postcssConfig,
  resolveBareImport,
}: {
  entryFiles: string[];
  postcssConfig?: PostcssConfig | undefined;
  resolveBareImport: (
    parsed: BareImportSpecifier,
    specifier: string,
    importer: string,
  ) => string | undefined;
}): Promise<{
  visited: Set<string>;
  dependencies: Set<string>;
  errors: Error[];
}> {
  const visited = new Set<string>();
  const dependencies = new Set<string>();
  const errors: Error[] = [];
  const queue = entryFiles.map((file) => upath.normalize(file));
  let file: string | undefined;
  while ((file = queue.shift()) !== undefined) {
    if (visited.has(file) || !fs.existsSync(file)) {
      continue;
    }
    visited.add(file);
    if (!file.endsWith('.css')) {
      continue;
    }
    let result: postcss.Result;
    try {
      result = await processCss({
        code: fs.readFileSync(file, 'utf8'),
        file,
        postcssConfig,
      });
    } catch (error) {
      errors.push(toError(error));
      continue;
    }
    // Plugins report the extra files they read, which also need watching
    for (const message of result.messages) {
      if (message.type === 'dependency' && typeof message.file === 'string') {
        dependencies.add(upath.normalize(message.file));
      }
    }
    for (const ref of collectImportRules(result.root)) {
      const { specifier } = ref;
      if (!specifier || isValidUri(specifier) || specifier.startsWith('/')) {
        continue;
      }
      const relFile = resolveLocalStyleFile(
        stripUrlQuery(specifier),
        upath.dirname(file),
      );
      if (relFile) {
        queue.push(upath.normalize(relFile));
        continue;
      }
      const parsed = parseBareImportSpecifier(specifier);
      if (!parsed) {
        continue;
      }
      try {
        const resolved = resolveBareImport(parsed, specifier, file);
        if (resolved) {
          queue.push(upath.normalize(resolved));
        }
      } catch (error) {
        errors.push(toError(error));
      }
    }
  }
  return { visited, dependencies, errors };
}

export async function scanCssDependencies({
  entryFiles,
  resolver,
  postcssConfig,
}: {
  entryFiles: string[];
  resolver: ThemeCssResolver;
  postcssConfig?: PostcssConfig | undefined;
}): Promise<{ files: string[]; errors: Error[] }> {
  const { visited, dependencies, errors } = await walkCssImports({
    entryFiles,
    postcssConfig,
    resolveBareImport: (_parsed, specifier, importer) =>
      resolver.resolveBareImport(specifier, importer).file,
  });
  return { files: [...new Set([...visited, ...dependencies])], errors };
}

/**
 * Discover the theme packages referred from `@import` rules that need to be
 * installed into the themes directory, before running the installation. Only
 * the stylesheets readable at this point are scanned: the CSS files and the
 * local packages configured as themes, and the files they import. Packages
 * fetched from the npm registry are not traversed. Packages already
 * resolvable from the project are omitted, unless the import requests a
 * version that the resolved package does not satisfy.
 */
export async function collectCssPackageImports({
  themeIndexes,
  postcssConfig,
}: {
  themeIndexes: Set<ParsedTheme>;
  postcssConfig?: PostcssConfig | undefined;
}): Promise<Map<string, string>> {
  const entryFiles: string[] = [];
  const localPackageDirs = new Map<string, string>();
  const configuredSpecifiers = new Map<string, string>();
  const resolvePackageFile = (
    pkgDir: string,
    subpath: string | undefined,
  ): string | undefined => {
    try {
      return subpath
        ? resolvePackageCssSubpath(pkgDir, subpath)
        : resolvePackageCssEntry(pkgDir);
    } catch (error) {
      // The resolution failure is reported by the scan after the installation
      Logger.debug('css > skipped scanning a theme import %o', error);
    }
  };
  for (const theme of themeIndexes) {
    if (theme.type === 'file') {
      entryFiles.push(theme.source);
      continue;
    }
    if (theme.type !== 'package') {
      continue;
    }
    configuredSpecifiers.set(theme.name, theme.specifier);
    if (theme.registry) {
      continue;
    }
    // Scan local packages at their source locations, which are available
    // regardless of the installation state
    localPackageDirs.set(theme.name, theme.specifier);
    for (const locator of theme.importPath
      ? [theme.importPath].flat()
      : [undefined]) {
      const entry = resolvePackageFile(theme.specifier, locator);
      if (entry) {
        entryFiles.push(entry);
      }
    }
  }

  const discovered = new Map<string, string>();
  await walkCssImports({
    entryFiles,
    postcssConfig,
    resolveBareImport: (
      { pkgName, version, subpath },
      _specifier,
      importer,
    ) => {
      const localPackageDir = localPackageDirs.get(pkgName);
      if (localPackageDir) {
        if (version) {
          Logger.logWarn(
            `The requested version ${pkgName}@${version} is ignored because the theme is configured as a local package: ${localPackageDir}`,
          );
        }
        return resolvePackageFile(
          localPackageDir,
          subpath ? stripUrlQuery(subpath) : undefined,
        );
      }
      const configured = configuredSpecifiers.get(pkgName);
      if (configured !== undefined) {
        if (version && configured !== `${pkgName}@${version}`) {
          Logger.logWarn(
            `The requested version ${pkgName}@${version} conflicts with the configured theme ${configured}. The configured theme takes precedence.`,
          );
        }
        return;
      }
      const projectPackageDir = findPackageDir(
        pkgName,
        upath.dirname(importer),
      );
      if (projectPackageDir) {
        if (!version) {
          return;
        }
        const installed = readPackageJson(
          upath.join(projectPackageDir, 'package.json'),
        ).version;
        if (
          installed &&
          semverValidRange(version) &&
          semverSatisfies(installed, version, { includePrerelease: true })
        ) {
          return;
        }
      }
      const specifier = version ? `${pkgName}@${version}` : pkgName;
      const existing = discovered.get(pkgName);
      if (existing !== undefined) {
        if (existing !== specifier) {
          Logger.logWarn(
            `The theme package ${pkgName} is imported with conflicting versions: ${existing}, ${specifier}. Using ${existing}.`,
          );
        }
        return;
      }
      discovered.set(pkgName, specifier);
    },
  });
  return discovered;
}

/**
 * With `preferSource`, file themes are read from their source locations
 * rather than the workspace copies, which is suitable for watching the files
 * the author edits.
 */
export function collectThemeCssEntryFiles(
  themeIndexes: Set<ParsedTheme>,
  { preferSource = false }: { preferSource?: boolean } = {},
): { files: string[]; errors: Error[] } {
  const files: string[] = [];
  const errors: Error[] = [];
  for (const theme of themeIndexes) {
    if (theme.type === 'file') {
      files.push(
        preferSource || !fs.existsSync(theme.location)
          ? theme.source
          : theme.location,
      );
      continue;
    }
    if (theme.type !== 'package' || !fs.existsSync(theme.location)) {
      continue;
    }
    if (theme.importPath) {
      for (const locator of [theme.importPath].flat()) {
        try {
          files.push(resolvePackageCssSubpath(theme.location, locator));
        } catch (error) {
          errors.push(
            new Error(
              `Could not find a style path ${locator} for the theme: ${theme.name}.`,
              { cause: error },
            ),
          );
        }
      }
    } else {
      try {
        files.push(resolvePackageCssEntry(theme.location));
      } catch (error) {
        errors.push(toError(error));
      }
    }
  }
  return { files, errors };
}

/**
 * Throws when an import of the configured themes cannot be resolved, so that
 * builds fail fast instead of generating outputs referring to missing
 * stylesheets.
 */
export async function validateThemeCssDependencies(
  config: Pick<
    ResolvedTaskConfig,
    'workspaceDir' | 'themesDir' | 'themeIndexes' | 'postcss'
  >,
): Promise<void> {
  const resolver = new ThemeCssResolver(config);
  const entries = collectThemeCssEntryFiles(config.themeIndexes);
  const { errors } = await scanCssDependencies({
    entryFiles: entries.files,
    resolver,
    postcssConfig: await resolvePostcssConfig(config),
  });
  const allErrors = [...entries.errors, ...errors];
  if (allErrors.length === 1) {
    throw allErrors[0];
  }
  if (allErrors.length > 0) {
    throw new DetailError(
      'Failed to resolve the CSS imports of the configured themes',
      allErrors.map((error) => getFormattedError(error)).join('\n\n'),
    );
  }
}
