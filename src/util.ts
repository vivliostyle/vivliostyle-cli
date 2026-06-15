import childProcess, { type ExecFileOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import util from 'node:util';

import { codeFrameColumns } from '@babel/code-frame';
import {
  type JSONValue,
  type ValueNode as JsonValueNode,
  evaluate,
  parse,
} from '@humanwhocodes/momoa';
import type { BrowserPlatform } from '@puppeteer/browsers';
import { Ajv, type Plugin as AjvPlugin, type Schema } from 'ajv';
import formatsPlugin from 'ajv-formats';
import { XMLParser } from 'fast-xml-parser';
import StreamZip from 'node-stream-zip';
import osLocale from 'os-locale';
import resolvePkg from 'resolve-pkg';
import { titleCase } from 'title-case';
import tmp from 'tmp';
import upath from 'upath';
import type { BaseIssue } from 'valibot';
import { gray, red, redBright } from 'yoctocolors';

import type { BrowserType } from './config/schema.js';
import { DEFAULT_BROWSER_VERSIONS, LANGUAGES } from './constants.js';
import { Logger } from './logger.js';
import {
  publicationSchema,
  publicationSchemas,
} from './schema/pub-manifest.js';
import type { PublicationManifest } from './schema/publication.schema.js';

export const cwd = upath.normalize(process.cwd());

const execFile = util.promisify(childProcess.execFile);
export async function exec(
  command: string,
  args: string[] = [],
  options: ExecFileOptions = {},
) {
  const subprocess = await execFile(command, args, {
    ...options,
    encoding: 'utf8',
  });
  subprocess.stdout = subprocess.stdout.trim();
  return subprocess;
}

const cleanupHandlers: (() => void | Promise<void>)[] = [];
const terminationHooks = new Set<(exitCode: number) => void>();
let cleanupPromise: Promise<void> | undefined;
let processTerminationInstalled = false;
let handlingProcessTermination = false;

// Cleanup handlers release resources on normal completion, errors, and process termination.
export const registerCleanupHandler = (
  debugMessage: string,
  handler: () => void | Promise<void>,
  { prepend = false }: { prepend?: boolean } = {},
) => {
  const callback = () => {
    Logger.debug(debugMessage);
    return handler();
  };
  if (prepend) {
    cleanupHandlers.unshift(callback);
  } else {
    cleanupHandlers.push(callback);
  }
  return () => {
    const index = cleanupHandlers.indexOf(callback);
    if (index !== -1) {
      return cleanupHandlers.splice(index, 1)[0];
    }
  };
};

// Termination hooks notify active work before cleanup starts closing resources.
export function registerTerminationHook(hook: (exitCode: number) => void) {
  terminationHooks.add(hook);
  return () => {
    terminationHooks.delete(hook);
  };
}

export function runCleanupHandlers() {
  if (cleanupPromise) {
    return cleanupPromise;
  }
  let resolveCleanup: (() => void) | undefined;
  cleanupPromise = new Promise<void>((resolve) => {
    resolveCleanup = resolve;
  });
  void (async () => {
    while (cleanupHandlers.length) {
      try {
        await cleanupHandlers.shift()?.();
      } catch (e) {
        // NOOP
      }
    }
  })().then(() => resolveCleanup?.());
  return cleanupPromise;
}

async function handleProcessTermination(exitCode: number) {
  if (handlingProcessTermination) {
    return;
  }
  handlingProcessTermination = true;
  for (const hook of terminationHooks) {
    try {
      hook(exitCode);
    } catch (e) {
      // NOOP
    }
  }
  try {
    await runCleanupHandlers();
  } finally {
    process.exit(exitCode);
  }
}

export function setupProcessTermination() {
  if (processTerminationInstalled) {
    return;
  }
  processTerminationInstalled = true;

  process.on('SIGINT', () => void handleProcessTermination(130));
  process.on('SIGTERM', () => void handleProcessTermination(143));
  process.on('SIGHUP', () => void handleProcessTermination(129));
  process.once('exit', () => {
    void runCleanupHandlers();
  });
}

export class DetailError extends Error {
  detail: string | undefined;

  constructor(message: string | undefined, detail: string | undefined) {
    super(message);
    this.detail = detail;
  }
}

export function getFormattedError(err: Error) {
  return err instanceof DetailError
    ? `${err.message}\n${err.detail}`
    : err.stack || `${err.message}`;
}

export async function gracefulError(err: Error) {
  console.log(`${redBright('ERROR')} ${getFormattedError(err)}

${gray('If you think this is a bug, please report at https://github.com/vivliostyle/vivliostyle-cli/issues')}`);
  process.exitCode = 1;
  await runCleanupHandlers();
}

export function readJSON(path: string) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (err) {
    return undefined;
  }
}

