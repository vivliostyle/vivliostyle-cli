import type { Page } from 'puppeteer-core';
import type { ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedTaskConfig } from '../src/config/resolve.js';
import type { ParsedVivliostyleInlineConfig } from '../src/config/schema.js';

const mockedLaunchPreview = vi.hoisted(() =>
  vi.fn<
    (
      options: Parameters<typeof import('../src/browser.js').launchPreview>[0],
    ) => Promise<unknown>
  >(),
);
const mockedGetViewerFullUrl = vi.hoisted(() =>
  vi.fn<() => Promise<unknown>>(),
);
const mockedReloadConfig = vi.hoisted(() => vi.fn<() => Promise<unknown>>());

vi.mock('../src/browser.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/browser.js')>()),
  launchPreview: mockedLaunchPreview,
}));

vi.mock('../src/server.js', () => ({
  getViewerFullUrl: mockedGetViewerFullUrl,
}));

vi.mock('../src/vite/plugin-util.js', () => ({
  reloadConfig: mockedReloadConfig,
}));

import { vsBrowserPlugin } from '../src/vite/vite-plugin-browser.js';

const config = {} as ResolvedTaskConfig;

describe('vsBrowserPlugin cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetViewerFullUrl.mockResolvedValue('http://localhost:13000/viewer');
    mockedReloadConfig.mockResolvedValue(config);
  });

  it('passes the signal and normalizes page setup errors after cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const protocolError = new Error(
      'Protocol error (Runtime.callFunctionOn): Target closed',
    );
    const closeBrowser = vi.fn<() => Promise<void>>(async () => {});
    const page = {
      on: vi.fn<() => void>(),
      off: vi.fn<() => void>(),
      isClosed: () => false,
      bringToFront: vi.fn<() => Promise<void>>(() => {
        controller.abort(reason);
        throw protocolError;
      }),
    } as unknown as Page;
    mockedLaunchPreview.mockResolvedValue({
      page,
      browser: { connected: true },
      closeBrowser,
    });

    const plugin = vsBrowserPlugin({
      config,
      inlineConfig: {
        openViewer: true,
        signal: controller.signal,
      } as ParsedVivliostyleInlineConfig,
    });
    const server = {
      // oxlint-disable-next-line require-await -- mock must return a Promise to match listen's signature
      listen: vi.fn<() => Promise<unknown>>(async () => server),
      close: vi.fn<() => Promise<void>>(async () => {}),
      config: {},
    } as unknown as ViteDevServer;
    const configureServer = plugin.configureServer;
    expect(typeof configureServer).toBe('function');
    (configureServer as (server: ViteDevServer) => void)(server);

    await expect(server.listen()).rejects.toBe(reason);
    expect(mockedLaunchPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
    expect(closeBrowser).toHaveBeenCalledOnce();
  });
});

