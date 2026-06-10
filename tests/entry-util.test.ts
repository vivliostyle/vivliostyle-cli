import { beforeEach, describe, expect, it, vi } from 'vitest';

let terminationHook: ((exitCode: number) => void) | undefined;

const mockedUtil = vi.hoisted(() => ({
  gracefulError: vi.fn(),
  setupProcessTermination: vi.fn(),
  unregisterTerminationHook: vi.fn(),
}));

vi.mock('../src/util.js', () => ({
  gracefulError: mockedUtil.gracefulError,
  setupProcessTermination: mockedUtil.setupProcessTermination,
  registerTerminationHook: vi.fn((hook) => {
    terminationHook = hook;
    return mockedUtil.unregisterTerminationHook;
  }),
}));

import { runCliCommand } from '../src/entry-util.js';
import { gracefulError, setupProcessTermination } from '../src/util.js';

describe('runCliCommand', () => {
  beforeEach(() => {
    terminationHook = undefined;
    vi.clearAllMocks();
  });

  it('suppresses the CLI interrupt reason after a termination signal', async () => {
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

    await runCliCommand(async () => {
      throw err;
    });

    expect(gracefulError).toHaveBeenCalledWith(err);
    expect(mockedUtil.unregisterTerminationHook).toHaveBeenCalledOnce();
  });
});