export function statFileSync(
  filePath: string,
  {
    errorMessage = 'Specified input does not exist',
  }: { errorMessage?: string } = {},
) {
  try {
    return fs.statSync(filePath);
  } catch (err) {
    if ((err as any).code === 'ENOENT') {
      throw new Error(`${errorMessage}: ${filePath}`, { cause: err });
    }
    throw err;
  }
}

export async function inflateZip(filePath: string, dest: string) {
  return await new Promise<void>((res, rej) => {
    try {
      const zip = new StreamZip({
        file: filePath,
        storeEntries: true,
      });
      zip.on('error', (err) => {
        rej(err);
      });
      zip.on('ready', async () => {
        await util.promisify(zip.extract)(null, dest);
        await util.promisify(zip.close)();
        Logger.debug(`Unzipped ${filePath} to ${dest}`);
        res();
      });
    } catch (err) {
      rej(err);
    }
  });
}

export function useTmpDirectory(): Promise<[string, () => void]> {
  const directory = new Promise<string>((res, rej) => {
    tmp.dir({ unsafeCleanup: true }, (err, path) => {
      if (err) {
        return rej(err);
      }
      Logger.debug(`Created the temporary directory: ${path}`);
      res(path);
    });
  });
  if (import.meta.env?.VITEST) {
    return directory.then((path) => [path, () => {}]);
  }

  let path: string | undefined;
  const callback = () => {
    if (path) {
      fs.rmSync(path, { force: true, recursive: true });
    }
  };
  registerCleanupHandler('Removing the temporary directory', async () => {
    try {
      path = await directory;
    } catch {
      return;
    }
    callback();
  });
  return directory.then((createdPath) => {
    path = createdPath;
    return [createdPath, callback];
  });
}

export function touchTmpFile(path: string): () => void {
  fs.mkdirSync(upath.dirname(path), { recursive: true });
  // Create file if not exist
  fs.closeSync(fs.openSync(path, 'a'));
  Logger.debug(`Created the temporary file: ${path}`);
  const callback = () => {
    fs.rmSync(path, { force: true, recursive: true });
  };
  registerCleanupHandler(`Removing the temporary file: ${path}`, callback);
  return callback;
}

export function pathEquals(path1: string, path2: string): boolean {
  return upath.relative(path1, path2) === '';
}

export function pathContains(parentPath: string, childPath: string): boolean {
  const rel = upath.relative(parentPath, childPath);
  return rel !== '' && !rel.startsWith('..');
}

export function isValidUri(str: string): boolean {
  return /^(https?|file|data):/i.test(str);
}

function cachedFn<T>(fn: () => T): () => T {
  let cache: T | null = null;
  return (): T => cache ?? (cache = fn());
}

export const isInContainer = cachedFn(function isInContainer() {
  return fs.existsSync('/opt/vivliostyle-cli/.vs-cli-version');
});

export const isRunningOnWSL = cachedFn(function isRunningOnWSL() {
  // Detection method based on microsoft/WSL#4071
  return (
    fs.existsSync('/proc/version') &&
    fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')
  );
});

export async function openEpub(epubPath: string, tmpDir: string) {
  const inflation = inflateZip(epubPath, tmpDir);
  const deleteEpub = async () => {
    try {
      await inflation;
    } catch {
      // Remove any partial output after a failed or interrupted extraction.
    }
    fs.rmSync(tmpDir, { force: true, recursive: true });
  };
  registerCleanupHandler(
    `Removing the temporary EPUB directory: ${tmpDir}`,
    deleteEpub,
  );
  await inflation;
  Logger.debug(`Created the temporary EPUB directory: ${tmpDir}`);
  return deleteEpub;
}

export function getDefaultEpubOpfPath(epubDir: string) {
  const containerXmlPath = upath.join(epubDir, 'META-INF/container.xml');
  const xmlParser = new XMLParser({
    ignoreAttributes: false,
  });
  const { container } = xmlParser.parse(
    fs.readFileSync(containerXmlPath, 'utf8'),
  );
  const rootfile = [container.rootfiles.rootfile].flat()[0]; // Only supports a default rendition
  const epubOpfPath = upath.join(epubDir, rootfile['@_full-path']);
  return epubOpfPath;
}

