import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ThemeValidationResult } from '../src/core/theme-validate.js';
import type * as UtilModule from '../src/util.js';

const mocked = vi.hoisted(() => ({
  build: vi.fn<(...args: any[]) => Promise<unknown>>(),
  create: vi.fn<(...args: any[]) => Promise<unknown>>(),
  preview: vi.fn<(...args: any[]) => Promise<unknown>>(),
  createTheme: vi.fn<(...args: any[]) => Promise<unknown>>(),
  validateTheme: vi.fn<(...args: any[]) => Promise<ThemeValidationResult[]>>(
    () => Promise.resolve([]),
  ),
  parseBuildCommand: vi.fn<(...args: any[]) => Record<string, unknown>>(),
  parseCreateCommand: vi.fn<(...args: any[]) => Record<string, unknown>>(),
  parseInitCommand: vi.fn<(...args: any[]) => Record<string, unknown>>(),
  parsePreviewCommand: vi.fn<(...args: any[]) => Record<string, unknown>>(),
  parseThemeCreateCommand: vi.fn<(...args: any[]) => Record<string, unknown>>(),
  parseThemeValidateCommand:
    vi.fn<(...args: any[]) => Record<string, unknown>>(),
  cliSignal: new AbortController().signal,
  runCleanupHandlers: vi.fn<() => Promise<void>>(async () => {}),
}));

vi.mock('../src/entry-util.js', () => ({
  isDirectExecution: vi.fn<() => boolean>(() => false),
  runCliCommand: vi.fn<
    (command: (signal: AbortSignal) => unknown) => Promise<void>
  >(async (command) => {
    await command(mocked.cliSignal);
  }),
}));

vi.mock('../src/util.js', async (importOriginal) => ({
  ...(await importOriginal<typeof UtilModule>()),
  runCleanupHandlers: mocked.runCleanupHandlers,
}));

vi.mock('../src/core/build.js', () => ({
  build: mocked.build,
}));

vi.mock('../src/core/create.js', () => ({
  create: mocked.create,
}));

vi.mock('../src/core/preview.js', () => ({
  preview: mocked.preview,
}));

vi.mock('../src/core/theme-create.js', () => ({
  createTheme: mocked.createTheme,
}));

vi.mock('../src/core/theme-validate.js', () => ({
  validateTheme: mocked.validateTheme,
}));

vi.mock('../src/commands/build.parser.js', () => ({
  parseBuildCommand: mocked.parseBuildCommand,
}));

vi.mock('../src/commands/create.parser.js', () => ({
  parseCreateCommand: mocked.parseCreateCommand,
}));

vi.mock('../src/commands/init.parser.js', () => ({
  parseInitCommand: mocked.parseInitCommand,
}));

vi.mock('../src/commands/preview.parser.js', () => ({
  parsePreviewCommand: mocked.parsePreviewCommand,
}));

vi.mock('../src/commands/theme-create.parser.js', () => ({
  parseThemeCreateCommand: mocked.parseThemeCreateCommand,
}));

vi.mock('../src/commands/theme-validate.parser.js', () => ({
  parseThemeValidateCommand: mocked.parseThemeValidateCommand,
}));

import { runBuildCli } from '../src/commands/build.runner.js';
import { runCreateCli } from '../src/commands/create.runner.js';
import { runInitCli } from '../src/commands/init.runner.js';
import { runPreviewCli } from '../src/commands/preview.runner.js';
import { runThemeCreateCli } from '../src/commands/theme-create.runner.js';
import { runThemeValidateCli } from '../src/commands/theme-validate.runner.js';

describe('CLI command signals', () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = originalExitCode;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it.each([
    ['build', mocked.parseBuildCommand, mocked.build, runBuildCli],
    ['create', mocked.parseCreateCommand, mocked.create, runCreateCli],
    ['init', mocked.parseInitCommand, mocked.create, runInitCli],
    ['preview', mocked.parsePreviewCommand, mocked.preview, runPreviewCli],
    [
      'theme create',
      mocked.parseThemeCreateCommand,
      mocked.createTheme,
      runThemeCreateCli,
    ],
    [
      'theme validate',
      mocked.parseThemeValidateCommand,
      mocked.validateTheme,
      runThemeValidateCli,
    ],
  ])(
    'passes the CLI signal to the %s operation',
    async (command, parser, operation, runCommand) => {
      const parsedSignal = new AbortController().signal;
      parser.mockReturnValue({ signal: parsedSignal });

      await runCommand(['vivliostyle', command]);

      expect(operation.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          signal: mocked.cliSignal,
        }),
      );
    },
  );

  it('sets a failure exit code when theme validation reports errors', async () => {
    mocked.parseThemeValidateCommand.mockReturnValue({});
    mocked.validateTheme.mockResolvedValueOnce([
      { type: 'error', message: 'invalid' },
    ]);

    await runThemeValidateCli(['vivliostyle', 'theme validate']);

    expect(process.exitCode).toBe(1);
  });

  it('keeps the preview command active until the server closes', async () => {
    // oxlint-disable-next-line prefer-event-target -- emulates a Node.js http.Server, which is an EventEmitter
    const httpServer = new EventEmitter() as EventEmitter & {
      listening: boolean;
    };
    httpServer.listening = true;
    mocked.parsePreviewCommand.mockReturnValue({});
    mocked.preview.mockResolvedValue({ httpServer });

    let settled = false;
    const running = runPreviewCli(['vivliostyle', 'preview']).then(() => {
      settled = true;
    });

    await vi.waitFor(() => {
      expect(mocked.preview).toHaveBeenCalledOnce();
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(mocked.runCleanupHandlers).not.toHaveBeenCalled();

    httpServer.listening = false;
    httpServer.emit('close');

    await running;
    expect(settled).toBe(true);
    expect(mocked.runCleanupHandlers).toHaveBeenCalledOnce();
  });
});