describe('vsBrowserPlugin page setup', () => {
  const calls: string[] = [];
  const page = {
    on: vi.fn<() => void>(),
    off: vi.fn<() => void>(),
    isClosed: () => pageClosed,
    evaluateOnNewDocument: vi
      .fn<
        (
          fn: (lng: string) => void,
          lng: string,
        ) => Promise<{ identifier: string }>
      >()
      .mockImplementation(() => {
        calls.push('evaluateOnNewDocument');
        return Promise.resolve({ identifier: 'locale-script' });
      }),
    bringToFront: vi.fn<() => Promise<void>>().mockImplementation(() => {
      calls.push('bringToFront');
      return Promise.resolve();
    }),
    removeScriptToEvaluateOnNewDocument: vi
      .fn<(id: string) => Promise<void>>()
      .mockImplementation((id) => {
        calls.push(`remove:${id}`);
        return Promise.resolve();
      }),
    waitForFunction: vi
      .fn<(fn: () => boolean, options: unknown) => Promise<unknown>>()
      .mockImplementation(() => {
        calls.push('waitForFunction');
        return Promise.resolve();
      }),
  };
  const browser = { connected: true };
  let pageClosed = false;
  const closeBrowser = vi.fn<() => Promise<void>>().mockResolvedValue();

  function listenWithPlugin(signal?: AbortSignal) {
    const plugin = vsBrowserPlugin({
      config,
      inlineConfig: {
        openViewer: true,
        signal,
      } as ParsedVivliostyleInlineConfig,
    });
    const server = {
      listen: vi
        .fn<() => Promise<unknown>>()
        .mockImplementation(() => Promise.resolve(server)),
      close: vi.fn<() => Promise<void>>().mockResolvedValue(),
      config: {},
    } as unknown as ViteDevServer;
    (plugin.configureServer as (server: ViteDevServer) => void)(server);
    return server.listen();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    browser.connected = true;
    pageClosed = false;
    mockedGetViewerFullUrl.mockResolvedValue('http://localhost:13000/viewer');
    mockedReloadConfig.mockResolvedValue(config);
    mockedLaunchPreview.mockImplementation(async ({ onPageOpen }) => {
      await onPageOpen?.(page as unknown as Page);
      calls.push('goto');
      return { page, browser, closeBrowser };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets the viewer language before navigation and focuses the URL input after bringing the page to front', async () => {
    const { signal } = new AbortController();
    await expect(listenWithPlugin(signal)).resolves.toBeDefined();
    expect(calls).toEqual([
      'evaluateOnNewDocument',
      'goto',
      'remove:locale-script',
      'bringToFront',
      'waitForFunction',
    ]);

    const [setLanguage, lng] = page.evaluateOnNewDocument.mock.calls[0];
    const setItem = vi.fn<(key: string, value: string) => void>();
    vi.stubGlobal('window', { localStorage: { setItem } });
    setLanguage(lng);
    expect(setItem).toHaveBeenCalledWith('i18nextLng', 'en');

    const [focusUrlInput, options] = page.waitForFunction.mock.calls[0];
    const focus = vi.fn<() => void>();
    const querySelector = vi
      .fn<(selector: string) => { focus: () => void }>()
      .mockReturnValue({ focus });
    vi.stubGlobal('document', { querySelector, readyState: 'loading' });
    expect(focusUrlInput()).toBe(true);
    expect(querySelector).toHaveBeenCalledWith('#vivliostyle-input-url');
    expect(focus).toHaveBeenCalledOnce();
    expect(options).toEqual({ polling: 1000, signal });
    expect((options as { signal: AbortSignal }).signal).toBe(signal);
  });

  it('waits for the URL input until the document has finished loading', async () => {
    await listenWithPlugin();
    const [focusUrlInput] = page.waitForFunction.mock.calls[0];
    vi.stubGlobal('document', {
      querySelector: () => null,
      readyState: 'loading',
    });
    expect(focusUrlInput()).toBe(false);
    vi.stubGlobal('document', {
      querySelector: () => null,
      readyState: 'complete',
    });
    expect(focusUrlInput()).toBe(true);
  });

  it('opens the preview even if the language setup fails', async () => {
    page.evaluateOnNewDocument.mockRejectedValueOnce(
      new Error('Protocol error (Page.addScriptToEvaluateOnNewDocument)'),
    );
    await expect(listenWithPlugin()).resolves.toBeDefined();
    expect(page.removeScriptToEvaluateOnNewDocument).not.toHaveBeenCalled();
    expect(calls).toEqual(['goto', 'bringToFront', 'waitForFunction']);
  });

  it('removes the locale script and focuses the URL input even if bringing the page to front fails', async () => {
    page.bringToFront.mockRejectedValueOnce(
      new Error('Protocol error (Page.bringToFront): Target closed'),
    );
    await expect(listenWithPlugin()).resolves.toBeDefined();
    expect(calls).toEqual([
      'evaluateOnNewDocument',
      'goto',
      'remove:locale-script',
      'waitForFunction',
    ]);
  });

  it('focuses the URL input even if removing the locale script fails', async () => {
    page.removeScriptToEvaluateOnNewDocument.mockRejectedValueOnce(
      new Error('Protocol error (Page.removeScriptToEvaluateOnNewDocument)'),
    );
    await expect(listenWithPlugin()).resolves.toBeDefined();
    expect(page.waitForFunction).toHaveBeenCalledOnce();
    expect(closeBrowser).not.toHaveBeenCalled();
  });

  it('opens the preview even if focusing the URL input times out', async () => {
    page.waitForFunction.mockRejectedValueOnce(
      new Error('Waiting failed: 30000ms exceeded'),
    );
    await expect(listenWithPlugin()).resolves.toBeDefined();
    expect(closeBrowser).not.toHaveBeenCalled();
  });

  it('propagates cancellation while waiting for the URL input', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    page.waitForFunction.mockImplementationOnce(() => {
      controller.abort(reason);
      return Promise.reject(reason);
    });
    await expect(listenWithPlugin(controller.signal)).rejects.toBe(reason);
    expect(closeBrowser).toHaveBeenCalledOnce();
  });

  it('opens the preview without failing if the page is closed during the page setup', async () => {
    page.waitForFunction.mockImplementationOnce(() => {
      pageClosed = true;
      browser.connected = false;
      return Promise.reject(
        new Error('Protocol error (Runtime.callFunctionOn): Target closed'),
      );
    });
    await expect(listenWithPlugin()).resolves.toBeDefined();
    expect(closeBrowser).not.toHaveBeenCalled();
  });

  it('fails to open the preview if the browser is disconnected while the page is still open', async () => {
    page.waitForFunction.mockImplementationOnce(() => {
      browser.connected = false;
      return Promise.reject(
        new Error('Protocol error (Runtime.callFunctionOn): Target closed'),
      );
    });
    await expect(listenWithPlugin()).rejects.toThrow('Target closed');
  });
});
