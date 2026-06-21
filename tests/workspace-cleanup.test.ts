import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type * as UtilModule from '../src/util.js';

const mockedMove = vi.hoisted(() =>
  vi.fn<(from: string, to: string) => Promise<void>>(),
);
const mockedRegisterCleanupHandler = vi.hoisted(() =>
  vi.fn<(message: string, handler: () => Promise<void>) => () => void>(),
);

vi.mock('fs-extra/esm', async () => {
  return {
    copy: vi.fn<() => Promise<void>>(),
    move: mockedMove.mockImplementation(async (from, to) => {
      await fsPromises.rename(from, to);
    }),
  };
});

vi.mock('../src/util.js', async (importOriginal) => {
  const actual = await importOriginal<typeof UtilModule>();
  return {
    ...actual,
    registerCleanupHandler: mockedRegisterCleanupHandler,
  };
});

import type { ResolvedTaskConfig } from '../src/config/resolve.js';
import { cleanupWorkspace } from '../src/processor/compile.js';

let temporaryDirectory: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mockedRegisterCleanupHandler.mockReturnValue(vi.fn<() => void>());
});

afterEach(() => {
  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

it('unregisters workspace cleanup handler after cleanup failure', async () => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'vivliostyle-workspace-cleanup-'),
  );
  const entryContextDir = path.join(temporaryDirectory, 'entry');
  const workspaceDir = path.join(temporaryDirectory, 'workspace');
  const themesDir = path.join(workspaceDir, 'themes');
  fs.mkdirSync(entryContextDir);
  fs.mkdirSync(themesDir, { recursive: true });

  const cleanupError = new Error('cleanup failed');
  mockedMove.mockRejectedValueOnce(cleanupError);
  const unregisterCleanupHandler = vi.fn<() => void>();
  mockedRegisterCleanupHandler.mockReturnValue(unregisterCleanupHandler);

  await expect(
    cleanupWorkspace({
      entryContextDir,
      workspaceDir,
      themesDir,
      entries: [],
    } as unknown as ResolvedTaskConfig),
  ).rejects.toBe(cleanupError);

  expect(mockedRegisterCleanupHandler).toHaveBeenCalledWith(
    'Waiting for workspace cleanup',
    expect.any(Function),
  );
  expect(unregisterCleanupHandler).toHaveBeenCalledOnce();
});
