import chalk from 'chalk';
import debugConstructor from 'debug';
import fs from 'fs';
import StreamZip from 'node-stream-zip';
import oraConstructor from 'ora';
import puppeteer from 'puppeteer';
import shelljs from 'shelljs';
import tmp from 'tmp';
import upath from 'upath';
import util from 'util';

export const debug = debugConstructor('vs-cli');
export const cwd = upath.normalize(process.cwd());

const ora = oraConstructor({ color: 'blue', spinner: 'circle' });

let beforeExitHandlers: (() => void)[] = [];
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

export function gracefulError(err: Error) {
  const message = err.stack
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
    if (err.code === 'ENOENT') {
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

type PuppeteerLaunchOptions = Parameters<typeof puppeteer.launch>[0];
type Browser = ReturnType<typeof puppeteer.launch>;
export async function launchBrowser(options?: PuppeteerLaunchOptions): Browser {
  // process listener of puppeteer won't handle signal
  // because it doesn't support subprocess which is spawned by CLI
  const browser = await puppeteer.launch({
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    ...options,
  });
  beforeExitHandlers.push(() => {
    browser.close();
  });
  return browser;
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

export function encodeHashParameter(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => {
      if (!/^[a-zA-Z0-9_]+$/.test(k)) {
        return '';
      }
      const value = v
        .replace('%', '%25')
        .replace('+', '%2B')
        .replace('&', '%26')
        .replace('=', '%3D')
        .replace(' ', '+');
      return `${k}=${value}`;
    })
    .join('&');
}

export function pathStartsWith(path1: string, path2: string): boolean {
  const path1n = upath.normalize(path1).replace(/\/?$/, '/');
  const path2n = upath.normalize(path2).replace(/\/?$/, '/');
  return path1n.startsWith(path2n);
}
