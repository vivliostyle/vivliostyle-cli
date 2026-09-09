import fs from 'node:fs';
import os from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrowserPlatform } from '../src/util.js';

const mockedLaunch = vi.hoisted(() =>
  vi.fn<(options?: unknown) => Promise<unknown>>(),
);
const mockedRegisterCleanupHandler = vi.hoisted(() =>
  vi.fn<(message: string, handler: () => void | Promise<void>) => void>(),
);
const mockedUseTmpDirectory = vi.hoisted(() =>
  vi.fn<() => Promise<[string, () => void]>>(() =>
    Promise.resolve(['/tmp/vivliostyle-home-test', () => {}]),
  ),
);
const mockedDetectBrowserPlatform = vi.hoisted(() =>
  vi.fn<() => BrowserPlatform | undefined>(),
);
const mockedResolveBuildId = vi.hoisted(() =>
  vi.fn<
    (browser: string, platform: BrowserPlatform, tag: string) => Promise<string>
  >(),
);
const mockedComputeExecutablePath = vi.hoisted(() =>
  vi.fn<
    (options: { cacheDir: string; browser: string; buildId: string }) => string
  >(),
);

vi.mock('../src/node-modules.js', () => ({
  importNodeModule: vi.fn<(name: string) => Promise<unknown>>((name) =>
    Promise.resolve(
      name === 'puppeteer-core'
        ? { launch: mockedLaunch }
        : {
            resolveBuildId: mockedResolveBuildId,
            computeExecutablePath: mockedComputeExecutablePath,
          },
    ),
  ),
}));

vi.mock('../src/util.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/util.js')>();
  return {
    ...actual,
    detectBrowserPlatform: mockedDetectBrowserPlatform,
    getCacheDir: () => '/__vivliostyle_browser_test_cache__',
    registerCleanupHandler: mockedRegisterCleanupHandler,
    useTmpDirectory: mockedUseTmpDirectory,
  };
});

import { launchPreview } from '../src/browser.js';

describe('launchPreview', () => {
  let registeredCleanupHandler: (() => void | Promise<void>) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredCleanupHandler = undefined;
    mockedRegisterCleanupHandler.mockImplementation((_message, handler) => {
      registeredCleanupHandler = handler;
    });
  });

  it('disables Puppeteer signal handlers', async () => {
    mockedLaunch.mockResolvedValue({
      browserContexts: () => [
        {
          pages: () => [],
          newPage: () => ({
            setViewport: vi.fn<() => void>(),
            on: vi.fn<() => void>(),
            authenticate: vi.fn<() => void>(),
            goto: vi.fn<() => void>(),
          }),
        },
      ],
      close: vi.fn<() => void>(),
    });

    await launchPreview({
      mode: 'build',
      url: 'https://example.com',
      config: {
        browser: {
          type: 'chrome',
          tag: 'stable',
          executablePath: process.execPath,
        },
        proxy: undefined,
        sandbox: false,
        ignoreHttpsErrors: false,
        timeout: 1000,
      },
    });

    expect(mockedLaunch).toHaveBeenCalledOnce();
    expect(mockedLaunch.mock.calls[0][0]).toMatchObject({
      env: expect.any(Object),
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });
  });

  it('shares browser closure between callers and cleanup', async () => {
    let resolveClose: (() => void) | undefined;
    const browserClose = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolveClose = resolve;
        }),
    );
    mockedLaunch.mockResolvedValue({
      browserContexts: () => [
        {
          pages: () => [],
          newPage: () => ({
            setViewport: vi.fn<() => void>(),
            on: vi.fn<() => void>(),
            authenticate: vi.fn<() => void>(),
            goto: vi.fn<() => void>(),
          }),
        },
      ],
      close: browserClose,
    });

    const { closeBrowser } = await launchPreview({
      mode: 'build',
      url: 'https://example.com',
      config: {
        browser: {
          type: 'chrome',
          tag: 'stable',
          executablePath: process.execPath,
        },
        proxy: undefined,
        sandbox: false,
        ignoreHttpsErrors: false,
        timeout: 1000,
      },
    });

    const directClose = closeBrowser();
    const cleanupClose = registeredCleanupHandler?.();

    expect(cleanupClose).toBe(directClose);
    await vi.waitFor(() => {
      expect(browserClose).toHaveBeenCalledOnce();
    });

    resolveClose?.();
    await Promise.all([directClose, cleanupClose]);
  });

  it('registers cleanup before browser launch completes', async () => {
    let resolveLaunch:
      | ((browser: {
          browserContexts: () => never[];
          close: () => Promise<void>;
        }) => void)
      | undefined;
    const browserClose = vi.fn<() => Promise<void>>(async () => {});
    mockedLaunch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLaunch = resolve;
        }),
    );

    const launching = launchPreview({
      mode: 'build',
      url: 'https://example.com',
      config: {
        browser: {
          type: 'chrome',
          tag: 'stable',
          executablePath: process.execPath,
        },
        proxy: undefined,
        sandbox: false,
        ignoreHttpsErrors: false,
        timeout: 1000,
      },
    });

    await vi.waitFor(() => {
      expect(registeredCleanupHandler).toBeDefined();
    });
    const cleanup = registeredCleanupHandler?.();
    expect(browserClose).not.toHaveBeenCalled();

    resolveLaunch?.({
      browserContexts: () => [],
      close: browserClose,
    });

    await cleanup;
    expect(browserClose).toHaveBeenCalledOnce();
    await expect(launching).rejects.toThrow(Error);
  });
});

