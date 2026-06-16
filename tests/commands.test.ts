import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UtilModule from '../src/util.js';

const mocked = vi.hoisted(() => ({
  build: vi.fn(),
  create: vi.fn(),
  preview: vi.fn(),
  parseBuildCommand: vi.fn(),
  parseCreateCommand: vi.fn(),
  parseInitCommand: vi.fn(),
  parsePreviewCommand: vi.fn(),
  cliSignal: new AbortController().signal,
  runCleanupHandlers: vi.fn<() => Promise<void>>(async () => {}),
}));

vi.mock('../src/entry-util.js', () => ({
  isDirectExecution: vi.fn(() => false),
  runCliCommand: vi.fn(async (command) => {
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

import { runBuildCli } from '../src/commands/build.runner.js';
import { runCreateCli } from '../src/commands/create.runner.js';
import { runInitCli } from '../src/commands/init.runner.js';
import { runPreviewCli } from '../src/commands/preview.runner.js';

describe('CLI command signals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['build', mocked.parseBuildCommand, mocked.build, runBuildCli],
    ['create', mocked.parseCreateCommand, mocked.create, runCreateCli],
    ['init', mocked.parseInitCommand, mocked.create, runInitCli],
    ['preview', mocked.parsePreviewCommand, mocked.preview, runPreviewCli],
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

  it('keeps the preview command active until the server closes', async () => {
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
