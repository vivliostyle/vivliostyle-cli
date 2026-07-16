import { PassThrough, type Writable } from 'node:stream';

import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

type MockSpinner = {
  text: string;
  start: Mock<(text?: string) => unknown>;
  stop: Mock<(finalText?: string) => unknown>;
};

const mockedYoctoSpinner = vi.hoisted(() =>
  vi.fn<() => MockSpinner>(() => {
    const spinner: MockSpinner = {
      text: '',
      start: vi.fn<(text?: string) => unknown>((text) => {
        if (text !== undefined) {
          spinner.text = text;
        }
        return spinner;
      }),
      stop: vi.fn<(finalText?: string) => unknown>(() => spinner),
    };
    return spinner;
  }),
);

vi.mock('yocto-spinner', () => ({
  default: mockedYoctoSpinner,
}));

import { Logger } from '../src/logger.js';

const ttyStream = {
  isTTY: true,
  write: () => true,
} as unknown as Writable;

function setupInteractiveLogger() {
  for (const name of ['VITEST', 'CI']) {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- undefined removes the variable from the stubbed env
    vi.stubEnv(name, undefined);
  }
  vi.stubEnv('TERM', 'xterm');
  Logger.setLogOptions({ logLevel: 'info', stderr: ttyStream });
}

afterEach(() => {
  vi.unstubAllEnvs();
  Logger.setLogOptions({
    logLevel: 'silent',
    stdout: process.stdout,
    stderr: process.stderr,
  });
});

describe('Logger', () => {
  it('disables dependency signal handlers for the spinner', () => {
    // The Logger constructor should call the mocked yocto-spinner with handleSignals: false
    const logger = new Logger({ write: () => true } as unknown as Writable);

    expect(logger).toBeInstanceOf(Logger);
    expect(mockedYoctoSpinner).toHaveBeenCalledOnce();
    expect(mockedYoctoSpinner).toHaveBeenCalledWith(
      expect.objectContaining({
        handleSignals: false,
      }),
    );
  });

  it('checkpoints the last durable text even after transient progress updates', () => {
    setupInteractiveLogger();
    using _ = Logger.startLogging('Start building')!;
    const spinner = mockedYoctoSpinner.mock.results[0]!.value;

    Logger.logUpdate('Building pages');
    Logger.logUpdateProgress('Building pages (1 pages, 100%)');
    expect(spinner.text).toBe('Building pages (1 pages, 100%)');
    Logger.logUpdate('Building PDF');

    // The transition must print the durable text set by logUpdate,
    // not the transient progress text nor suppress the line entirely
    expect(spinner.stop).toHaveBeenCalledWith('INFO Building pages');
    expect(spinner.stop).not.toHaveBeenCalledWith(
      expect.stringContaining('(1 pages, 100%)'),
    );
  });

  it('checkpoints the durable text before a non-blocking log line', () => {
    setupInteractiveLogger();
    using _ = Logger.startLogging('Start building')!;
    const spinner = mockedYoctoSpinner.mock.results[0]!.value;

    Logger.logUpdate('Building pages');
    Logger.logUpdateProgress('entry.md (3 pages, 4%)');
    Logger.logInfo('entry.md');
    Logger.logUpdate('Building PDF');

    const printed = spinner.stop.mock.calls
      .map(([text]: [string?]) => text)
      .filter((text: string | undefined): text is string => text !== undefined);
    expect(printed).toContain('INFO Building pages');
    expect(printed).toContain('INFO entry.md');
    expect(printed.indexOf('INFO Building pages')).toBeLessThan(
      printed.indexOf('INFO entry.md'),
    );
    expect(printed).not.toContainEqual(
      expect.stringContaining('(3 pages, 4%)'),
    );
  });

  it('ignores logUpdateProgress when the output is not interactive', () => {
    const written: string[] = [];
    const stream = new PassThrough();
    stream.on('data', (chunk) => {
      written.push(String(chunk));
    });
    Logger.setLogOptions({ logLevel: 'info', stdout: stream, stderr: stream });

    Logger.logUpdateProgress('entry.md (3 pages, 4%)');
    Logger.logUpdate('Building pages');

    expect(written.join('')).toBe('INFO Building pages\n');
  });
});
