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

export async function launchBrowser(
  options?: playwright.LaunchOptions,
): Promise<playwright.Browser> {
  const browser = await playwright.chromium.launch({
    ...options,
  });
  beforeExitHandlers.push(() => {
    browser.close();
  });
  return browser;
}

export function getExecutableBrowserPath(): string {
  return playwright.chromium.executablePath();
}

export function checkBrowserAvailability(path: string): boolean {
  return fs.existsSync(path);
}

export function isPlaywrightExecutable(path: string): boolean {
  return registry.executables().some((exe) => exe.executablePath() === path);
}

export async function downloadBrowser(): Promise<string> {
  const executable = registry.findExecutable('chromium');
  logInfo('Rendering browser is not installed yet. Downloading now...');
  stopLogging();
  await registry.install([executable], false);
  logSuccess(`Successfully downloaded browser`);
  startLogging();
  return executable.executablePath()!;
}
