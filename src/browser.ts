import fs from 'fs';
import * as playwright from 'playwright-core';
import { registry } from 'playwright-core/lib/server';
import {
  beforeExitHandlers,
  logInfo,
  logSuccess,
  startLogging,
  stopLogging,
} from './util';

export type BrowserName = 'chromium' | 'firefox' | 'webkit';

export async function launchBrowser(
  browserName: BrowserName,
  options?: playwright.LaunchOptions,
): Promise<playwright.Browser> {
  const browser = await playwright[browserName].launch({
    ...options,
  });
  beforeExitHandlers.push(() => {
    browser.close();
  });
  return browser;
}

export function getExecutableBrowserPath(browserName: BrowserName): string {
  return playwright[browserName].executablePath();
}

export function getFullBrowserName(browserName: BrowserName): string {
  return {
    chromium: 'Chromium',
    firefox: 'Firefox',
    webkit: 'Webkit',
  }[browserName];
}

export function checkBrowserAvailability(path: string): boolean {
  return fs.existsSync(path);
}

export function isPlaywrightExecutable(path: string): boolean {
  return registry.executables().some((exe) => exe.executablePath() === path);
}

export async function downloadBrowser(
  browserName: BrowserName,
): Promise<string> {
  const executable = registry.findExecutable(browserName);
  logInfo('Rendering browser is not installed yet. Downloading now...');
  stopLogging();
  await registry.install([executable], false);
  logSuccess(`Successfully downloaded browser`);
  startLogging();
  return executable.executablePath()!;
}
