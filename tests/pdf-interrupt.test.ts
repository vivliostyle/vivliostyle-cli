import type { Browser, Page } from 'puppeteer-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PdfOutput, ResolvedTaskConfig } from '../src/config/resolve.js';

const mockedLaunchPreview = vi.hoisted(() => vi.fn());
const mockedGetViewerFullUrl = vi.hoisted(() => vi.fn());
const mockedPostProcessLoad = vi.hoisted(() => vi.fn());

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

function setupPdfBuild(pdf: Page['pdf'], closeBrowser = vi.fn(async () => {})) {
  const page = {
    waitForNetworkIdle: vi.fn(),
    waitForFunction: vi.fn(),
    emulateMediaType: vi.fn(),
    evaluate: vi
      .fn()
      .mockResolvedValueOnce('ltr')
      .mockResolvedValueOnce('2.43.0')
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]),
    pdf,
  } as unknown as Page;

  const browser = {
    protocol: 'cdp',
    version: vi.fn(async () => 'Chrome/142.0.0.0'),
    close: vi.fn(async () => {}),
  } as unknown as Browser & { protocol: 'cdp' };

  mockedLaunchPreview.mockResolvedValue({ browser, page, closeBrowser });

  return { browser, closeBrowser, page };
}

describe('buildPDF cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const closeBrowser = vi.fn(
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
      vi.fn(async () => {
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
      .mockImplementationOnce(async () => {
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
      vi.fn(async () => {
        throw protocolError;
      }),
    );

    await expect(buildPDF({ target, config })).rejects.toBe(protocolError);
  });
});
