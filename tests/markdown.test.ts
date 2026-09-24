import { VFM } from '@vivliostyle/vfm';
import { vol } from 'memfs';
import type { VFile } from 'vfile';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import './mocks/fs.js';
import { Logger } from '../src/logger.js';
import { processMarkdown } from '../src/processor/markdown.js';
import { getFormattedError } from '../src/util.js';

beforeEach(() => {
  vol.fromJSON({ '/work/input.md': '# Hello' }, '/');
  vi.spyOn(Logger, 'logError').mockImplementation(() => {});
  vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  vi.spyOn(Logger, 'logInfo').mockImplementation(() => {});
});

afterEach(() => {
  vol.reset();
  vi.restoreAllMocks();
});

function processWithDiagnostics(diagnose: (file: VFile) => void) {
  return processMarkdown(
    (options, metadata) =>
      VFM(options, metadata).use(() => (_tree, file) => {
        diagnose(file);
      }),
    () => ({}),
    '/work/input.md',
  );
}

it('reports warnings and information with file positions and preserves output', async () => {
  const processed = await processWithDiagnostics((file) => {
    file.message('Warning', { line: 1, column: 3 }, 'test:warning');
    file.info('Information', { line: 1, column: 5 }, 'test:info');
    const unspecified = file.info('Unspecified', { line: 1, column: 7 });
    unspecified.fatal = undefined;
  });

  expect(Logger.logWarn).toHaveBeenCalledExactlyOnceWith(
    '/work/input.md:1:3: Warning',
  );
  expect(Logger.logInfo).toHaveBeenCalledTimes(2);
  expect(Logger.logInfo).toHaveBeenNthCalledWith(
    1,
    '/work/input.md:1:5: Information',
  );
  expect(Logger.logInfo).toHaveBeenNthCalledWith(
    2,
    '/work/input.md:1:7: Unspecified',
  );
  expect(String(processed)).toContain('Hello</h1>');
  expect(processed.messages).toHaveLength(3);
});

it('throws a returned fatal diagnostic with its metadata intact', async () => {
  let fatal: VFile['messages'][number] | undefined;
  const result = processWithDiagnostics((file) => {
    fatal = file.message(
      'Invalid document',
      { line: 1, column: 3 },
      'test:invalid',
    );
    fatal.fatal = true;
  });

  await expect(result).rejects.toBe(fatal);
  expect(fatal).toMatchObject({
    file: '/work/input.md',
    line: 1,
    column: 3,
    source: 'test',
    ruleId: 'invalid',
    fatal: true,
  });
  expect(Logger.logError).toHaveBeenCalledExactlyOnceWith(
    '/work/input.md:1:3: Invalid document',
  );
  expect(Logger.logWarn).not.toHaveBeenCalled();
  expect(Logger.logInfo).not.toHaveBeenCalled();
});

it('propagates processor exceptions', async () => {
  const error = new Error('Processor failed');
  await expect(
    processWithDiagnostics(() => {
      throw error;
    }),
  ).rejects.toBe(error);
});

it('reports diagnostics after a fatal diagnostic before throwing it', async () => {
  const log = vi.fn<(level: string, message: unknown) => void>();
  vi.mocked(Logger.logError).mockImplementation((message) => {
    log('error', message);
  });
  vi.mocked(Logger.logWarn).mockImplementation((message) => {
    log('warn', message);
  });
  vi.mocked(Logger.logInfo).mockImplementation((message) => {
    log('info', message);
  });
  const errors: VFile['messages'] = [];
  const result = processWithDiagnostics((file) => {
    file.message('Before', { line: 1, column: 1 });
    const error = file.message('Invalid', { line: 1, column: 2 });
    error.fatal = true;
    errors.push(error);
    file.message('After', { line: 1, column: 3 });
    file.info('Information', { line: 1, column: 4 });
  });

  await expect(result).rejects.toBe(errors[0]);
  expect(log.mock.calls).toEqual([
    ['warn', '/work/input.md:1:1: Before'],
    ['error', '/work/input.md:1:2: Invalid'],
    ['warn', '/work/input.md:1:3: After'],
    ['info', '/work/input.md:1:4: Information'],
  ]);
  expect(Logger.logWarn).toHaveBeenCalledTimes(2);
  expect(Logger.logWarn).toHaveBeenNthCalledWith(
    1,
    '/work/input.md:1:1: Before',
  );
  expect(Logger.logWarn).toHaveBeenNthCalledWith(
    2,
    '/work/input.md:1:3: After',
  );
  expect(Logger.logInfo).toHaveBeenCalledExactlyOnceWith(
    '/work/input.md:1:4: Information',
  );
});

it('preserves and displays every fatal diagnostic while reporting warnings and information', async () => {
  const errors: VFile['messages'] = [];
  const result = processWithDiagnostics((file) => {
    const first = file.message(
      'First error',
      { line: 1, column: 1 },
      'test:first',
    );
    first.fatal = true;
    file.message('Warning', { line: 1, column: 2 });
    const second = file.message(
      'Second error',
      { line: 1, column: 3 },
      'test:second',
    );
    second.fatal = true;
    file.info('Information', { line: 1, column: 4 });
    errors.push(first, second);
  });

  const failure = (await result.catch(
    (error: unknown) => error,
  )) as AggregateError;
  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure.errors).toHaveLength(2);
  expect(failure.errors[0]).toBe(errors[0]);
  expect(failure.errors[1]).toBe(errors[1]);
  expect(Logger.logError).toHaveBeenCalledTimes(2);
  expect(Logger.logError).toHaveBeenNthCalledWith(
    1,
    '/work/input.md:1:1: First error',
  );
  expect(Logger.logError).toHaveBeenNthCalledWith(
    2,
    '/work/input.md:1:3: Second error',
  );
  expect(getFormattedError(failure)).toContain(
    '/work/input.md:1:1: First error',
  );
  expect(getFormattedError(failure)).toContain(
    '/work/input.md:1:3: Second error',
  );
  expect(Logger.logWarn).toHaveBeenCalledExactlyOnceWith(
    '/work/input.md:1:2: Warning',
  );
  expect(Logger.logInfo).toHaveBeenCalledExactlyOnceWith(
    '/work/input.md:1:4: Information',
  );
});

it('converts documents without diagnostics quietly', async () => {
  const file = await processWithDiagnostics(() => {});

  expect(String(file)).toContain('Hello</h1>');
  expect(Logger.logError).not.toHaveBeenCalled();
  expect(Logger.logWarn).not.toHaveBeenCalled();
  expect(Logger.logInfo).not.toHaveBeenCalled();
});
