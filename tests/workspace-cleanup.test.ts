import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mockedMove = vi.hoisted(() =>
  vi.fn<(from: string, to: string) => Promise<void>>(),
);

vi.mock('fs-extra/esm', () => {
  return {
    copy: vi.fn<() => Promise<void>>(),
    move: mockedMove.mockImplementation(async (from, to) => {
      await fsPromises.rename(from, to);
    }),
  };
});

import type { ResolvedTaskConfig } from '../src/config/resolve.js';
import { cleanupWorkspace } from '../src/processor/compile.js';

let temporaryDirectory: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

it('removes the temporary moved workspace after cleanup failure', async () => {
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

  await expect(
    cleanupWorkspace({
      entryContextDir,
      workspaceDir,
      themesDir,
      entries: [],
    } as unknown as ResolvedTaskConfig),
  ).rejects.toBe(cleanupError);

  const leftovers = fs
    .readdirSync(temporaryDirectory)
    .filter((name) => name.startsWith('.vs-'));
  expect(leftovers).toEqual([]);
});
