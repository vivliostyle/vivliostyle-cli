import fs from 'node:fs';
import type { Browser, Page } from 'playwright-core';
import { ResolvedTaskConfig } from './config/resolve.js';
import type { BrowserType } from './config/schema.js';
import { Logger } from './logger.js';
import { importNodeModule } from './node-modules.js';
import { isInContainer, isRunningOnWSL, registerExitHandler } from './util.js';

async function launchBrowser({
  browserType,
  proxy,
  executablePath,
  headless,
  noSandbox,
  disableDevShmUsage,
}: {
  browserType: BrowserType;
  proxy:
    | {
        server: string;
        bypass: string | undefined;
        username: string | undefined;
        password: string | undefined;
      }
    | undefined;
  executablePath: string;
  headless: boolean;
  noSandbox?: boolean;
  disableDevShmUsage?: boolean;
}): Promise<Browser> {
  const playwright = await importNodeModule('playwright-core');
  playwright.firefox.executablePath;
  const options =
    browserType === 'chromium'
      ? {
          executablePath,
          chromiumSandbox: !noSandbox,
          headless,
          args: [
            // #579: disable web security to allow cross-origin requests
            '--disable-web-security',
            ...(disableDevShmUsage ? ['--disable-dev-shm-usage'] : []),
            // #357: Set devicePixelRatio=1 otherwise it causes layout issues in HiDPI displays
            ...(headless ? ['--force-device-scale-factor=1'] : []),
            // #565: Add --disable-gpu option when running on WSL
            ...(isRunningOnWSL() ? ['--disable-gpu'] : []),
            // set Chromium language to English to avoid locale-dependent issues
            '--lang=en',
            ...(!headless && process.platform === 'darwin'
              ? ['', '-AppleLanguages', '(en)'] // Fix for issue #570
              : []),
          ],
          env: { ...process.env, LANG: 'en.UTF-8' },
          proxy: proxy,
        }
      : // TODO: Investigate appropriate settings on Firefox & Webkit
        { executablePath, headless };
  const browser = await playwright[browserType].launch(options);
  registerExitHandler('Closing browser', () => {
    browser.close();
  });
  return browser;
}

export async function getExecutableBrowserPath(
  browserType: BrowserType,
): Promise<string> {
  const playwright = await importNodeModule('playwright-core');
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

export async function downloadBrowser(
  browserType: BrowserType,
): Promise<string> {
  const { registry } = await importNodeModule('playwright-core/lib/server');
  const executable = registry.findExecutable(browserType);
  {
    using _ = Logger.suspendLogging(
      'Rendering browser is not installed yet. Downloading now.',
    );
    await registry.install([executable], false);
  }
  return executable.executablePath()!;
}

export async function launchPreview({
  mode,
  url,
  onBrowserOpen,
  onPageOpen,
  config: { browser: browserConfig, proxy, sandbox, ignoreHttpsErrors },
}: {
  mode: 'preview' | 'build';
  url: string;
  onBrowserOpen?: (browser: Browser) => void | Promise<void>;
  onPageOpen?: (page: Page) => void | Promise<void>;
  config: Pick<
    ResolvedTaskConfig,
    'browser' | 'proxy' | 'sandbox' | 'ignoreHttpsErrors'
  >;
}) {
  let executableBrowser = browserConfig.executablePath;
  if (executableBrowser) {
    if (!checkBrowserAvailability(executableBrowser)) {
      throw new Error(
        `Cannot find the browser. Please check the executable browser path: ${executableBrowser}`,
      );
    }
  } else {
    executableBrowser = await getExecutableBrowserPath(browserConfig.type);
    if (!checkBrowserAvailability(executableBrowser)) {
      // The browser isn't downloaded first time starting CLI so try to download it
      await downloadBrowser(browserConfig.type);
    }
  }
  Logger.debug(`Executing browser path: ${executableBrowser}`);

  const browser = await launchBrowser({
    browserType: browserConfig.type,
    proxy,
    executablePath: executableBrowser,
    headless: mode === 'build',
    noSandbox: !sandbox,
    disableDevShmUsage: isInContainer(),
  });
  await onBrowserOpen?.(browser);

  const page = await browser.newPage({
    viewport:
      mode === 'build'
        ? // This viewport size important to detect headless environment in Vivliostyle viewer
          // https://github.com/vivliostyle/vivliostyle.js/blob/73bcf323adcad80126b0175630609451ccd09d8a/packages/core/src/vivliostyle/vgen.ts#L2489-L2500
          {
            width: 800,
            height: 600,
          }
        : null,
    ignoreHTTPSErrors: ignoreHttpsErrors,
  });
  await onPageOpen?.(page);

  // Prevent confirm dialog from being auto-dismissed
  page.on('dialog', () => {});

  await page.goto(url);

  return { browser, page };
}
