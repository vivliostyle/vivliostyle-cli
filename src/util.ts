import fs from 'fs';
import path from 'path';
import util from 'util';
import portfinder from 'portfinder';
import puppeteer from 'puppeteer';
import debugConstructor from 'debug';
import chalk from 'chalk';
import oraConstructor from 'ora';

export const debug = debugConstructor('vs-cli');

export const ora = oraConstructor({ color: 'blue', spinner: 'circle' });

export function log(...obj: any) {
  console.log('→', ...obj);
}

export function gracefulError(err: Error) {
  console.error(`${chalk.red.bold('Error:')} ${err.message}`);
  console.log(`
  If you think this is a bug, please report at https://github.com/vivliostyle/vivliostyle-cli/issues`);

  process.exit(1);
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