export function getEpubRootDir(epubOpfPath: string) {
  function traverse(dir: string) {
    const files = fs.readdirSync(dir);
    if (
      files.includes('META-INF') &&
      pathEquals(epubOpfPath, getDefaultEpubOpfPath(dir))
    ) {
      return dir;
    }
    const next = upath.dirname(dir);
    if (pathEquals(dir, next)) {
      return;
    }
    return traverse(next);
  }
  return traverse(upath.dirname(epubOpfPath));
}

const getAjvValidatorFunction =
  <T extends Schema>(schema: T, refSchemas?: Schema | Schema[]) =>
  (obj: unknown): obj is T => {
    const ajv = new Ajv({ strict: false });
    // @ts-expect-error: Invalid type
    const addFormats = formatsPlugin as AjvPlugin<unknown>;
    addFormats(ajv);
    if (refSchemas) {
      ajv.addSchema(refSchemas);
    }
    const validate = ajv.compile(schema);
    const valid = validate(obj);
    if (!valid) {
      throw validate.errors?.[0] || new Error();
    }
    return true;
  };

export const assertPubManifestSchema =
  getAjvValidatorFunction<PublicationManifest>(
    publicationSchema as unknown as PublicationManifest,
    publicationSchemas,
  );

export function parseJsonc(rawJsonc: string): JSONValue {
  const ast = parse(rawJsonc, {
    mode: 'jsonc',
    ranges: false,
    tokens: false,
  });
  return evaluate(ast);
}

export function prettifySchemaError(
  rawJsonc: string,
  issues: BaseIssue<unknown>[],
) {
  const parsed = parse(rawJsonc, {
    mode: 'jsonc',
    ranges: false,
    tokens: false,
  });

  // Traverse to the deepest issue
  function traverse(issues: BaseIssue<unknown>[], depth: number) {
    return issues.flatMap((issue): [BaseIssue<unknown>[], number][] => {
      const p = issue.path?.length || 0;
      if (!issue.issues) {
        return [[[issue], depth + p]];
      }
      return traverse(issue.issues, depth + p).map(([i, d]) => [
        [issue, ...i],
        d,
      ]);
    });
  }
  const all = traverse(issues, 0);
  const maxDepth = Math.max(...all.map(([, d]) => d));
  const issuesTraversed = all.find(([, d]) => d === maxDepth)![0];

  let jsonValue = parsed.body as JsonValueNode;
  for (const p of issuesTraversed.flatMap((v) => v.path ?? [])) {
    let childValue: JsonValueNode | undefined;
    if (p.type === 'object' && jsonValue.type === 'Object') {
      childValue = jsonValue.members.find(
        (m) =>
          (m.name.type === 'Identifier' && m.name.name === p.key) ||
          (m.name.type === 'String' && m.name.value === p.key),
      )?.value;
    }
    if (p.type === 'array' && jsonValue.type === 'Array') {
      childValue = jsonValue.elements[p.key]?.value;
    }
    if (childValue) {
      jsonValue = childValue;
    } else {
      break;
    }
  }

  let message = `${red(issuesTraversed.at(-1)!.message)}`;
  if (jsonValue) {
    message += `\n${codeFrameColumns(rawJsonc, jsonValue.loc, {
      highlightCode: true,
    })}`;
  }
  return message;
}

