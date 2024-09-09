import { codeFrameColumns } from '@babel/code-frame';
import {
  ValueNode as JsonValueNode,
  evaluate,
  parse,
} from '@humanwhocodes/momoa';
import AjvModule, { ErrorObject, Schema } from 'ajv';
import AjvFormatsModule from 'ajv-formats';
import betterAjvErrors, { IInputOptions } from 'better-ajv-errors';
import chalk from 'chalk';
import debugConstructor from 'debug';
import fastGlob from 'fast-glob';
import { XMLParser } from 'fast-xml-parser';
import { Options as GlobbyOptions, globby } from 'globby';
import gitIgnore, { Ignore } from 'ignore';
import StreamZip from 'node-stream-zip';
import fs from 'node:fs';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import util from 'node:util';
import oraConstructor from 'ora';
import portfinder from 'portfinder';
import slash from 'slash';
import tmp from 'tmp';
import { BaseIssue } from 'valibot';
import {
  copy,
  copySync,
  move,
  moveSync,
  remove,
  removeSync,
  upath,
} from '../vendors/index.js';
import { publicationSchema, publicationSchemas } from './schema/pubManifest.js';
import type { PublicationManifest } from './schema/publication.schema.js';

export { copy, copySync, move, moveSync, remove, removeSync, upath };

export const debug = debugConstructor('vs-cli');
export const cwd = upath.normalize(process.cwd());

const ora = oraConstructor({
  color: 'blue',
  spinner: 'circle',
  // Prevent stream output in docker so that not to spawn process
  // In other environment, check TTY context
  isEnabled: checkContainerEnvironment() ? false : undefined,
});

export let beforeExitHandlers: (() => void)[] = [];
export function runExitHandlers() {
  while (beforeExitHandlers.length) {
    try {
      beforeExitHandlers.shift()?.();
    } catch (e) {
      // NOOP
    }
  }
}

const exitSignals = ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP'];
exitSignals.forEach((sig) => {
  process.on(sig, () => {
    runExitHandlers();
    if (sig !== 'exit') {
      process.exit(1);
    }
  });
});

if (process.platform === 'win32') {
  // Windows does not support signals, so use readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on('SIGINT', () => {
    runExitHandlers();
    process.exit(1);
  });
  beforeExitHandlers.push(() => {
    rl.close();
  });
}

/**
 * 0: silent
 * 1: info
 * 2: verbose
 * 3: debug
 */
let logLevel: 0 | 1 | 2 | 3 = 0;
export function setLogLevel(level?: 'silent' | 'info' | 'verbose' | 'debug') {
  if (!level) {
    return;
  }
  logLevel = {
    silent: 0 as const,
    info: 1 as const,
    verbose: 2 as const,
    debug: 3 as const,
  }[level];
  if (logLevel >= 3) {
    debugConstructor.enable('vs-cli');
  }
}

/**
 * @returns A function that stops logging
 */
export function startLogging(text?: string): typeof stopLogging {
  if (logLevel < 1) {
    return () => {};
  }
  // If text is not set, erase previous log with space character
  ora.start(text ?? ' ');
  return stopLogging;
}

/**
 * @returns A function that starts logging again
 */
export function suspendLogging(
  text?: string,
  symbol?: string,
): (text?: string) => void {
  if (logLevel < 1) {
    return () => {};
  }
  const { isSpinning, text: previousLoggingText } = ora;
  stopLogging(text, symbol);
  return (text) => {
    isSpinning ? startLogging(text || previousLoggingText) : ora.info(text);
  };
}

// NOTE: This function is intended to be used in conjunction with startLogging function,
// so it is not intentionally exported.
function stopLogging(text?: string, symbol?: string) {
  if (logLevel < 1) {
    return;
  }
  if (!text) {
    ora.stop();
    return;
  }
  ora.stopAndPersist({ text, symbol });
}

