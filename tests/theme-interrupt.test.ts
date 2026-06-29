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

vi.mock('@npmcli/arborist', () => ({
  default: class Arborist {
    buildIdealTree = mockedArborist.buildIdealTree;
    reify = mockedArborist.reify;
  },
}));

import type { ParsedTheme } from '../src/config/resolve.js';
import { installThemeDependencies } from '../src/processor/theme.js';
import { runCleanupHandlers } from '../src/util.js';

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
  let themesDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    themesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vivliostyle-theme-interrupt-'),
    );
    mockedArborist.buildIdealTree.mockResolvedValue({
      children: new Map(),
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
      expect(mockedArborist.reify).toHaveBeenCalledOnce();
    });
    controller.abort(abortReason);

    let cleanupSettled = false;
    const cleanup = runCleanupHandlers().then(() => {
      cleanupSettled = true;
    });
    await Promise.resolve();
    expect(cleanupSettled).toBe(false);

    rejectReify?.(arboristError);

    await cleanup;
    await expect(installation).rejects.toBe(abortReason);
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
  });

  it('finishes local theme linking before reporting cancellation', async () => {
    const controller = new AbortController();
    const abortReason = new Error('interrupted');
    const sourcePath = path.join(themesDir, 'source-theme');
    const installedPath = path.join(themesDir, 'node_modules', 'example-theme');
    fs.mkdirSync(sourcePath);
    fs.mkdirSync(installedPath, { recursive: true });
    mockedArborist.reify.mockImplementation(() => {
      controller.abort(abortReason);
      return Promise.resolve({
        children: new Map([
          [
            'example-theme',
            {
              path: installedPath,
              resolved: 'file:source-theme',
            },
          ],
        ]),
      });
    });

    await expect(
      installThemeDependencies({
        themesDir,
        themeIndexes,
        signal: controller.signal,
      }),
    ).rejects.toBe(abortReason);

    expect(fs.realpathSync(installedPath)).toBe(fs.realpathSync(sourcePath));
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
