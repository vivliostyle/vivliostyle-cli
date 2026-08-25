import fs from 'node:fs';

import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { exports as resolvePackageExports } from 'resolve.exports';
import upath from 'upath';

import type { ParsedTheme, ResolvedTaskConfig } from '../config/resolve.js';
import { Logger } from '../logger.js';
import {
  DetailError,
  pathContains,
  pathEquals,
  readPackageJson,
  toError,
} from '../util.js';

const urlSchemeRe = /^[a-z][a-z0-9+.\-]*:/iv;

export interface CssBareImportResolution {
  file: string;
  pkgName: string;
  pkgDir: string;
}

/**
 * Parse a CSS import specifier as an npm-style bare specifier. Returns
 * undefined for specifiers that must keep the standard CSS URL semantics
 * (relative or absolute URLs).
 */
export function parseBareImportSpecifier(
  specifier: string,
): { pkgName: string; subpath: string } | undefined {
  if (!specifier || urlSchemeRe.test(specifier) || /^[.\/]/v.test(specifier)) {
    return undefined;
  }
  const matched = specifier.match(
    /^(@[^\/]+\/[^\/]+|[^@\/][^\/]*)(?:\/(.*))?$/v,
  );
  if (!matched) {
    return undefined;
  }
  return { pkgName: matched[1], subpath: matched[2] ?? '' };
}

