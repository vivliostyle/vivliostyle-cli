import type { ExecFileOptions } from 'node:child_process';

import { beforeEach, expect, it, vi } from 'vitest';

import type * as UtilModule from '../src/util.js';

const mockedX = vi.hoisted(() =>
  vi.fn<
    (
      command: string,
      args: string[],
      options: { signal?: AbortSignal },
    ) => AsyncIterable<string>
  >(),
);
const mockedExec = vi.hoisted(() =>
  vi.fn<
    (
      command: string,
      args?: string[],
      options?: ExecFileOptions,
    ) => Promise<{ stdout: string; stderr: string }>
  >(async () => ({ stdout: '24.0.0', stderr: '' })),
);

vi.mock('tinyexec', () => ({
  x: mockedX,
}));

vi.mock('../src/node-modules.js', () => ({
  importNodeModule: vi.fn<() => Promise<{ default: () => Promise<boolean> }>>(
    async () => ({
      default: vi.fn<() => Promise<boolean>>(async () => true),
    }),
  ),
}));

vi.mock('../src/util.js', async (importOriginal) => ({
  ...(await importOriginal<typeof UtilModule>()),
  exec: mockedExec,
}));

import { runContainer } from '../src/container.js';
import { runCleanupHandlers } from '../src/util.js';

beforeEach(() => {
  mockedExec.mockClear();
  mockedX.mockReset();
});

it('aborts Docker and waits for its process to stop', async () => {
  let finishContainer: (() => void) | undefined;
  const containerFinished = new Promise<void>((resolve) => {
    finishContainer = resolve;
  });
  mockedX.mockReturnValue({
    [Symbol.asyncIterator]() {
      return {
        async next() {
          await containerFinished;
          return { done: true, value: undefined };
        },
      };
    },
  });

  const controller = new AbortController();
  const abortReason = new Error('interrupted');
  const running = runContainer({
    image: 'example/image',
    userVolumeArgs: [],
    commandArgs: ['build'],
    signal: controller.signal,
  });

  await vi.waitFor(() => {
    expect(mockedX).toHaveBeenCalledOnce();
  });
  expect(mockedExec).toHaveBeenCalledWith(
    'docker',
    ['version', '--format', '{{.Server.Version}}'],
    { signal: controller.signal },
  );
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

  finishContainer?.();

  await expect(running).rejects.toBe(abortReason);
  await cleanup;
});
