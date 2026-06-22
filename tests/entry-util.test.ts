import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PromptCancelError } from '../src/entry-util.js';

let terminationHook: ((exitCode: number) => void) | undefined;

const mockedUtil = vi.hoisted(() => ({
  gracefulError: vi.fn<(...args: any[]) => void>(),
  setupProcessTermination: vi.fn<(...args: any[]) => void>(),
  unregisterTerminationHook: vi.fn<() => void>(),
}));

vi.mock('../src/util.js', () => ({
  gracefulError: mockedUtil.gracefulError,
  setupProcessTermination: mockedUtil.setupProcessTermination,
  registerTerminationHook: vi.fn<
    (hook: (exitCode: number) => void) => () => void
  >((hook) => {
    terminationHook = hook;
    return mockedUtil.unregisterTerminationHook;
  }),
}));

import { isDirectExecution, runCliCommand } from '../src/entry-util.js';
import { gracefulError, setupProcessTermination } from '../src/util.js';

describe('runCliCommand', () => {
  beforeEach(() => {
    terminationHook = undefined;
    vi.clearAllMocks();
  });

  it('suppresses the CLI interrupt reason after a termination signal', async () => {
    // oxlint-disable-next-line require-await -- command callback must return a Promise for runCliCommand
    await runCliCommand(async (signal) => {
      terminationHook?.(130);
      signal.throwIfAborted();
    });

    expect(setupProcessTermination).toHaveBeenCalledOnce();
    expect(gracefulError).not.toHaveBeenCalled();
    expect(mockedUtil.unregisterTerminationHook).toHaveBeenCalledOnce();
  });

  it('reports regular command errors', async () => {
    const err = new Error('boom');

    // oxlint-disable-next-line require-await -- command callback must return a Promise for runCliCommand
    await runCliCommand(async () => {
      throw err;
    });

    expect(gracefulError).toHaveBeenCalledWith(err);
    expect(mockedUtil.unregisterTerminationHook).toHaveBeenCalledOnce();
  });

  it('treats prompt cancellation as a non-error command exit', async () => {
    // oxlint-disable-next-line require-await -- command callback must return a Promise for runCliCommand
    await runCliCommand(async () => {
      throw new PromptCancelError();
    });

    expect(setupProcessTermination).toHaveBeenCalledOnce();
    expect(gracefulError).not.toHaveBeenCalled();
    expect(mockedUtil.unregisterTerminationHook).toHaveBeenCalledOnce();
  });
});

describe('isDirectExecution', () => {
  const originalEntryPath = process.argv[1];
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  let temporaryDirectory: string | undefined;

  beforeEach(() => {
    process.argv[1] = originalEntryPath;
  });

  afterEach(() => {
    process.argv[1] = originalEntryPath;
    if (temporaryDirectory) {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('recognizes an entry point reached through a symbolic link', () => {
    temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'vivliostyle-cli-entry-'),
    );
    const realDirectory = path.join(temporaryDirectory, 'real');
    const linkedDirectory = path.join(temporaryDirectory, 'linked');
    const realEntryPath = path.join(realDirectory, 'cli.js');
    const linkedEntryPath = path.join(linkedDirectory, 'cli.js');
    fs.mkdirSync(realDirectory);
    fs.writeFileSync(realEntryPath, '');
    fs.symlinkSync(realDirectory, linkedDirectory, symlinkType);
    process.argv[1] = linkedEntryPath;

    expect(isDirectExecution(pathToFileURL(realEntryPath).href)).toBe(true);
  });
});
