import type {
  InstalledBrowser,
  Browser as SupportedBrowser,
} from '@puppeteer/browsers';
import fs from 'node:fs';
import type {
  Browser,
  BrowserContext,
  LaunchOptions,
  Page,
} from 'puppeteer-core';
import upath from 'upath';
import type { ResolvedTaskConfig } from './config/resolve.js';
import type { BrowserType } from './config/schema.js';
import { Logger } from './logger.js';
import { importNodeModule } from './node-modules.js';
import {
  detectBrowserPlatform,
  getCacheDir,
  getDefaultBrowserTag,
  isInContainer,
  isRunningOnWSL,
  registerExitHandler,
} from './util.js';

const browserEnumMap = {
  chrome: 'chrome' as SupportedBrowser.CHROME,
  chromium: 'chromium' as SupportedBrowser.CHROMIUM,
  firefox: 'firefox' as SupportedBrowser.FIREFOX,
} as const satisfies {
  [key in BrowserType]: SupportedBrowser;
};

async function launchBrowser({
  browserType,
  proxy,
  executablePath,
  headless,
  noSandbox,
  disableDevShmUsage,
  ignoreHttpsErrors,
  protocolTimeout,
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
  protocolTimeout: number;
}): Promise<{
  browser: Browser;
  browserContext: BrowserContext;
}> {
  const puppeteer = await importNodeModule('puppeteer-core');

  const args: string[] = [];
  // https://github.com/microsoft/playwright/blob/35709546cd4210b7744943ceb22b92c1b126d48d/packages/playwright-core/src/server/chromium/chromium.ts
  if (browserType === 'chrome' || browserType === 'chromium') {
    args.push(
      '--disable-field-trial-config',
      '--disable-back-forward-cache',
      '--disable-component-update',
      '--no-default-browser-check',
      '--disable-features=AcceptCHFrame,AvoidUnnecessaryBeforeUnloadCheckSync,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,RenderDocument',
      '--enable-features=CDPScreenshotNewSurface',
      '--no-service-autorun',
      '--unsafely-disable-devtools-self-xss-warnings',
      '--edge-skip-compat-layer-relaunch',
    );

    if (process.platform === 'darwin') {
      args.push('--enable-unsafe-swiftshader');
    }
    if (noSandbox) {
      args.push('--no-sandbox');
    }
    if (headless) {
      args.push(
        '--hide-scrollbars',
        '--mute-audio',
        '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
      );
    }
    if (proxy?.server) {
      const proxyURL = new URL(proxy.server);
      const isSocks = proxyURL.protocol === 'socks5:';
      if (isSocks) {
        args.push(
          `--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE ${proxyURL.hostname}"`,
        );
      }
      args.push(`--proxy-server=${proxy.server}`);
      const proxyBypassRules = [];
      if (proxy.bypass) {
        proxyBypassRules.push(
          ...proxy.bypass
            .split(',')
            .map((t) => t.trim())
            .map((t) => (t.startsWith('.') ? '*' + t : t)),
        );
      }
      proxyBypassRules.push('<-loopback>');
      args.push(`--proxy-bypass-list=${proxyBypassRules.join(';')}`);
    }
    // #579: disable web security to allow cross-origin requests
    args.push('--disable-web-security');
    if (disableDevShmUsage) {
      args.push('--disable-dev-shm-usage');
    }
    // #357: Set devicePixelRatio=1 otherwise it causes layout issues in HiDPI displays
    if (headless) {
      args.push('--force-device-scale-factor=1');
    }
    // #565: Add --disable-gpu option when running on WSL
    if (isRunningOnWSL()) {
      args.push('--disable-gpu');
    }
    // set Chromium language to English to avoid locale-dependent issues
    args.push('--lang=en');
    if (!headless && process.platform === 'darwin') {
      args.push('-AppleLanguages', '(en)');
    }
    args.push('--no-startup-window');
  }
  // TODO: Investigate appropriate settings on Firefox

  const launchOptions = {
    executablePath,
    args,
    browser: browserType === 'chromium' ? 'chrome' : browserType,
    headless,
    acceptInsecureCerts: ignoreHttpsErrors,
    waitForInitialPage: false,
    protocolTimeout,
  } satisfies LaunchOptions;
  Logger.debug('launchOptions %O', launchOptions);
  const browser = await puppeteer.launch({
    ...launchOptions,
    env: { ...process.env, LANG: 'en.UTF-8' },
  });
  registerExitHandler('Closing browser', () => {
    browser.close();
  });
  const [browserContext] = browser.browserContexts();
  return { browser, browserContext };
}

function getPuppeteerCacheDir() {
  if (isInContainer()) {
    return '/opt/puppeteer';
  }
  return upath.join(getCacheDir(), 'browsers');
}

interface BuildIdsCache {
  createdAt: number;
  buildIds: Record<string, Record<string, string>>;
}

