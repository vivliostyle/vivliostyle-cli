import fs from 'fs';
import { performance } from 'perf_hooks';
import puppeteer, { PuppeteerNode } from 'puppeteer-core';
import {
  beforeExitHandlers,
  debug,
  logInfo,
  logSuccess,
  logUpdate,
  startLogging,
} from './util';

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

export function checkAvailableBrowserPath(): string | undefined {
  const executablePath = ((puppeteer as unknown) as PuppeteerNode).executablePath();
  return fs.existsSync(executablePath) ? executablePath : undefined;
}

export async function downloadBrowser(): Promise<string> {
  const browserFetcher = ((puppeteer as unknown) as PuppeteerNode).createBrowserFetcher(
    {},
  );
  const revision = ((puppeteer as unknown) as PuppeteerNode)._preferredRevision;
  const revisionInfo = browserFetcher.revisionInfo(revision);
  debug('trying download browser, revision info', revisionInfo);

  const toMegabytes = (bytes: number) =>
    `${(bytes / 1024 / 1024).toFixed(1)} Mb`;
  let time = performance.now();
  const onProgress = (downloadedBytes: number, totalBytes: number) => {
    const now = performance.now();
    if (now - time < 100) {
      return;
    }
    time = now;
    const progressLen = 16;
    const completeLen = Math.round(
      (downloadedBytes / totalBytes) * progressLen,
    );
    const progressBar = `[${Array(completeLen + 1).join('=')}${Array(
      progressLen - completeLen + 1,
    ).join(' ')}]`;
    logUpdate(
      `Downloading Browser: ${progressBar} ${toMegabytes(
        downloadedBytes,
      )} / ${toMegabytes(totalBytes)}`,
    );
  };

  logInfo(
    'Rendering browser (Chromium) is not installed yet. Downloading now...',
  );
  startLogging('Downloading Browser');
  await browserFetcher.download(revision, onProgress);
  logSuccess(`Successfully downloaded browser`);
  startLogging();

  return revisionInfo.executablePath;
}
