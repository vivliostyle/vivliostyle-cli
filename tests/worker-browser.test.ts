import { afterEach, expect, it, vi } from 'vitest';

import type { RenderInputs } from '../src/browser-worker/protocol.js';

const mockedLaunchBrowser = vi.hoisted(() => vi.fn<() => Promise<unknown>>());

vi.mock('../src/browser.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/browser.js')>()),
  launchBrowser: mockedLaunchBrowser,
}));

import { WorkerBrowser } from '../src/browser-worker/browser.js';

afterEach(() => {
  vi.useRealTimers();
  mockedLaunchBrowser.mockReset();
});

it('retires a browser when a timed-out context cannot be closed within five seconds', async () => {
  vi.useFakeTimers();
  const signal = new AbortController().signal;
  const worker = new WorkerBrowser(signal);
  const inputs: RenderInputs = {
    url: 'about:blank',
    timeout: 1_000,
    cmyk: false,
    browserTag: 'stable',
    settings: {
      browserType: 'chrome',
      executablePath: process.execPath,
      headless: true,
      noSandbox: true,
      disableDevShmUsage: false,
      ignoreHttpsErrors: false,
    },
  };

  const stalledContext = new Promise<never>(() => {});
  const first = mockBrowser(() => stalledContext);
  const nextFailure = new Error('Next browser could not create a context');
  const next = mockBrowser(() => Promise.reject(nextFailure));
  mockedLaunchBrowser.mockResolvedValueOnce(first).mockResolvedValueOnce(next);

  const render = worker
    .render(inputs, () => {}, signal)
    .catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(first.browser.createBrowserContext).toHaveBeenCalledOnce();
  expect(first.closeBrowser).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(4_999);
  expect(first.closeBrowser).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await render).toMatchObject({
    message: expect.stringContaining('PDF rendering timed out'),
  });
  expect(first.closeBrowser).toHaveBeenCalledOnce();

  await expect(worker.render(inputs, () => {}, signal)).rejects.toBe(
    nextFailure,
  );
  expect(mockedLaunchBrowser).toHaveBeenCalledTimes(2);
  expect(next.closeBrowser).not.toHaveBeenCalled();
  await worker.close();
  expect(next.closeBrowser).toHaveBeenCalledOnce();
});

function mockBrowser(createBrowserContext: () => Promise<unknown>) {
  const events = new EventTarget();
  const browser = {
    connected: true,
    process: () => null,
    createBrowserContext: vi.fn<() => Promise<unknown>>(createBrowserContext),
    once: (name: string, listener: EventListener) => {
      events.addEventListener(name, listener, { once: true });
    },
    off: (name: string, listener: EventListener) =>
      events.removeEventListener(name, listener),
  };
  const closeBrowser = vi.fn<() => Promise<void>>(() => {
    browser.connected = false;
    events.dispatchEvent(new Event('disconnected'));
    return Promise.resolve();
  });
  return { browser, closeBrowser };
}
