import path from 'path';
import fs from 'fs';
import process from 'process';
import pkgUp from 'pkg-up';
import resolvePkg from 'resolve-pkg';

export interface ParsedTheme {
  type: 'path' | 'uri';
  name: string;
  location: string;
}

export interface Entry {
  path: string;
  title?: string;
  theme?: string;
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
  toc?: boolean | string;
  size?: string;
  pressReady?: boolean;
  timeout?: number;
}

export function ctxPath(
  context: string,
  loc: string | undefined,
): string | undefined {
  return loc && path.resolve(context, loc);
}

export function parseTheme(themeString: unknown): ParsedTheme | undefined {
  if (typeof themeString !== 'string') {
    return undefined;
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

export function collectVivliostyleConfig(
  configPath: string,
): VivliostyleConfig | undefined {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  return require(configPath) as VivliostyleConfig;
}

export function getVivliostyleConfigPath(configPath?: string) {
  const cwd = process.cwd();
  return configPath
    ? path.resolve(cwd, configPath)
    : path.join(cwd, 'vivliostyle.config.js');
}

export async function mergeConfig<T extends { [index: string]: any }>(
  cliFlags: T,
  config: VivliostyleConfig | undefined,
  context: string,
) {
  const pkgJsonPath = await pkgUp();
  const pkgJson = pkgJsonPath ? require(pkgJsonPath) : undefined;

  // attempt to load config
  const distDir = path.resolve(
    ctxPath(context, config?.outDir) || '.vivliostyle',
  );
  const artifactDirName = 'artifacts';
  const artifactDir = path.join(distDir, artifactDirName);

  // merge config
  const projectTitle = cliFlags.title || config?.title || pkgJson?.name;
  const projectAuthor = cliFlags.author || config?.author || pkgJson?.author;
  const language = config?.language || 'en';
  const outFile = path.resolve(
    cliFlags.outFile || ctxPath(context, config?.outFile) || './output.pdf',
  );
  const size = cliFlags.size || config?.size;
  const contextDir = path.resolve(
    cliFlags.rootDir || ctxPath(context, config?.entryContext) || '.',
  );
  const toc = config?.toc || true;
  const pressReady = cliFlags.pressReady || config?.pressReady || false;
  const verbose = cliFlags.verbose || false;
  const timeout = cliFlags.timeout || config?.timeout || 3000;
  const sandbox = cliFlags.sandbox || true;
  const loadMode = cliFlags.loadMode || 'book';
  const executableChromium = cliFlags.executableChromium;

  const themeIndex: ParsedTheme[] = [];
  const projectTheme = cliFlags.theme || config?.theme;
  const rootTheme = projectTheme ? parseTheme(projectTheme) : undefined;
  if (rootTheme) {
    themeIndex.push(rootTheme);
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

  return {
    contextDir,
    artifactDir,
    projectTitle,
    themeIndex,
    rawEntries,
    distDir,
    projectAuthor,
    language,
    toc,
    outFile,
    size,
    pressReady,
    verbose,
    timeout,
    loadMode,
    sandbox,
    executableChromium,
  };
}