export function log(...obj: any) {
  if (logLevel < 1) {
    return;
  }
  console.log(...obj);
}

export function logUpdate(...obj: string[]) {
  if (logLevel < 1) {
    return;
  }
  if (ora.isSpinning) {
    ora.text = obj.join(' ');
  } else {
    ora.info(obj.join(' '));
  }
}

export function logSuccess(...obj: string[]) {
  if (logLevel < 1) {
    return;
  }
  const { isSpinning, text } = ora;
  ora.succeed(obj.join(' '));
  if (isSpinning) {
    startLogging(text);
  }
}

export function logError(...obj: string[]) {
  if (logLevel < 1) {
    return;
  }
  const { isSpinning, text } = ora;
  ora.fail(obj.join(' '));
  if (isSpinning) {
    startLogging(text);
  }
}

export function logWarn(...obj: string[]) {
  if (logLevel < 1) {
    return;
  }
  const { isSpinning, text } = ora;
  ora.warn(obj.join(' '));
  if (isSpinning) {
    startLogging(text);
  }
}

export function logInfo(...obj: string[]) {
  if (logLevel < 1) {
    return;
  }
  const { isSpinning, text } = ora;
  ora.info(obj.join(' '));
  if (isSpinning) {
    startLogging(text);
  }
}

export class DetailError extends Error {
  constructor(
    message: string | undefined,
    public detail: string | undefined,
  ) {
    super(message);
  }
}

export function gracefulError<T extends Error>(err: T) {
  const message =
    err instanceof DetailError
      ? `${chalk.red.bold('Error:')} ${err.message}\n${err.detail}`
      : err.stack
        ? err.stack.replace(/^Error:/, chalk.red.bold('Error:'))
        : `${chalk.red.bold('Error:')} ${err.message}`;

  if (ora.isSpinning) {
    ora.fail(message);
  } else {
    console.error(message);
  }
  console.log(
    chalk.gray(`
If you think this is a bug, please report at https://github.com/vivliostyle/vivliostyle-cli/issues`),
  );

  process.exit(1);
}

// Filter errors for human readability
// ref. https://github.com/atlassian/better-ajv-errors/issues/76
export function filterRelevantAjvErrors(
  allErrors: ErrorObject[],
): ErrorObject[] {
  function split<T>(items: T[], splitFn: (item: T) => boolean): [T[], T[]] {
    return [items.filter(splitFn), items.filter((error) => !splitFn(error))];
  }
  function removeShadowingErrors(
    singleErrors: ErrorObject[],
    metaErrors: ErrorObject[],
  ): ErrorObject[] {
    return singleErrors.filter((error) => {
      if (
        metaErrors.some((metaError) =>
          error.instancePath.startsWith(metaError.instancePath),
        )
      ) {
        return !singleErrors.some(
          (otherError) =>
            otherError.instancePath.startsWith(error.instancePath) &&
            otherError.instancePath.length > error.instancePath.length,
        );
      } else {
        return true;
      }
    });
  }
  function mergeTypeErrorsByPath(typeErrors: ErrorObject[]): ErrorObject[] {
    const typeErrorsByPath = typeErrors.reduce(
      (acc, error) => {
        const key = error.instancePath;
        return {
          ...acc,
          [key]: [...(acc[key] ?? []), error],
        };
      },
      {} as Record<string, ErrorObject[]>,
    );
    return Object.values(typeErrorsByPath).map(mergeTypeErrors);

    function mergeTypeErrors(typeErrors: ErrorObject[]): ErrorObject {
      const params = {
        type: typeErrors.map((error) => error.params.type).join(','),
      };
      return {
        ...typeErrors[0],
        params,
      };
    }
  }

  const META_SCHEMA_KEYWORDS = Object.freeze(['anyOf', 'allOf', 'oneOf']);

  // Split the meta errors from what I call "single errors" (the real errors)
  const [metaErrors, singleErrors] = split(allErrors, (error) =>
    META_SCHEMA_KEYWORDS.includes(error.keyword),
  );
  // Filter out the single errors we want to show
  const nonShadowedSingleErrors = removeShadowingErrors(
    singleErrors,
    metaErrors,
  );
  // We're handling type errors differently, split them out
  const [typeErrors, nonTypeErrors] = split(
    nonShadowedSingleErrors,
    (error) => error.keyword === 'type',
  );
  // Filter out the type errors that already have other errors as well.
  // For example when setting `logLevel: 4`, we don't want to see the error specifying that logLevel should be a string,
  // if the other error already specified that it should be one of the enum values.
  const nonShadowingTypeErrors = typeErrors.filter(
    (typeError) =>
      !nonTypeErrors.some(
        (nonTypeError) => nonTypeError.instancePath === typeError.instancePath,
      ),
  );
  const typeErrorsMerged = mergeTypeErrorsByPath(nonShadowingTypeErrors);
  return [...nonTypeErrors, ...typeErrorsMerged];
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
        debug(`Unzipped ${filePath} to ${dest}`);
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
      debug(`Created the temporary directory: ${path}`);
      const callback = () => {
        // clear function doesn't work well?
        // clear();
        removeSync(path);
        debug(`Removed the temporary directory: ${path}`);
      };
      beforeExitHandlers.push(callback);
      res([path, callback]);
    });
  });
}