export function writeFileIfChanged(filePath: string, content: Buffer) {
  if (!fs.existsSync(filePath) || !fs.readFileSync(filePath).equals(content)) {
    fs.mkdirSync(upath.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}

let cachedLocale: string | undefined;
export async function getOsLocale(): Promise<string> {
  if (import.meta.env?.VITEST) {
    return process.env.TEST_LOCALE || 'en';
  }
  if (cachedLocale) {
    return cachedLocale;
  }
  const locale = osLocale();

  const langs = Object.keys(LANGUAGES);
  cachedLocale = langs.includes(locale)
    ? locale
    : langs.includes(locale.split('-')[0])
      ? locale.split('-')[0]
      : 'en';
  return cachedLocale;
}

export function toTitleCase<T = unknown>(input: T): T {
  if (typeof input !== 'string') {
    return input;
  }
  return titleCase(
    input.replace(/[\W_]/g, ' ').replace(/\s+/g, ' ').trim(),
  ) as T;
}

export function debounce<T extends (...args: any[]) => unknown>(
  func: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {},
): (...args: Parameters<T>) => void {
  const leading = options.leading ?? false;
  const trailing = options.trailing ?? !leading;
  let timer: NodeJS.Timeout | null = null;
  let pending = false;

  const invoke = (...args: Parameters<T>) => {
    pending = false;
    func(...args);
  };

  return (...args: Parameters<T>) => {
    pending = true;

    if (timer) {
      clearTimeout(timer);
    }

    const callNow = leading && !timer;

    timer = setTimeout(() => {
      const shouldCall = trailing && pending && !(leading && callNow);
      timer = null;
      if (shouldCall) {
        invoke(...args);
      } else {
        pending = false;
      }
    }, wait);

    if (callNow) {
      invoke(...args);
    }
  };
}

export const getCacheDir = cachedFn(function getCacheDir() {
  let osCacheDir: string;
  if (process.platform === 'linux') {
    osCacheDir =
      process.env.XDG_CACHE_HOME || upath.join(os.homedir(), '.cache');
  } else if (process.platform === 'darwin') {
    osCacheDir = upath.join(os.homedir(), 'Library', 'Caches');
  } else if (process.platform === 'win32') {
    osCacheDir =
      process.env.LOCALAPPDATA || upath.join(os.homedir(), 'AppData', 'Local');
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
  return upath.join(osCacheDir, 'vivliostyle');
});

// Detects the browser platform, similar to detectBrowserPlatform in @puppeteer/browsers
// Included here to avoid adding @puppeteer/browsers as a dependency
export const detectBrowserPlatform = cachedFn(function detectBrowserPlatform():
  | BrowserPlatform
  | undefined {
  const platform = process.platform;
  const arch = process.arch;
  switch (platform) {
    case 'darwin':
      return arch === 'arm64'
        ? ('mac_arm' as BrowserPlatform)
        : ('mac' as BrowserPlatform);
    case 'linux':
      return arch === 'arm64'
        ? ('linux_arm' as BrowserPlatform)
        : ('linux' as BrowserPlatform);
    case 'win32':
      return arch === 'x64' ||
        // Windows 11 for ARM supports x64 emulation
        (arch === 'arm64' && isWindows11(os.release()))
        ? ('win64' as BrowserPlatform)
        : ('win32' as BrowserPlatform);
    default:
      return undefined;
  }
});

function isWindows11(version: string): boolean {
  const parts = version.split('.');
  if (parts.length > 2) {
    const major = parseInt(parts[0] as string, 10);
    const minor = parseInt(parts[1] as string, 10);
    const patch = parseInt(parts[2] as string, 10);
    return (
      major > 10 ||
      (major === 10 && minor > 0) ||
      (major === 10 && minor === 0 && patch >= 22000)
    );
  }
  return false;
}

export const getDefaultBrowserTag = (browserType: BrowserType) => {
  if (import.meta.env?.VITEST) {
    return '100.0';
  }
  const platform = detectBrowserPlatform();
  return platform && DEFAULT_BROWSER_VERSIONS[browserType][platform];
};

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

// License for `whichPm`
// The MIT License (MIT)
// Copyright (c) 2017-2022 Zoltan Kochan <z@kochan.io>
// https://github.com/zkochan/packages/tree/main/which-pm-runs
export function whichPm(): PackageManager {
  if (!process.env.npm_config_user_agent) {
    return 'npm';
  }

  const pmSpec = process.env.npm_config_user_agent.split(' ')[0];
  const separatorPos = pmSpec.lastIndexOf('/');
  const name = pmSpec.substring(0, separatorPos);

  return name as PackageManager;
}

export const cliRoot = upath.join(fileURLToPath(import.meta.url), '../..');
export const cliVersion = (() => {
  if (import.meta.env?.VITEST) {
    return '0.0.1';
  }
  const pkg = JSON.parse(
    fs.readFileSync(upath.join(cliRoot, 'package.json'), 'utf8'),
  );
  return pkg.version;
})();

export const viewerRoot = resolvePkg('@vivliostyle/viewer', { cwd: cliRoot });
export const coreVersion = (() => {
  if (import.meta.env?.VITEST) {
    return '0.0.1';
  }
  if (!viewerRoot) {
    return 'Unknown';
  }
  const pkg = JSON.parse(
    fs.readFileSync(upath.join(viewerRoot, 'package.json'), 'utf8'),
  );
  return pkg.version;
})();

export const versionForDisplay = `cli: ${cliVersion}
core: ${coreVersion}`;
