import type { InstalledBrowser } from '@puppeteer/browsers';
import fs from 'node:fs';
import type { Browser, LaunchOptions, Page } from 'puppeteer-core';
import upath from 'upath';
import { ResolvedTaskConfig } from './config/resolve.js';
import type { BrowserType } from './config/schema.js';
import { Logger } from './logger.js';
import { importNodeModule } from './node-modules.js';
import {
  getCacheDir,
  isInContainer,
  isRunningOnWSL,
  registerExitHandler,
} from './util.js';

async function launchBrowser({
  browserType,
  proxy,
  executablePath,
  headless,
  noSandbox,
  disableDevShmUsage,
  ignoreHttpsErrors,
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
  noSandbox: boolean;
  disableDevShmUsage: boolean;
  ignoreHttpsErrors: boolean;
}): Promise<Browser> {
  const puppeteer = await importNodeModule('puppeteer-core');
  const commonOptions = {
    executablePath,
    headless: headless && 'shell',
    acceptInsecureCerts: ignoreHttpsErrors,
    env: { ...process.env, LANG: 'en.UTF-8' },
    //  proxy, // FIXME
  } satisfies LaunchOptions;
  const browser = await puppeteer.launch(
    browserType === 'chromium'
      ? {
          ...commonOptions,
          args: [
            ...(noSandbox ? ['--no-sandbox'] : []),
            // #579: disable web security to allow cross-origin requests
            '--disable-web-security',
            ...(disableDevShmUsage ? ['--disable-dev-shm-usage'] : []),
            // #357: Set devicePixelRatio=1 otherwise it causes layout issues in HiDPI displays
            ...(headless ? ['--force-device-scale-factor=1'] : []),
            // #565: Add --disable-gpu option when running on WSL
            ...(isRunningOnWSL() ? ['--disable-gpu'] : []),
            // set Chromium language to English to avoid locale-dependent issues
            '--lang=en',
            ...(process.platform === 'darwin'
              ? ['-AppleLanguages', '(en)'] // Fix for issue #570
              : []),
          ],
        }
      : // TODO: Investigate appropriate settings on Firefox
        commonOptions,
  );
  // const browser = await playwright[browserType].launch(options);
  registerExitHandler('Closing browser', () => {
    browser.close();
  });
  return browser;
}

export async function getExecutableBrowserPath(
  browserType: BrowserType,
): Promise<string> {
  const browsers = await importNodeModule('@puppeteer/browsers');
  const browser = (
    {
      chromium: browsers.Browser.CHROMIUM,
      firefox: browsers.Browser.FIREFOX,
    } as const
  )[browserType];
  const platform = browsers.detectBrowserPlatform();
  if (!platform) {
    throw new Error('The current platform is not supported.');
  }
  const buildId = await browsers.resolveBuildId(browser, platform, '1440670');
  return browsers.computeExecutablePath({
    browser,
    cacheDir: upath.join(getCacheDir(), 'browsers'),
    buildId,
  });
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
  const browsers = await importNodeModule('@puppeteer/browsers');
  const browser = (
    {
      chromium: browsers.Browser.CHROMIUM,
      firefox: browsers.Browser.FIREFOX,
    } as const
  )[browserType];
  const platform = browsers.detectBrowserPlatform();
  if (!platform) {
    throw new Error('The current platform is not supported.');
  }
  const buildId = await browsers.resolveBuildId(browser, platform, '1440670');
  let installedBrowser: InstalledBrowser | undefined;
  {
    using _ = Logger.suspendLogging(
      'Rendering browser is not installed yet. Downloading now.',
    );
    installedBrowser = await browsers.install({
      browser: (
        {
          chromium: browsers.Browser.CHROMIUM,
          firefox: browsers.Browser.FIREFOX,
        } as const
      )[browserType],
      cacheDir: upath.join(getCacheDir(), 'browsers'),
      buildId,
      downloadProgressCallback: 'default',
    });
  }
  return installedBrowser.executablePath;
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
  Logger.debug(`Specified browser path: ${executableBrowser}`);
  if (executableBrowser) {
    if (!checkBrowserAvailability(executableBrowser)) {
      throw new Error(
        `Cannot find the browser. Please check the executable browser path: ${executableBrowser}`,
      );
    }
  } else {
    executableBrowser = await getExecutableBrowserPath(browserConfig.type);
    Logger.debug(`Using default browser: ${executableBrowser}`);
    if (!checkBrowserAvailability(executableBrowser)) {
      // The browser isn't downloaded first time starting CLI so try to download it
      await downloadBrowser(browserConfig.type);
    }
  }

  const browser = await launchBrowser({
    browserType: browserConfig.type,
    proxy,
    executablePath: executableBrowser,
    headless: mode === 'build',
    noSandbox: !sandbox,
    disableDevShmUsage: isInContainer(),
    ignoreHttpsErrors,
  });
  await onBrowserOpen?.(browser);

  const page = (await browser.pages())[0] ?? (await browser.newPage());
  await page.setViewport(
    mode === 'build'
      ? // This viewport size is important to detect headless environment in Vivliostyle viewer
        // https://github.com/vivliostyle/vivliostyle.js/blob/73bcf323adcad80126b0175630609451ccd09d8a/packages/core/src/vivliostyle/vgen.ts#L2489-L2500
        { width: 800, height: 600 }
      : null,
  );
  await onPageOpen?.(page);

  // Prevent confirm dialog from being auto-dismissed
  page.on('dialog', () => {});

  await page.goto(url);

  return { browser, page };
}