export async function touchTmpFile(path: string): Promise<() => void> {
  fs.mkdirSync(upath.dirname(path), { recursive: true });
  // Create file if not exist
  fs.closeSync(fs.openSync(path, 'a'));
  debug(`Created the temporary file: ${path}`);
  const callback = () => {
    removeSync(path);
    debug(`Removed the temporary file: ${path}`);
  };
  beforeExitHandlers.push(callback);
  return callback;
}

export function pathEquals(path1: string, path2: string): boolean {
  return upath.relative(path1, path2) === '';
}

export function pathContains(parentPath: string, childPath: string): boolean {
  const rel = upath.relative(parentPath, childPath);
  return rel !== '' && !rel.startsWith('..');
}

export function isUrlString(str: string): boolean {
  return /^(https?|file|data):/i.test(str);
}

export function findAvailablePort(): Promise<number> {
  portfinder.basePort = 13000;
  return portfinder.getPortPromise();
}

export function checkContainerEnvironment(): boolean {
  return fs.existsSync('/opt/vivliostyle-cli/.vs-cli-version');
}

// Mostly the same as the globby implementation, with some overrides
// for ignorefile lookups to avoid circular references by symbolic links
export async function safeGlob(
  patterns: string | readonly string[],
  options: GlobbyOptions,
): Promise<string[]> {
  type FsAdapter = Required<
    NonNullable<NonNullable<Parameters<typeof globby>[1]>['fs']>
  >;

  const symbolicLinkSet = new Set<string>();
  const customFs = {
    readdir: function customReaddir(filepath, options, callback) {
      return fs.readdir(filepath, options, (err, files) => {
        if (err) {
          callback(err, files);
          return;
        }
        const filtered = files.filter((dirent) => {
          if (!dirent.isSymbolicLink()) {
            return true;
          }
          const dirpath = upath.join(filepath, dirent.name);
          // Omit nested symbolic link from readdir result and avoid cyclic exploring
          if ([...symbolicLinkSet].some((v) => pathContains(v, dirpath))) {
            return false;
          }
          symbolicLinkSet.add(dirpath);
          return true;
        });
        callback(null, filtered);
      });
    } as FsAdapter['readdir'],
  };

  const parseIgnoreFile = (
    file: { filePath: string; content: string },
    cwd: string,
  ) => {
    const base = slash(upath.relative(cwd, upath.dirname(file.filePath)));
    return file.content
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((pattern) =>
        pattern.startsWith('!')
          ? `!${upath.posix.join(base, pattern.slice(1))}`
          : upath.posix.join(base, pattern),
      );
  };

  const getIgnoreFilter = async (): Promise<(pattern: string) => boolean> => {
    const filePatterns = [
      ...[options.ignoreFiles ?? []].flat(),
      options.gitignore ? '**/.gitignore' : [],
    ].flat();
    if (filePatterns.length === 0) {
      return () => true;
    }

    const cwd =
      options.cwd instanceof URL
        ? fileURLToPath(options.cwd)
        : (options.cwd as string) || process.cwd();
    const paths = await fastGlob(filePatterns, {
      cwd,
      fs: customFs,
      ignore: ['**/node_modules', '**/flow-typed', '**/coverage', '**/.git'],
      absolute: true,
      dot: true,
    });

    const files = await Promise.all(
      paths.map(async (filePath) => ({
        filePath,
        content: await fs.promises.readFile(filePath, 'utf8'),
      })),
    );
    const patterns = files.flatMap((file) => parseIgnoreFile(file, cwd));
    const ignores = ((gitIgnore as any)() as Ignore).add(patterns);
    const toRelativePath = (pwttern: string, cwd: string) => {
      cwd = slash(cwd);
      if (upath.isAbsolute(pwttern)) {
        if (slash(pwttern).startsWith(cwd)) {
          return upath.relative(cwd, pwttern);
        }
        throw new Error(`Path ${pwttern} is not in cwd ${cwd}`);
      }
      return pwttern;
    };
    return (pattern: string) => {
      pattern = toRelativePath(pattern, cwd);
      return !ignores.ignores(slash(pattern));
    };
  };

  const [filter, result] = await Promise.all([
    getIgnoreFilter(),
    globby(patterns, {
      ...options,
      gitignore: false,
      ignoreFiles: [],
      fs: customFs,
    }),
  ]);
  return result.filter(filter);
}

