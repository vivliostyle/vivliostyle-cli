import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

const mockedX = vi.hoisted(() =>
  vi.fn<
    (
      command: string,
      args: string[],
      options: { signal?: AbortSignal },
    ) => AsyncIterable<string>
  >(),
);

vi.mock('tinyexec', () => ({
  x: mockedX,
}));

import { create } from '../src/core/create.js';
import { runCleanupHandlers } from '../src/util.js';

let temporaryDirectory: string | undefined;

afterEach(() => {
  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

it('aborts dependency installation and waits for the child process to stop', async () => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'vivliostyle-cli-create-install-'),
  );
  const templateDirectory = path.join(temporaryDirectory, 'template');
  fs.mkdirSync(templateDirectory);
  fs.writeFileSync(path.join(templateDirectory, 'package.json'), '{}');

  let finishInstall: (() => void) | undefined;
  const installFinished = new Promise<void>((resolve) => {
    finishInstall = resolve;
  });
  mockedX.mockReturnValue({
    [Symbol.asyncIterator]() {
      return {
        async next() {
          await installFinished;
          return { done: true, value: undefined };
        },
      };
    },
  });

  const controller = new AbortController();
  const abortReason = new Error('interrupted');
  const creating = create({
    cwd: temporaryDirectory,
    projectPath: 'book',
    title: 'Book',
    author: 'Author',
    language: 'en',
    theme: false,
    template: 'template',
    installDependencies: true,
    logLevel: 'silent',
    signal: controller.signal,
  });

  await vi.waitFor(() => {
    expect(mockedX).toHaveBeenCalledOnce();
  });
  expect(mockedX.mock.calls[0]?.[2]).toEqual(
    expect.objectContaining({ signal: controller.signal }),
  );

  controller.abort(abortReason);
  let cleanupFinished = false;
  const cleanup = runCleanupHandlers().then(() => {
    cleanupFinished = true;
  });
  await Promise.resolve();

  expect(cleanupFinished).toBe(false);

  finishInstall?.();

  await expect(creating).rejects.toBe(abortReason);
  await cleanup;
});

it('normalizes dependency installation errors after cancellation', async () => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'vivliostyle-cli-create-install-'),
  );
  const templateDirectory = path.join(temporaryDirectory, 'template');
  fs.mkdirSync(templateDirectory);
  fs.writeFileSync(path.join(templateDirectory, 'package.json'), '{}');

  let rejectInstall: ((error: Error) => void) | undefined;
  mockedX.mockReturnValue({
    [Symbol.asyncIterator]() {
      return {
        async next() {
          await new Promise<void>((_, reject) => {
            rejectInstall = reject;
          });
          return { done: true, value: undefined };
        },
      };
    },
  });

  const controller = new AbortController();
  const abortReason = new Error('interrupted');
  const installError = new Error('install failed');
  const creating = create({
    cwd: temporaryDirectory,
    projectPath: 'book',
    title: 'Book',
    author: 'Author',
    language: 'en',
    theme: false,
    template: 'template',
    installDependencies: true,
    logLevel: 'silent',
    signal: controller.signal,
  });

  await vi.waitFor(() => {
    expect(mockedX).toHaveBeenCalledOnce();
  });

  controller.abort(abortReason);
  rejectInstall?.(installError);

  await expect(creating).rejects.toBe(abortReason);
});
