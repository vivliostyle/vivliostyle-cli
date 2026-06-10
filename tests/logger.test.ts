import type { Writable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

const mockedYoctoSpinner = vi.hoisted(() =>
  vi.fn(() => ({ text: '', stop: vi.fn() })),
);

vi.mock('yocto-spinner', () => ({
  default: mockedYoctoSpinner,
}));

import { Logger } from '../src/logger.js';

describe('Logger', () => {
  it('disables dependency signal handlers for the spinner', () => {
    new Logger({ write: () => true } as unknown as Writable);

    expect(mockedYoctoSpinner).toHaveBeenCalledOnce();
    expect(mockedYoctoSpinner).toHaveBeenCalledWith(
      expect.objectContaining({
        handleSignals: false,
      }),
    );
  });
});
