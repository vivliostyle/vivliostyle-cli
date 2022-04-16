import { ErrorObject } from 'ajv';
import chalk from 'chalk';
import debugConstructor from 'debug';
import fs from 'fs';
import StreamZip from 'node-stream-zip';
import oraConstructor from 'ora';
import portfinder from 'portfinder';
import shelljs from 'shelljs';
import tmp from 'tmp';
import upath from 'upath';
import util from 'util';

export const debug = debugConstructor('vs-cli');
export const cwd = upath.normalize(process.cwd());

const ora = oraConstructor({ color: 'blue', spinner: 'circle' });

export let beforeExitHandlers: (() => void)[] = [];
const exitSignals = ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP'];
exitSignals.forEach((sig) => {
  process.on(sig, (code: number) => {
    while (beforeExitHandlers.length) {
      try {
        beforeExitHandlers.shift()?.();
      } catch (e) {
        // NOOP
      }
    }
    process.exit(code);
  });
});

export function startLogging(text?: string) {
  ora.start(text);
}

export function stopLogging(text?: string, symbol?: string) {
  if (!text) {
    ora.stop();
    return;
  }
  ora.stopAndPersist({ text, symbol });
}

export function log(...obj: any) {
  console.log(...obj);
}

export function logUpdate(...obj: string[]) {
  ora.text = obj.join(' ');
}

export function logSuccess(...obj: string[]) {
  ora.succeed(obj.join(' '));
}

export function logError(...obj: string[]) {
  ora.fail(obj.join(' '));
}

export function logInfo(...obj: string[]) {
  ora.info(obj.join(' '));
}

export class DetailError extends Error {
  constructor(message: string | undefined, public detail: string | undefined) {
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
          error.dataPath.startsWith(metaError.dataPath),
        )
      ) {
        return !singleErrors.some(
          (otherError) =>
            otherError.dataPath.startsWith(error.dataPath) &&
            otherError.dataPath.length > error.dataPath.length,
        );
      } else {
        return true;
      }
    });
  }
  function mergeTypeErrorsByPath(typeErrors: ErrorObject[]): ErrorObject[] {
    const typeErrorsByPath = typeErrors.reduce((acc, error) => {
      const key = error.dataPath;
      return {
        ...acc,
        [key]: [...(acc[key] ?? []), error],
      };
    }, {} as Record<string, ErrorObject[]>);
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
        (nonTypeError) => nonTypeError.dataPath === typeError.dataPath,
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

export async function statFile(filePath: string) {
  try {
    return util.promisify(fs.stat)(filePath);
  } catch (err) {
    if ((err as any).code === 'ENOENT') {
      throw new Error(`Specified input doesn't exists: ${filePath}`);
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
        shelljs.rm('-rf', path);
        debug(`Removed the temporary directory: ${path}`);
      };
      beforeExitHandlers.push(callback);
      res([path, callback]);
    });
  });
}

export async function touchTmpFile(path: string): Promise<() => void> {
  shelljs.touch(path);
  debug(`Created the temporary file: ${path}`);
  const callback = () => {
    shelljs.rm('-f', path);
    debug(`Removed the temporary file: ${path}`);
  };
  beforeExitHandlers.push(callback);
  return callback;
}

export function pathStartsWith(path1: string, path2: string): boolean {
  const path1n = upath.normalize(path1).replace(/\/?$/, '/');
  const path2n = upath.normalize(path2).replace(/\/?$/, '/');
  return path1n.startsWith(path2n);
}

export function isUrlString(str: string): boolean {
  return /^(https?|file|data):/i.test(str);
}

export function findAvailablePort(): Promise<number> {
  portfinder.basePort = 13000;
  return portfinder.getPortPromise();
}
