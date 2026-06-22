import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedLaunch = vi.hoisted(() =>
  vi.fn<(options?: unknown) => Promise<unknown>>(),
);
const mockedRegisterCleanupHandler = vi.hoisted(() =>
  vi.fn<(message: string, handler: () => void | Promise<void>) => void>(),
);

vi.mock('../src/node-modules.js', () => ({
  importNodeModule: vi.fn<() => Promise<unknown>>(() =>
    Promise.resolve({
      launch: mockedLaunch,
    }),
  ),
}));

vi.mock('../src/util.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/util.js')>();
  return {
    ...actual,
    registerCleanupHandler: mockedRegisterCleanupHandler,
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