describe('browser executable resolution', () => {
  const chromePlatforms = [
    'linux',
    'linux_arm',
    'mac',
    'mac_arm',
    'win32',
    'win64',
  ] as const satisfies readonly BrowserPlatform[];

  const launch = (type: 'chrome' | 'chromium') =>
    launchPreview({
      mode: 'build',
      url: 'https://example.com',
      config: {
        browser: {
          type,
          tag: 'stable',
          executablePath: undefined,
        },
        proxy: undefined,
        sandbox: false,
        ignoreHttpsErrors: false,
        timeout: 1000,
      },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('Browser cache is unavailable');
    });
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    mockedLaunch.mockRejectedValue(new Error('Browser launch stopped'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(chromePlatforms)(
    'uses the resolved Chrome for Testing executable on %s',
    async (platform) => {
      mockedDetectBrowserPlatform.mockReturnValue(platform);
      mockedResolveBuildId.mockResolvedValue('resolved-build-id');
      mockedComputeExecutablePath.mockReturnValue(process.execPath);

      await expect(launch('chrome')).rejects.toThrow('Browser launch stopped');

      expect(mockedResolveBuildId).toHaveBeenCalledWith(
        'chrome',
        platform,
        'stable',
      );
      expect(mockedLaunch).toHaveBeenCalledWith(
        expect.objectContaining({ executablePath: process.execPath }),
      );
    },
  );

  it('uses the system Chromium executable on Linux ARM64', async () => {
    mockedDetectBrowserPlatform.mockReturnValue('linux_arm');

    await expect(launch('chromium')).rejects.toThrow('Browser launch stopped');

    expect(mockedResolveBuildId).not.toHaveBeenCalled();
    expect(mockedLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath: '/usr/bin/chromium' }),
    );
  });
});

describe('writable HOME fallback', () => {
  const originalPlatform = process.platform;
  const setPlatform = (value: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', {
      value,
      configurable: true,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedLaunch.mockResolvedValue({
      browserContexts: () => [
        {
          pages: () => [],
          newPage: () => ({
            setViewport: vi.fn<() => void>(),
            on: vi.fn<() => void>(),
            authenticate: vi.fn<() => void>(),
            goto: vi.fn<() => void>(),
          }),
        },
      ],
      close: vi.fn<() => void>(),
    });
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    vi.unstubAllEnvs();
  });

  const launch = () =>
    launchPreview({
      mode: 'build',
      url: 'https://example.com',
      config: {
        browser: {
          type: 'chrome',
          tag: 'stable',
          executablePath: process.execPath,
        },
        proxy: undefined,
        sandbox: false,
        ignoreHttpsErrors: false,
        timeout: 1000,
      },
    });

  const launchedEnv = () =>
    (mockedLaunch.mock.calls[0][0] as { env: NodeJS.ProcessEnv }).env;

  it('replaces an unwritable HOME with a temp directory on Linux', async () => {
    setPlatform('linux');
    vi.stubEnv('HOME', '/__vivliostyle_nonexistent_home__');

    await launch();

    expect(mockedUseTmpDirectory).toHaveBeenCalledOnce();
    expect(launchedEnv().HOME).toBe('/tmp/vivliostyle-home-test');
  });

  it('keeps a writable HOME untouched on Linux', async () => {
    setPlatform('linux');
    vi.stubEnv('HOME', os.tmpdir());

    await launch();

    expect(mockedUseTmpDirectory).not.toHaveBeenCalled();
    expect(launchedEnv().HOME).toBe(os.tmpdir());
  });

  it('does not touch HOME on non-Linux platforms', async () => {
    setPlatform('darwin');
    vi.stubEnv('HOME', '/__vivliostyle_nonexistent_home__');

    await launch();

    expect(mockedUseTmpDirectory).not.toHaveBeenCalled();
    expect(launchedEnv().HOME).toBe('/__vivliostyle_nonexistent_home__');
  });
});
