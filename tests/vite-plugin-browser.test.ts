import { EventEmitter } from 'node:events';

import type { Page } from 'puppeteer-core';
import type { ViteDevServer } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedTaskConfig } from '../src/config/resolve.js';
import type { ParsedVivliostyleInlineConfig } from '../src/config/schema.js';

const mockedLaunchPreview = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
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
      bringToFront: vi.fn<() => Promise<void>>(() => {
        controller.abort(reason);
        throw protocolError;
      }),
    } as unknown as Page;
    mockedLaunchPreview.mockResolvedValue({
      page,
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
      httpServer: {},
      // oxlint-disable-next-line prefer-event-target -- Vite's watcher is a chokidar FSWatcher, which is an EventEmitter
      watcher: new EventEmitter(),
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

  it('drops watcher events until the preview page is opened', async () => {
    let resolveLaunch: (value: unknown) => void = () => {};
    mockedLaunchPreview.mockReturnValue(
      new Promise((resolve) => {
        resolveLaunch = resolve;
      }),
    );
    const page = {
      on: vi.fn<() => void>(),
      off: vi.fn<() => void>(),
      bringToFront: vi.fn<() => Promise<void>>(async () => {}),
    } as unknown as Page;

    const plugin = vsBrowserPlugin({
      config,
      inlineConfig: { openViewer: true } as ParsedVivliostyleInlineConfig,
    });
    // oxlint-disable-next-line prefer-event-target -- Vite's watcher is a chokidar FSWatcher, which is an EventEmitter
    const watcher = new EventEmitter();
    const onChange = vi.fn<() => void>();
    watcher.on('change', onChange);
    const server = {
      // oxlint-disable-next-line require-await -- mock must return a Promise to match listen's signature
      listen: vi.fn<() => Promise<unknown>>(async () => server),
      close: vi.fn<() => Promise<void>>(async () => {}),
      config: {},
      httpServer: {},
      watcher,
    } as unknown as ViteDevServer;
    (plugin.configureServer as (server: ViteDevServer) => void)(server);

    watcher.emit('change', 'before-listen.html');
    const listening = server.listen();
    await vi.waitFor(() => {
      expect(mockedLaunchPreview).toHaveBeenCalledOnce();
    });

    const onError = vi.fn<(err: Error) => void>();
    watcher.on('error', onError);
    watcher.emit('error', new Error('boom'));
    expect(onError).toHaveBeenCalledOnce();

    watcher.emit('change', 'while-launching.html');
    expect(onChange).not.toHaveBeenCalled();
    resolveLaunch({ page, closeBrowser: vi.fn<() => Promise<void>>() });
    await listening;
    watcher.emit('change', 'after-launch.html');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('after-launch.html');
  });

  it('keeps watcher events flowing in middleware mode', () => {
    const plugin = vsBrowserPlugin({
      config,
      inlineConfig: { openViewer: true } as ParsedVivliostyleInlineConfig,
    });
    // oxlint-disable-next-line prefer-event-target -- Vite's watcher is a chokidar FSWatcher, which is an EventEmitter
    const watcher = new EventEmitter();
    const onChange = vi.fn<() => void>();
    watcher.on('change', onChange);
    const server = {
      listen: vi.fn<() => Promise<unknown>>(),
      close: vi.fn<() => Promise<void>>(async () => {}),
      config: {},
      httpServer: null,
      watcher,
    } as unknown as ViteDevServer;
    (plugin.configureServer as (server: ViteDevServer) => void)(server);

    expect(Object.hasOwn(watcher, 'emit')).toBe(false);
    watcher.emit('change', 'middleware-mode.html');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('middleware-mode.html');
  });
});
