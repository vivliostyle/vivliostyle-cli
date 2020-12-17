import chalk from 'chalk';
import debugConstructor from 'debug';
import fs from 'fs';
import oraConstructor from 'ora';
import portfinder from 'portfinder';
import puppeteer from 'puppeteer';
import path from 'upath';
import util from 'util';

export const debug = debugConstructor('vs-cli');

const ora = oraConstructor({ color: 'blue', spinner: 'circle' });

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