export async function openEpubToTmpDirectory(filePath: string): Promise<{
  dest: string;
  epubOpfPath: string;
  deleteEpub: () => void;
}> {
  const [tmpDir, deleteEpub] = await useTmpDirectory();
  await inflateZip(filePath, tmpDir);

  const containerXmlPath = upath.join(tmpDir, 'META-INF/container.xml');
  const xmlParser = new XMLParser({
    ignoreAttributes: false,
  });
  const { container } = xmlParser.parse(
    fs.readFileSync(containerXmlPath, 'utf8'),
  );
  const rootfile = [container.rootfiles.rootfile].flat()[0]; // Only supports a default rendition
  const epubOpfPath = upath.join(tmpDir, rootfile['@_full-path']);
  return { dest: tmpDir, epubOpfPath, deleteEpub };
}

// FIXME: https://github.com/ajv-validator/ajv/issues/2047
const Ajv = AjvModule.default;
const addFormats = AjvFormatsModule.default;

const getValidatorFunction =
  <T extends Schema>(schema: T, refSchemas?: Schema | Schema[]) =>
  (obj: unknown, errorFormatOption?: IInputOptions): obj is T => {
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    if (refSchemas) {
      ajv.addSchema(refSchemas);
    }
    const validate = ajv.compile(schema);
    const valid = validate(obj);
    if (!valid) {
      const detailMessage =
        validate.errors &&
        betterAjvErrors(
          schema,
          obj,
          filterRelevantAjvErrors(validate.errors),
          errorFormatOption,
        );
      throw detailMessage || new Error();
    }
    return true;
  };

export const assertPubManifestSchema =
  getValidatorFunction<PublicationManifest>(
    publicationSchema,
    publicationSchemas,
  );

export function parseJsonc(rawJsonc: string) {
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

  let message = `${chalk.red(issuesTraversed.at(-1)!.message)}`;
  if (jsonValue) {
    message += `\n${codeFrameColumns(rawJsonc, jsonValue.loc, {
      highlightCode: true,
    })}`;
  }
  return message;
}