async function resolveBuildId({
  type,
  tag,
  browsers,
}: Pick<ResolvedTaskConfig['browser'], 'type' | 'tag'> & {
  browsers: typeof import('@puppeteer/browsers');
}): Promise<string> {
  // Return cached data to reduce network requests to browser registry
  // Cache is valid for 24 hours
  const cacheDataFilename = upath.join(
    getPuppeteerCacheDir(),
    'build-ids.json',
  );
  let cacheData: BuildIdsCache;
  try {
    cacheData = JSON.parse(fs.readFileSync(cacheDataFilename, 'utf-8'));
    if (Date.now() - cacheData.createdAt > 24 * 60 * 60 * 1000) {
      cacheData = { createdAt: Date.now(), buildIds: {} };
    }
  } catch (_) {
    cacheData = { createdAt: Date.now(), buildIds: {} };
  }
  if (cacheData.buildIds[type]?.[tag]) {
    return cacheData.buildIds[type][tag];
  }

  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error('The current platform is not supported.');
  }
  const buildId = await browsers.resolveBuildId(
    browserEnumMap[type],
    platform,
    tag,
  );
  (cacheData.buildIds[type] ??= {})[tag] = buildId;
  fs.mkdirSync(upath.dirname(cacheDataFilename), { recursive: true });
  fs.writeFileSync(cacheDataFilename, JSON.stringify(cacheData));
  return buildId;
}

async function cleanupOutdatedBrowsers() {
  for (const browser of Object.values(browserEnumMap)) {
    const browsersDir = upath.join(getPuppeteerCacheDir(), browser);
    if (!fs.existsSync(browsersDir)) {
      continue;
    }
    const entries = fs.readdirSync(browsersDir);
    for (const entry of entries) {
      const entryPath = upath.join(browsersDir, entry);
      const stat = fs.statSync(entryPath);
      // Files that are not directories are temporary files created
      // during downloads and should be deleted.
      if (
        !stat.isDirectory() ||
        Date.now() - stat.mtimeMs > 7 * 24 * 60 * 60 * 1000
      ) {
        Logger.debug(`Removing outdated browser at ${entryPath}`);
        await fs.promises.rm(entryPath, { recursive: true, force: true });
      }
    }
  }
}

export async function getExecutableBrowserPath({
  type,
  tag,
}: ResolvedTaskConfig['browser']): Promise<string> {
  const browsers = await importNodeModule('@puppeteer/browsers');
  const buildId = await resolveBuildId({ type, tag, browsers });
  return browsers.computeExecutablePath({
    cacheDir: getPuppeteerCacheDir(),
    browser: browserEnumMap[type],
    buildId,
  });
}

function checkBrowserAvailability(path: string): boolean {
  return fs.existsSync(path);
}

async function downloadBrowser({
  type,
  tag,
}: ResolvedTaskConfig['browser']): Promise<string> {
  const browsers = await importNodeModule('@puppeteer/browsers');
  const buildId = await resolveBuildId({ type, tag, browsers });
  let installedBrowser: InstalledBrowser | undefined;

  if (isInContainer()) {
    const defaultBrowserVersion = getDefaultBrowserTag('chrome');
    Logger.logWarn(
      `The container you are using already includes a browser (chrome@${defaultBrowserVersion}); however, the specified browser ${type}@${tag} was not found. Downloading the browser inside the container may take a long time. Consider using a container image that includes the required browser version.`,
    );
  }
  {
    using _ = Logger.suspendLogging(
      'Rendering browser is not installed yet. Downloading now.',
    );
    installedBrowser = await browsers.install({
      cacheDir: getPuppeteerCacheDir(),
      browser: browserEnumMap[type],
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
  config: {
    browser: browserConfig,
    proxy,
    sandbox,
    ignoreHttpsErrors,
    timeout,
  },
}: {
  mode: 'preview' | 'build';
  url: string;
  onBrowserOpen?: (browser: Browser) => void | Promise<void>;
  onPageOpen?: (page: Page) => void | Promise<void>;
  config: Pick<
    ResolvedTaskConfig,
    'browser' | 'proxy' | 'sandbox' | 'ignoreHttpsErrors' | 'timeout'
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
  } else if (
    detectBrowserPlatform() === 'linux_arm' &&
    (browserConfig.type === 'chrome' || browserConfig.type === 'chromium')
  ) {
    // https://github.com/puppeteer/puppeteer/issues/7740
    Logger.logInfo(
      'The official Chrome/Chromium binaries are not available for ARM64 Linux. Using the system-installed Chromium browser instead.',
    );
    executableBrowser = '/usr/bin/chromium';
  } else {
    executableBrowser = await getExecutableBrowserPath(browserConfig);
    Logger.debug(`Using default browser: ${executableBrowser}`);
    if (!checkBrowserAvailability(executableBrowser)) {
      // The browser isn't downloaded first time starting CLI so try to download it
      await cleanupOutdatedBrowsers();
      await downloadBrowser(browserConfig);
    }
  }

  const { browser, browserContext } = await launchBrowser({
    browserType: browserConfig.type,
    proxy,
    executablePath: executableBrowser,
    headless: mode === 'build',
    noSandbox: !sandbox,
    disableDevShmUsage: isInContainer(),
    ignoreHttpsErrors,
    protocolTimeout: timeout,
  });
  await onBrowserOpen?.(browser);

  const page =
    (await browserContext.pages())[0] ?? (await browserContext.newPage());
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

  if (proxy?.username && proxy?.password) {
    await page.authenticate({
      username: proxy.username,
      password: proxy.password,
    });
  }
  await page.goto(url);

  return { browser, page };
}
