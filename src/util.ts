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
import lcid from 'lcid';
import StreamZip from 'node-stream-zip';
import childProcess, { type ExecFileOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import readline from 'node:readline';
import util from 'node:util';
import { osLocale } from 'os-locale';
import { titleCase } from 'title-case';
import tmp from 'tmp';
import upath from 'upath';
import type { BaseIssue } from 'valibot';
import { gray, red, redBright } from 'yoctocolors';
import type { BrowserType } from './config/schema.js';
import { DEFAULT_BROWSER_VERSIONS, languages } from './const.js';
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

const beforeExitHandlers: (() => void | Promise<void>)[] = [];
let exitHandlersRun = false;

export const registerExitHandler = (
  debugMessage: string,
  handler: () => void | Promise<void>,
) => {
  const callback = () => {
    Logger.debug(debugMessage);
    return handler();
  };
  beforeExitHandlers.push(callback);
  return () => {
    const index = beforeExitHandlers.indexOf(callback);
    if (index !== -1) {
      return beforeExitHandlers.splice(index, 1)[0];
    }
  };
};

export async function runExitHandlers() {
  if (exitHandlersRun) return;
  exitHandlersRun = true;
  while (beforeExitHandlers.length) {
    try {
      await beforeExitHandlers.shift()?.();
    } catch (e) {
      // NOOP
    }
  }
}

// Windows does not support SIGINT/SIGTERM signals natively, so only register 'exit'
// On other platforms, register all signals
const exitSignals =
  process.platform === 'win32' ? ['exit'] : ['exit', 'SIGINT', 'SIGTERM'];

exitSignals.forEach((sig) => {
  process.once(sig, async (signal?: string | number, exitCode?: number) => {
    // For signals (not 'exit'), wait for handlers to complete
    if (sig !== 'exit') {
      await runExitHandlers();
    } else {
      // For 'exit' event, run handlers synchronously (non-blocking)
      // as async operations cannot be awaited in 'exit' handler
      void runExitHandlers();
    }
    if (process.exitCode === undefined) {
      process.exitCode =
        exitCode !== undefined ? 128 + exitCode : Number(signal);
    }
    // Only call process.exit() for signals, not for 'exit' event.
    // Calling process.exit() inside 'exit' handler prevents other
    // 'exit' listeners from being executed.
    if (sig !== 'exit') {
      process.exit();
    }
  });
});

if (process.platform === 'win32') {
  // Windows does not support signals, so use readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on('SIGINT', async () => {
    await runExitHandlers();
    // Exit code 130 = 128 + SIGINT (2)
    process.exit(130);
  });
  registerExitHandler('Closing readline interface', () => {
    rl.close();
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

export function gracefulError(err: Error) {
  console.log(`${redBright('ERROR')} ${getFormattedError(err)}

${gray('If you think this is a bug, please report at https://github.com/vivliostyle/vivliostyle-cli/issues')}`);

  process.exit(1);
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
      throw new Error(`${errorMessage}: ${filePath}`);
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
  return new Promise<[string, () => void]>((res, rej) => {
    tmp.dir({ unsafeCleanup: true }, (err, path, clear) => {
      if (err) {
        return rej(err);
      }
      Logger.debug(`Created the temporary directory: ${path}`);
      if (import.meta.env?.VITEST) {
        return res([path, () => {}]);
      }
      const callback = () => {
        // clear function doesn't work well?
        // clear();
        fs.rmSync(path, { force: true, recursive: true });
      };
      registerExitHandler(
        `Removing the temporary directory: ${path}`,
        callback,
      );
      res([path, callback]);
    });
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
  registerExitHandler(`Removing the temporary file: ${path}`, callback);
  return callback;
}

export function pathEquals(path1: string, path2: string): boolean {
  return upath.relative(path1, path2) === '';
}

export function pathContains(parentPath: string, childPath: string): boolean {
  const rel = upath.relative(parentPath, childPath);
  // If relative path is absolute (different drives on Windows), they are not related
  return rel !== '' && !rel.startsWith('..') && !upath.isAbsolute(rel);
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
  await inflateZip(epubPath, tmpDir);
  Logger.debug(`Created the temporary EPUB directory: ${tmpDir}`);
  const deleteEpub = () => {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  };
  registerExitHandler(
    `Removing the temporary EPUB directory: ${tmpDir}`,
    deleteEpub,
  );
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
  // It uses the same implementation as os-locale, but prioritizes the OS language settings on Windows and macOS.
  if (cachedLocale) {
    return cachedLocale;
  }
  let locale: string | undefined;
  if (process.platform === 'win32') {
    const { stdout } = await exec('wmic', ['os', 'get', 'locale']);
    const lcidCode = Number.parseInt(stdout.replace('Locale', ''), 16);
    locale = lcid.from(lcidCode);
  }
  if (process.platform === 'darwin') {
    const results = await Promise.all([
      exec('defaults', ['read', '-globalDomain', 'AppleLocale']).then(
        ({ stdout }) => stdout,
      ),
      exec('locale', ['-a']).then(({ stdout }) => stdout),
    ]);
    if (results[1].includes(results[0])) {
      locale = results[0];
    }
  }
  if (locale) {
    locale = locale.replace(/_/, '-');
  } else {
    locale = await osLocale();
  }

  const langs = Object.keys(languages);
  locale = langs.includes(locale)
    ? locale
    : langs.includes(locale.split('-')[0])
      ? locale.split('-')[0]
      : 'en';
  return (cachedLocale = locale.replace(/_/, '-'));
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
