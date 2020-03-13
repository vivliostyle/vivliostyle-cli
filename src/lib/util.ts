import fs from 'fs';
import path from 'path';
import util from 'util';
import portfinder from 'portfinder';
import debugConstructor from 'debug';
import puppeteer from 'puppeteer';

type ResolveFunction<T> = (value?: T | PromiseLike<T>) => void;
type RejectFunction = (reason?: any) => void;

export const debug = debugConstructor('vivliostyle-cli');

export function log(...obj: any) {
  console.log('===>', ...obj);
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

export function findAvailablePort(): Promise<number> {
  portfinder.basePort = 13000;
  return portfinder.getPortPromise();
}

export async function findEntryPointFile(
  target: string,
  root: string,
): Promise<string> {
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) {
    return path.relative(root, target);
  }
  const files = fs.readdirSync(target);
  const index = [
    'index.html',
    'index.htm',
    'index.xhtml',
    'index.xht',
  ].find((n) => files.includes(n));
  if (index) {
    return path.relative(root, path.resolve(target, index));
  }

  // give up finding entrypoint
  return path.relative(root, target);
}

export function retry(
  fn: Function,
  { timeout, freq = 1000 }: { timeout: number; freq?: number },
): Promise<void> {
  let time = 0;

  function innerFunction(
    resolve: ResolveFunction<void>,
    reject: RejectFunction,
  ) {
    setTimeout(async () => {
      if (time > timeout) {
        return reject(
          new Error(
            `Failed because build process exceeded timeout limit ${timeout}ms. Try it again with --timeout option.`,
          ),
        );
      }

      try {
        await Promise.resolve(fn());
        resolve();
      } catch (err) {
        debug(err.message);
      }

      time += freq;
      innerFunction(resolve, reject);
    }, freq);
  }

  return new Promise((resolve, reject) => innerFunction(resolve, reject));
}

export async function launchBrowser(
  options?: puppeteer.LaunchOptions,
): Promise<puppeteer.Browser> {
  // process listener of puppeteer won't handle signal
  // because it doesn't support subprocess which is spawned by CLI
  const browser = await puppeteer.launch({
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    ...options,
  });
  (['SIGINT', 'SIGTERM', 'SIGHUP'] as NodeJS.Signals[]).forEach((sig) => {
    process.on(sig, () => {
      browser.close();
      process.exit(1);
    });
  });
  return browser;
}
