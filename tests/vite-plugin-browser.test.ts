import type { HTTPResponse, Page } from 'puppeteer-core';
import type { HotPayload, ViteDevServer } from 'vite';
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
      ws: { send: vi.fn<() => void>() },
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

describe('vsBrowserPlugin reload suppression', () => {
  const fullReload = { type: 'full-reload', path: '*' } as const;

  function createPreview({
    signal,
    viewer,
    hmr,
    ws,
  }: {
    signal?: AbortSignal;
    viewer?: string;
    hmr?: false;
    ws?: false;
  } = {}) {
    const calls: string[] = [];
    const send = vi
      .fn<(...args: [HotPayload] | [string, unknown?]) => void>()
      .mockImplementation((...args) => {
        calls.push(typeof args[0] === 'string' ? args[0] : args[0].type);
      });
    const page = {
      on: vi.fn<() => void>(),
      off: vi.fn<() => void>(),
      waitForNavigation: vi
        .fn<() => Promise<HTTPResponse | null>>()
        .mockImplementation(() => {
          calls.push('waitForNavigation');
          return Promise.resolve({} as HTTPResponse);
        }),
      bringToFront: vi.fn<() => Promise<void>>().mockImplementation(() => {
        calls.push('bringToFront');
        return Promise.resolve();
      }),
    };
    const closeBrowser = vi.fn<() => Promise<void>>().mockResolvedValue();
    const resolvedConfig = { ...config, viewer };
    mockedReloadConfig.mockResolvedValue(resolvedConfig);
    mockedGetViewerFullUrl.mockResolvedValue('http://localhost:13000/viewer');
    mockedLaunchPreview.mockResolvedValue({ page, closeBrowser });
    const listen = vi.fn<() => Promise<ViteDevServer>>();
    const server = {
      ws: { send },
      config: { server: { hmr, ws } },
      listen,
    } as unknown as ViteDevServer;
    listen.mockResolvedValue(server);
    const plugin = vsBrowserPlugin({
      config: resolvedConfig,
      inlineConfig: {
        openViewer: true,
        signal,
      } as ParsedVivliostyleInlineConfig,
    });
    (plugin.configureServer as (server: ViteDevServer) => void)(server);
    return { server, send, page, closeBrowser, calls, listen };
  }

  it('coalesces reloads queued before listening and waits for navigation before focusing', async () => {
    const { server, send, page, calls } = createPreview();
    server.ws.send(fullReload);
    server.ws.send({ type: 'full-reload', path: '/chapter.html' });
    expect(send).not.toHaveBeenCalled();
    await server.listen();
    expect(calls).toEqual(['waitForNavigation', 'full-reload', 'bringToFront']);
    expect(page.waitForNavigation).toHaveBeenCalledWith({
      signal: undefined,
    });
    server.ws.send(fullReload);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('forwards custom events, errors, and module updates during startup', async () => {
    const { server, send } = createPreview();
    const error = {
      type: 'error',
      err: { message: 'failure', stack: 'stack' },
    } as const;
    const update = { type: 'update', updates: [] } as const;
    server.ws.send('custom:event', { value: 1 });
    server.ws.send(error);
    server.ws.send({ ...update, updates: [] });
    expect(send.mock.calls).toEqual([
      ['custom:event', { value: 1 }],
      [error],
      [update],
    ]);
    await server.listen();
  });

  it('handles a reload requested while focusing before startup completes', async () => {
    const { server, page, calls } = createPreview();
    page.bringToFront.mockImplementationOnce(() => {
      calls.push('bringToFront');
      server.ws.send(fullReload);
      return Promise.resolve();
    });
    await server.listen();
    expect(calls).toEqual([
      'bringToFront',
      'waitForNavigation',
      'full-reload',
      'bringToFront',
    ]);
  });

  it('handles another update arriving during the controlled reload', async () => {
    const { server, page, send } = createPreview();
    server.ws.send(fullReload);
    page.waitForNavigation.mockImplementationOnce(() => {
      server.ws.send(fullReload);
      return Promise.resolve({} as HTTPResponse);
    });
    await server.listen();
    expect(page.waitForNavigation).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('keeps waiting after a same-document navigation', async () => {
    const { server, page, send, calls } = createPreview();
    server.ws.send(fullReload);
    page.waitForNavigation.mockResolvedValueOnce(null);
    await server.listen();
    expect(page.waitForNavigation).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledOnce();
    expect(calls.at(-1)).toBe('bringToFront');
  });

  it.each([
    { viewer: 'https://example.com/viewer' },
    { hmr: false as const },
    { ws: false as const },
  ])('does not wait for a viewer navigation with %j', async (options) => {
    const { server, page, send } = createPreview(options);
    server.ws.send(fullReload);
    await server.listen();
    expect(page.waitForNavigation).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(fullReload);
    expect(page.bringToFront).toHaveBeenCalledOnce();
  });

  it.each(['listen', 'config', 'browser', 'navigation', 'focus'] as const)(
    'restores sending and propagates a %s failure',
    async (stage) => {
      const { server, listen, page, send } = createPreview();
      const error = new Error(`${stage} failed`);
      const operation = {
        listen,
        config: mockedReloadConfig,
        browser: mockedLaunchPreview,
        navigation: page.waitForNavigation,
        focus: page.bringToFront,
      }[stage];
      operation.mockRejectedValueOnce(error);
      server.ws.send(fullReload);
      await expect(server.listen()).rejects.toBe(error);
      send.mockClear();
      server.ws.send(fullReload);
      expect(send).toHaveBeenCalledWith(fullReload);
    },
  );

  it('closes the browser and restores sending when navigation is cancelled', async () => {
    const controller = new AbortController();
    const { server, page, send, closeBrowser } = createPreview({
      signal: controller.signal,
    });
    const reason = new Error('cancelled');
    page.waitForNavigation.mockImplementationOnce(() => {
      controller.abort(reason);
      return Promise.reject(new Error('Target closed'));
    });
    server.ws.send(fullReload);
    await expect(server.listen()).rejects.toBe(reason);
    expect(closeBrowser).toHaveBeenCalledOnce();
    send.mockClear();
    server.ws.send(fullReload);
    expect(send).toHaveBeenCalledWith(fullReload);
  });
});
