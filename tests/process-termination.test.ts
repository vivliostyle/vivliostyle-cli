import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  registerCleanupHandler,
  registerTerminationHook,
  runCleanupHandlers,
  setupProcessTermination,
} from '../src/util.js';

const fixturePath = fileURLToPath(
  new URL('./fixtures/process-termination.ts', import.meta.url),
);
const describeOnPosix = process.platform === 'win32' ? describe.skip : describe;

describe('process termination', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits for cleanup already in progress after repeated signals', async () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      listeners.set(String(event), listener);
      return process;
    });
    vi.spyOn(process, 'once').mockImplementation(() => process);
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);

    let resolveCleanup: (() => void) | undefined;
    const cleanup = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
        }),
    );
    const regularCleanup = vi.fn<() => void>();
    const terminationHook = vi.fn<(exitCode: number) => void>();
    registerTerminationHook(terminationHook);
    registerCleanupHandler('regular cleanup', regularCleanup);
    registerCleanupHandler('priority cleanup', cleanup, { prepend: true });

    setupProcessTermination();

    expect(listeners.has('SIGINT')).toBe(true);
    expect(listeners.has('SIGTERM')).toBe(true);
    expect(listeners.has('SIGHUP')).toBe(true);

    const cleanupRun = runCleanupHandlers();
    expect(runCleanupHandlers()).toBe(cleanupRun);
    expect(cleanup).toHaveBeenCalledOnce();

    // Invoke SIGHUP twice while normal cleanup is already in progress. This
    // exercises both cleanup serialization and repeated signal handling.
    listeners.get('SIGHUP')?.();
    listeners.get('SIGHUP')?.();

    expect(terminationHook).toHaveBeenCalledWith(129);
    expect(regularCleanup).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();

    resolveCleanup?.();
    await cleanupRun;
    await vi.waitFor(() => {
      expect(regularCleanup).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledWith(129);
    });
  });
});

// Node.js cannot generate catchable CTRL_C_EVENT or CTRL_BREAK_EVENT for a
// child process on win32 using its public APIs. subprocess.kill() forcefully
// terminates the process there, so Windows needs a native/PTY-based or manual
// integration test rather than pretending this POSIX signal test is portable.
describeOnPosix('process termination signals', () => {
  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ] as const)(
    'aborts active work and waits for cleanup after %s',
    async (terminationSignal, exitCode) => {
      const temporaryDirectory = await mkdtemp(
        join(tmpdir(), 'vivliostyle-cli-signal-'),
      );
      const markerPath = join(temporaryDirectory, 'cleaned');
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', fixturePath, markerPath],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let output = '';
      let signalSent = false;
      let repeatedSignalTimeout: NodeJS.Timeout | undefined;
      const ready = new Promise<void>((resolve, reject) => {
        const handleOutput = (chunk: Buffer) => {
          output += chunk.toString();
          if (!signalSent && output.includes('READY\n')) {
            signalSent = true;
            child.kill(terminationSignal);
            repeatedSignalTimeout = setTimeout(() => {
              if (child.exitCode === null && child.signalCode === null) {
                child.kill(terminationSignal);
              }
            }, 20);
            resolve();
          }
        };
        child.stdout.on('data', handleOutput);
        child.stderr.on('data', handleOutput);
        child.once('error', reject);
        child.once('close', (code, signal) => {
          if (!signalSent) {
            reject(
              new Error(
                `Fixture exited before it was ready (code: ${code}, signal: ${signal})\n${output}`,
              ),
            );
          }
        });
      });
      const closed = new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
      }>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
      });
      const timeout = setTimeout(() => child.kill('SIGKILL'), 4_000);

      try {
        await ready;
        const result = await closed;

        expect(result).toEqual({ code: exitCode, signal: null });
        await expect(readFile(markerPath, 'utf8')).resolves.toBe(
          JSON.stringify({ aborted: true, exitCode }),
        );
      } finally {
        clearTimeout(timeout);
        clearTimeout(repeatedSignalTimeout);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
          await closed;
        }
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    },
    10_000,
  );
});
