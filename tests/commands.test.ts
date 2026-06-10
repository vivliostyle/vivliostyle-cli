import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  build: vi.fn(),
  create: vi.fn(),
  preview: vi.fn(),
  parseBuildCommand: vi.fn(),
  parseCreateCommand: vi.fn(),
  parseInitCommand: vi.fn(),
  parsePreviewCommand: vi.fn(),
  cliSignal: new AbortController().signal,
}));

vi.mock('../src/entry-util.js', () => ({
  isDirectExecution: vi.fn(() => false),
  runCliCommand: vi.fn(async (command) => {
    await command(mocked.cliSignal);
  }),
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
});
