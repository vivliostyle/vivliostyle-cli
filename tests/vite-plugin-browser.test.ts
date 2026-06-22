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