function stripUrlQuery(specifier: string): string {
  return specifier.split(/[?#]/v)[0];
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve a specifier as a local stylesheet path. A specifier qualifies only
 * when it points to an existing file with the `.css` extension; this is the
 * shared criterion distinguishing local files from npm package names, used
 * both for the `theme` config field and for CSS `@import` rules.
 */
export function resolveLocalStyleFile(
  pathCandidate: string,
  contextDir: string,
): string | undefined {
  const file = upath.resolve(contextDir, pathCandidate);
  return file.endsWith('.css') && isFile(file) ? file : undefined;
}

function findPackageDir(
  pkgName: string,
  importerDir: string,
  themesDir: string,
): string | undefined {
  const findInNodeModules = (dir: string) => {
    const candidate = upath.join(dir, 'node_modules', pkgName);
    return fs.existsSync(upath.join(candidate, 'package.json'))
      ? candidate
      : undefined;
  };
  // Importers inside the themes directory resolve against their own tree
  // first so that nested node_modules layouts are respected
  let dir = importerDir;
  while (pathEquals(themesDir, dir) || pathContains(themesDir, dir)) {
    const found = findInNodeModules(dir);
    if (found) {
      return found;
    }
    dir = upath.dirname(dir);
  }
  // The themes directory takes precedence over the project node_modules
  const fromThemes = findInNodeModules(themesDir);
  if (fromThemes) {
    return fromThemes;
  }
  // Fall back to the Node.js module resolution walking up from the importer
  dir = importerDir;
  while (true) {
    const found = findInNodeModules(dir);
    if (found) {
      return found;
    }
    const parent = upath.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
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

/**
 * Locate the default style entry of a theme package:
 * `vivliostyle.theme.style` -> `style` -> `exports["."]` (with the `style`
 * condition) -> `main`.
 */
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

/**
 * Locate a file inside a theme package specified by a subpath. When the
 * package declares the `exports` field, the subpath is resolved through it
 * with the `style` condition; otherwise it is resolved as a plain file path.
 */
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
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new DetailError(
      `Could not find the imported path in the package: ${subpath}`,
      `Expected file location: ${file}`,
    );
  }
  return file;
}

/**
 * Resolves npm-style bare specifiers appearing in CSS `@import` rules.
 * Resolution never installs anything; it only looks up packages already
 * installed either in the project or in the themes directory. Packages
 * resolved outside the workspace are registered as "mounts" so that servers
 * and copy steps can expose them under the `themes/node_modules` URL space.
 */
export class ThemeCssResolver {
  #workspaceDir: string;
  #themesDir: string;
  #mounts = new Map<string, string>();

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
    const { pkgName, subpath } = parsed;
    const pkgDir = findPackageDir(
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
          `To fix this, install the package in your project: npm install ${pkgName}`,
        ].join('\n'),
      );
    }
    const file = subpath
      ? resolvePackageCssSubpath(pkgDir, stripUrlQuery(subpath))
      : resolvePackageCssEntry(pkgDir);
    return { file, pkgName, pkgDir };
  }

  /**
   * Map a resolved file to its location on the server URL space (rooted at
   * the workspace directory).
   */
  urlPathOf({ file, pkgName, pkgDir }: CssBareImportResolution): string {
    if (pathContains(this.#workspaceDir, file)) {
      return `/${upath.relative(this.#workspaceDir, file)}`;
    }
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
   * of a registered mount. Returns undefined when the pathname does not
   * belong to any mount.
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
    if (
      !pathContains(pkgDir, file) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      return undefined;
    }
    return file;
  }
}

interface CssImportRef {
  specifier: string;
  setSpecifier: (value: string) => void;
}

function collectImportRules(root: postcss.Root): CssImportRef[] {
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
 * files keep the standard CSS semantics and are left untouched.
 */
export function transformCssImports({
  code,
  importer,
  importerUrlPath,
  resolver,
}: {
  code: string;
  importer: string;
  importerUrlPath: string;
  resolver: ThemeCssResolver;
}): { code: string; modified: boolean; errors: Error[] } {
  let root: postcss.Root;
  try {
    root = postcss.parse(code, { from: importer });
  } catch (error) {
    return { code, modified: false, errors: [toError(error)] };
  }
  const errors: Error[] = [];
  let modified = false;
  for (const ref of collectImportRules(root)) {
    const { specifier } = ref;
    if (
      !specifier ||
      urlSchemeRe.test(specifier) ||
      specifier.startsWith('/')
    ) {
      continue;
    }
    // Prefer the standard CSS semantics: a specifier pointing to an existing
    // .css file relative to the importing stylesheet is kept as is
    if (
      resolveLocalStyleFile(stripUrlQuery(specifier), upath.dirname(importer))
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
  return { code: modified ? root.toString() : code, modified, errors };
}

/**
 * Walk the CSS import graph starting from the given entry files, resolving
 * both relative and bare imports. Returns all visited files and the errors
 * found on the way. This never installs anything; it is used to validate the
 * graph ahead of the build and to collect files to watch.
 */
export function scanCssDependencies({
  entryFiles,
  resolver,
}: {
  entryFiles: string[];
  resolver: ThemeCssResolver;
}): { files: string[]; errors: Error[] } {
  const visited = new Set<string>();
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
    let root: postcss.Root;
    try {
      root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
    } catch (error) {
      errors.push(toError(error));
      continue;
    }
    for (const ref of collectImportRules(root)) {
      const { specifier } = ref;
      if (
        !specifier ||
        urlSchemeRe.test(specifier) ||
        specifier.startsWith('/')
      ) {
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
      if (!parseBareImportSpecifier(specifier)) {
        continue;
      }
      try {
        const resolution = resolver.resolveBareImport(specifier, file);
        queue.push(upath.normalize(resolution.file));
      } catch (error) {
        errors.push(toError(error));
      }
    }
  }
  return { files: [...visited], errors };
}

/**
 * Collect the CSS files where the import graph of the configured themes
 * starts. With `preferSource`, file themes are read from their source
 * locations rather than the workspace copies, which is suitable for watching
 * the files the author edits.
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
 * Validate the CSS import graph of the configured themes. Throws a
 * DetailError when an import cannot be resolved so that builds fail fast
 * instead of generating outputs referring to missing stylesheets.
 */
export function validateThemeCssDependencies(
  config: Pick<
    ResolvedTaskConfig,
    'workspaceDir' | 'themesDir' | 'themeIndexes'
  >,
): void {
  const resolver = new ThemeCssResolver(config);
  const entries = collectThemeCssEntryFiles(config.themeIndexes);
  const { errors } = scanCssDependencies({
    entryFiles: entries.files,
    resolver,
  });
  const allErrors = [...entries.errors, ...errors];
  if (allErrors.length === 1) {
    throw allErrors[0];
  }
  if (allErrors.length > 0) {
    throw new DetailError(
      'Failed to resolve the CSS imports of the configured themes',
      allErrors
        .map((error) =>
          error instanceof DetailError
            ? `${error.message}\n${error.detail}`
            : error.message,
        )
        .join('\n\n'),
    );
  }
}
