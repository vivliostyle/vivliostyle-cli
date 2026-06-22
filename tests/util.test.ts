import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const streamZipMock = vi.hoisted(() => ({
  finishExtraction: undefined as (() => void) | undefined,
}));

vi.mock('node-stream-zip', async () => {
  const { EventEmitter } = await import('node:events');
  const nodeFs = await import('node:fs');
  const { join: joinPath } = await import('node:path');

  return {
    default: class extends EventEmitter {
      constructor() {
        super();
        queueMicrotask(() => this.emit('ready'));
      }

      extract(_entry: null, destination: string, callback: () => void) {
        nodeFs.mkdirSync(destination, { recursive: true });
        nodeFs.writeFileSync(joinPath(destination, 'partial'), '');
        streamZipMock.finishExtraction = callback;
      }

      close(callback: () => void) {
        callback();
      }
    },
  };
});

import { openEpub, runCleanupHandlers } from '../src/util.js';

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

it('removes partial EPUB output when cleanup starts during extraction', async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'vivliostyle-cli-epub-'));
  const outputDirectory = join(temporaryDirectory, 'output');
  const opening = openEpub('input.epub', outputDirectory);

  await vi.waitFor(() => {
    expect(fs.existsSync(join(outputDirectory, 'partial'))).toBe(true);
  });

  let cleanupFinished = false;
  const cleanup = runCleanupHandlers().then(() => {
    cleanupFinished = true;
  });
  await Promise.resolve();

  expect(cleanupFinished).toBe(false);
  expect(fs.existsSync(outputDirectory)).toBe(true);

  streamZipMock.finishExtraction?.();
  await opening;
  await cleanup;

  expect(fs.existsSync(outputDirectory)).toBe(false);
});
