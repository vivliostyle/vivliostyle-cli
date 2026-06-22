import type { Browser, Page } from 'puppeteer-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PdfOutput, ResolvedTaskConfig } from '../src/config/resolve.js';

const mockedLaunchPreview = vi.hoisted(() => vi.fn<() => Promise<unknown>>());
const mockedGetViewerFullUrl = vi.hoisted(() =>
  vi.fn<() => Promise<unknown>>(),
);
const mockedPostProcessLoad = vi.hoisted(() => vi.fn<() => Promise<unknown>>());

vi.mock('../src/browser.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/browser.js')>()),
  launchPreview: mockedLaunchPreview,
}));

vi.mock('../src/server.js', () => ({
  getViewerFullUrl: mockedGetViewerFullUrl,
}));

vi.mock('../src/output/pdf-postprocess.js', () => ({
  PostProcess: {
    load: mockedPostProcessLoad,
  },
}));

import { buildPDF } from '../src/output/pdf.js';

const target = {
  format: 'pdf',
  path: '/tmp/output.pdf',
  renderMode: 'local',
  preflight: undefined,
  preflightOption: [],
  cmyk: false,
  replaceImage: [],
} satisfies PdfOutput;

const config = {
  entries: [],
  entryContextDir: '/tmp',
  workspaceDir: '/tmp',
  timeout: 1000,
  viewer: undefined,
  image: undefined,
} as unknown as ResolvedTaskConfig;

function setupPdfBuild(
  pdf: Page['pdf'],
  closeBrowser = vi.fn<() => Promise<void>>(async () => {}),
) {
  const page = {
    waitForNetworkIdle: vi.fn<() => void>(),
    waitForFunction: vi.fn<() => void>(),
    emulateMediaType: vi.fn<() => void>(),
    evaluate: vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce('ltr')
      .mockResolvedValueOnce('2.43.0')
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]),
    pdf,
  } as unknown as Page;

  const browser = {
    protocol: 'cdp',
    version: vi.fn<() => Promise<string>>(() =>
      Promise.resolve('Chrome/142.0.0.0'),
    ),
    close: vi.fn<() => Promise<void>>(async () => {}),
  } as unknown as Browser & { protocol: 'cdp' };

  mockedLaunchPreview.mockResolvedValue({ browser, page, closeBrowser });

  return { browser, closeBrowser, page };
}

describe('buildPDF cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPostProcessLoad.mockReset();
    mockedGetViewerFullUrl.mockResolvedValue('http://localhost:13000/viewer');
  });

  it('rejects with the abort reason when cancellation happens during page.pdf()', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const { closeBrowser } = setupPdfBuild(
      vi.fn(() => {
        controller.abort(reason);
        return new Promise<Uint8Array>(() => {});
      }),
    );

    await expect(
      buildPDF({ target, config, signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(closeBrowser).toHaveBeenCalledOnce();
    expect(mockedPostProcessLoad).not.toHaveBeenCalled();
  });

  it('waits for browser closure before rejecting after cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    let resolveClose: (() => void) | undefined;
    const closeBrowser = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolveClose = resolve;
        }),
    );
    setupPdfBuild(
      vi.fn(() => {
        controller.abort(reason);
        return new Promise<Uint8Array>(() => {});
      }),
      closeBrowser,
    );

    let settled = false;
    const result = buildPDF({
      target,
      config,
      signal: controller.signal,
    }).then(
      () => {
        settled = true;
      },
      (err) => {
        settled = true;
        return err;
      },
    );

    await vi.waitFor(() => {
      expect(closeBrowser).toHaveBeenCalledOnce();
    });
    expect(settled).toBe(false);

    resolveClose?.();
    await expect(result).resolves.toBe(reason);
  });

  it('normalizes page.pdf() errors that happen after cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const protocolError = new Error(
      'Protocol error (Page.printToPDF): Printing failed',
    );
    setupPdfBuild(
      vi.fn(() => {
        controller.abort(reason);
        throw protocolError;
      }),
    );

    await expect(
      buildPDF({ target, config, signal: controller.signal }),
    ).rejects.toBe(reason);
  });

  it('normalizes browser evaluation errors that happen after cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const protocolError = new Error(
      'Protocol error (Runtime.callFunctionOn): Target closed',
    );
    const { closeBrowser, page } = setupPdfBuild(vi.fn());
    vi.mocked(page.evaluate)
      .mockReset()
      .mockImplementationOnce(() => {
        controller.abort(reason);
        throw protocolError;
      });

    await expect(
      buildPDF({ target, config, signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(closeBrowser).toHaveBeenCalledOnce();
  });

  it('keeps page.pdf() errors when the operation was not cancelled', async () => {
    const protocolError = new Error(
      'Protocol error (Page.printToPDF): Printing failed',
    );
    setupPdfBuild(
      vi.fn(() => {
        throw protocolError;
      }),
    );

    await expect(buildPDF({ target, config })).rejects.toBe(protocolError);
  });

  it('passes the signal to PDF postprocess', async () => {
    const controller = new AbortController();
    const save = vi.fn<() => Promise<void>>(async () => {});
    mockedPostProcessLoad.mockResolvedValue({
      metadata: vi.fn<() => Promise<void>>(async () => {}),
      toc: vi.fn<() => Promise<void>>(async () => {}),
      setPageBoxes: vi.fn<() => Promise<void>>(async () => {}),
      save,
    });
    setupPdfBuild(vi.fn(() => Promise.resolve(new Uint8Array([1]))));

    await expect(
      buildPDF({
        target: { ...target, path: 'output.pdf' },
        config,
        signal: controller.signal,
      }),
    ).resolves.toBe('output.pdf');

    expect(save).toHaveBeenCalledWith(
      'output.pdf',
      expect.objectContaining({
        signal: controller.signal,
      }),
    );
  });
});
