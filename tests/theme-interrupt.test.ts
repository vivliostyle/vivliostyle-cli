import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockTree = {
  children: Map<
    string,
    {
      path: string;
      resolved?: string;
    }
  >;
};

const mockedArborist = vi.hoisted(() => ({
  buildIdealTree: vi.fn<() => Promise<MockTree>>(),
  reify: vi.fn<(options?: unknown) => Promise<MockTree>>(),
}));
const mockedRegisterCleanupHandler = vi.hoisted(() =>
  vi.fn<
    (
      message: string,
      handler: () => Promise<void>,
      options?: { prepend?: boolean },
    ) => () => void
  >(),
);

vi.mock('@npmcli/arborist', () => ({
  default: class Arborist {
    buildIdealTree = mockedArborist.buildIdealTree;
    reify = mockedArborist.reify;
  },
}));

vi.mock('../src/util.js', () => ({
  DetailError: class DetailError extends Error {
    constructor(
      message: string | undefined,
      readonly detail: string | undefined,
    ) {
      super(message);
    }
  },
  registerCleanupHandler: mockedRegisterCleanupHandler,
}));

import type { ParsedTheme } from '../src/config/resolve.js';
import { installThemeDependencies } from '../src/processor/theme.js';

const themeIndexes = new Set<ParsedTheme>([
  {
    type: 'package',
    name: 'example-theme',
    specifier: 'example-theme',
    location: '/themes/node_modules/example-theme',
    registry: true,
  },
]);

describe('theme installation cancellation', () => {
  let cleanupHandler: (() => Promise<void>) | undefined;
  let themesDir: string;
  const unregisterCleanup = vi.fn<() => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    cleanupHandler = undefined;
    themesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vivliostyle-theme-interrupt-'),
    );
    mockedArborist.buildIdealTree.mockResolvedValue({
      children: new Map(),
    });
    mockedRegisterCleanupHandler.mockImplementation((_message, handler) => {
      cleanupHandler = handler;
      return unregisterCleanup;
    });
  });

  afterEach(() => {
    fs.rmSync(themesDir, { recursive: true, force: true });
  });

  it('waits for Arborist rollback and preserves the abort reason', async () => {
    const controller = new AbortController();
    const abortReason = new Error('interrupted');
    const arboristError = new Error('process terminated');
    let rejectReify: ((error: Error) => void) | undefined;
    mockedArborist.reify.mockReturnValue(
      new Promise((_, reject) => {
        rejectReify = reject;
      }),
    );

    const installation = installThemeDependencies({
      themesDir,
      themeIndexes,
      signal: controller.signal,
    });

    await vi.waitFor(() => {
      expect(cleanupHandler).toBeDefined();
    });
    expect(mockedRegisterCleanupHandler).toHaveBeenCalledWith(
      'Waiting for theme installation rollback',
      expect.any(Function),
      { prepend: true },
    );
    controller.abort(abortReason);

    let cleanupSettled = false;
    const cleanup = cleanupHandler?.().then(() => {
      cleanupSettled = true;
    });
    await Promise.resolve();
    expect(cleanupSettled).toBe(false);

    rejectReify?.(arboristError);

    await cleanup;
    await expect(installation).rejects.toBe(abortReason);
    expect(unregisterCleanup).toHaveBeenCalledOnce();
  });

  it('keeps reporting non-cancellation reify errors as installation errors', async () => {
    const arboristError = new Error('installation failed');
    mockedArborist.reify.mockRejectedValue(arboristError);

    const installation = installThemeDependencies({
      themesDir,
      themeIndexes,
    });

    await expect(installation).rejects.toMatchObject({
      message: 'An error occurred during the installation of the theme',
    });
    expect(unregisterCleanup).toHaveBeenCalledOnce();
  });

  it('finishes local theme linking before reporting cancellation', async () => {
    const controller = new AbortController();
    const abortReason = new Error('interrupted');
    const sourcePath = path.join(themesDir, 'source-theme');
    const installedPath = path.join(themesDir, 'node_modules', 'example-theme');
    fs.mkdirSync(sourcePath);
    fs.mkdirSync(installedPath, { recursive: true });
    mockedArborist.reify.mockImplementation(async () => {
      controller.abort(abortReason);
      return {
        children: new Map([
          [
            'example-theme',
            {
              path: installedPath,
              resolved: 'file:source-theme',
            },
          ],
        ]),
      };
    });

    await expect(
      installThemeDependencies({
        themesDir,
        themeIndexes,
        signal: controller.signal,
      }),
    ).rejects.toBe(abortReason);

    expect(fs.realpathSync(installedPath)).toBe(fs.realpathSync(sourcePath));
    expect(unregisterCleanup).toHaveBeenCalledOnce();
  });

  it('does not start Arborist work when already aborted', async () => {
    const controller = new AbortController();
    const abortReason = new Error('interrupted');
    controller.abort(abortReason);

    await expect(
      installThemeDependencies({
        themesDir,
        themeIndexes,
        signal: controller.signal,
      }),
    ).rejects.toBe(abortReason);
    expect(mockedArborist.buildIdealTree).not.toHaveBeenCalled();
    expect(mockedArborist.reify).not.toHaveBeenCalled();
  });
});
