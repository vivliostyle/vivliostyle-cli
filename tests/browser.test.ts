import { describe, expect, it, vi } from 'vitest';

const mockedLaunch = vi.hoisted(() => vi.fn());
const mockedRegisterExitHandler = vi.hoisted(() => vi.fn());

vi.mock('../src/node-modules.js', () => ({
  importNodeModule: vi.fn(async () => ({
    launch: mockedLaunch,
  })),
}));

vi.mock('../src/util.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/util.js')>();
  return {
    ...actual,
    registerExitHandler: mockedRegisterExitHandler,
  };
});

import { launchPreview } from '../src/browser.js';

describe('launchPreview', () => {
  it('disables Puppeteer signal handlers', async () => {
    mockedLaunch.mockResolvedValue({
      browserContexts: () => [
        {
          pages: async () => [],
          newPage: async () => ({
            setViewport: vi.fn(),
            on: vi.fn(),
            authenticate: vi.fn(),
            goto: vi.fn(),
          }),
        },
      ],
      close: vi.fn(),
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
    expect(mockedRegisterExitHandler).toHaveBeenCalledOnce();
  });
});
