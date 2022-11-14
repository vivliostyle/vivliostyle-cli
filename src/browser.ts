import fs from 'fs';
import * as playwright from 'playwright-core';
import { registry } from 'playwright-core/lib/server';
import type { BrowserType } from './schema/vivliostyleConfig.schema';
import {
  beforeExitHandlers,
  logInfo,
  logSuccess,
  pathEquals,
  startLogging,
  stopLogging,
} from './util';

export async function launchBrowser({
  browserType,
  executablePath,
  headless,
  noSandbox,
  disableWebSecurity,
  disableDevShmUsage,
}: {
  browserType: BrowserType;
  executablePath: string;
  headless: boolean;
  noSandbox?: boolean;
  disableWebSecurity?: boolean;
  disableDevShmUsage?: boolean;
}): Promise<playwright.Browser> {
  const options =
    browserType === 'chromium'
      ? {
          executablePath,
          chromiumSandbox: !noSandbox,
          // We don't use Playwright's preset for headless Chrome to set `headless: 'chrome'` option
          // https://github.com/vivliostyle/vivliostyle-cli/pull/280
          headless: false,
          args: [
            // Preset of Playwright: https://github.com/microsoft/playwright/blob/e69c3f12e6f07ee9e737446ba22f20cb669d7211/packages/playwright-core/src/server/chromium/chromium.ts#L287-L294
            ...(headless
              ? [
                  '--headless=chrome', //'--headless',
                  '--hide-scrollbars',
                  '--mute-audio',
                  '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
                ]
              : []),
            '--allow-file-access-from-files',
            disableWebSecurity ? '--disable-web-security' : '',
            disableDevShmUsage ? '--disable-dev-shm-usage' : '',
          ],
        }
      : // TODO: Investigate appropriate settings on Firefox & Webkit
        { executablePath, headless };
  const browser = await playwright[browserType].launch(options);
  beforeExitHandlers.push(() => {
    browser.close();
  });
  return browser;
}

export function getExecutableBrowserPath(browserType: BrowserType): string {
  return playwright[browserType].executablePath();
}

export function getFullBrowserName(browserType: BrowserType): string {
  return {
    chromium: 'Chromium',
    firefox: 'Firefox',
    webkit: 'Webkit',
  }[browserType];
}

export function checkBrowserAvailability(path: string): boolean {
  return fs.existsSync(path);
}

export function isPlaywrightExecutable(path: string): boolean {
  return registry
    .executables()
    .some((exe) => pathEquals(exe.executablePath() ?? '', path));
}

export async function downloadBrowser(
  browserType: BrowserType,
): Promise<string> {
  const executable = registry.findExecutable(browserType);
  logInfo('Rendering browser is not installed yet. Downloading now...');
  stopLogging();
  await registry.install([executable], false);
  logSuccess(`Successfully downloaded browser`);
  startLogging();
  return executable.executablePath()!;
}
