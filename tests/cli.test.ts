import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedCommands = vi.hoisted(() => ({
  runBuildCli: vi.fn<(...args: any[]) => unknown>(),
  runCreateCli: vi.fn<(...args: any[]) => unknown>(),
  runInitCli: vi.fn<(...args: any[]) => unknown>(),
  runPreviewCli: vi.fn<(...args: any[]) => unknown>(),
}));

vi.mock('../src/commands/build.runner.js', () => ({
  runBuildCli: mockedCommands.runBuildCli,
}));

vi.mock('../src/commands/create.runner.js', () => ({
  runCreateCli: mockedCommands.runCreateCli,
}));

vi.mock('../src/commands/init.runner.js', () => ({
  runInitCli: mockedCommands.runInitCli,
}));

vi.mock('../src/commands/preview.runner.js', () => ({
  runPreviewCli: mockedCommands.runPreviewCli,
}));

import { dispatchCli } from '../src/cli.js';

function expectRootHelp(calls: unknown[][]) {
  const output = calls.flat().map(String).join('');

  expect(output).toContain('Usage: vivliostyle [options] [command]');
  for (const command of ['create', 'init', 'build', 'preview']) {
    expect(output).toMatch(new RegExp(`^  ${command}\\b`, 'm'));
  }
}

describe('dispatchCli', () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = originalExitCode;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  it.each([
    ['build', mockedCommands.runBuildCli],
    ['create', mockedCommands.runCreateCli],
    ['init', mockedCommands.runInitCli],
    ['preview', mockedCommands.runPreviewCli],
  ])('routes the %s subcommand in-process', async (command, runner) => {
    await dispatchCli(['node', 'cli.js', command, '--help']);

    expect(runner).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledWith(['vivliostyle', command, '--help']);
  });

  it('shows the root command tree', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await dispatchCli(['node', 'cli.js', '--help']);

    expectRootHelp(write.mock.calls);
    expect(process.exitCode).toBe(0);
  });

  it('shows root help with a failure status when no command is specified', async () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await dispatchCli(['node', 'cli.js']);

    expectRootHelp(write.mock.calls);
    expect(process.exitCode).toBe(1);
  });

  it('preserves raw subcommand arguments for the subcommand parser', async () => {
    await dispatchCli(['node', 'cli.js', 'build', '--', '-input.md']);

    expect(mockedCommands.runBuildCli).toHaveBeenCalledOnce();
    expect(mockedCommands.runBuildCli).toHaveBeenCalledWith([
      'vivliostyle',
      'build',
      '--',
      '-input.md',
    ]);
  });

  it('propagates unexpected subcommand failures', async () => {
    const error = new Error('unexpected failure');
    mockedCommands.runBuildCli.mockRejectedValueOnce(error);

    await expect(
      dispatchCli(['node', 'cli.js', 'build', 'input.md']),
    ).rejects.toBe(error);
  });

  it('routes help for subcommands in-process', async () => {
    await dispatchCli(['node', 'cli.js', 'help', 'preview']);

    expect(mockedCommands.runPreviewCli).toHaveBeenCalledOnce();
    expect(mockedCommands.runPreviewCli).toHaveBeenCalledWith([
      'vivliostyle',
      'preview',
      '--help',
    ]);
  });

  it('shows root help successfully for the help command', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await dispatchCli(['node', 'cli.js', 'help']);

    expectRootHelp(write.mock.calls);
    expect(process.exitCode).toBe(0);
  });

  it('reports unknown options through Commander', async () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await dispatchCli(['node', 'cli.js', '--unknown']);

    expect(write).toHaveBeenCalledWith("error: unknown option '--unknown'\n");
    expect(process.exitCode).toBe(1);
  });

  it('reports unknown commands with spelling suggestions', async () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await dispatchCli(['node', 'cli.js', 'buid']);

    expect(write).toHaveBeenCalledWith(
      "error: unknown command 'buid'\n(Did you mean build?)\n",
    );
    expect(process.exitCode).toBe(1);
  });

  it.each(['constructor', '__proto__'])(
    'does not treat the inherited property %s as a command',
    async (command) => {
      const write = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);

      await dispatchCli(['node', 'cli.js', command]);

      expect(write).toHaveBeenCalledWith(
        `error: unknown command '${command}'\n`,
      );
      expect(process.exitCode).toBe(1);
      expect(mockedCommands.runBuildCli).not.toHaveBeenCalled();
      expect(mockedCommands.runCreateCli).not.toHaveBeenCalled();
      expect(mockedCommands.runInitCli).not.toHaveBeenCalled();
      expect(mockedCommands.runPreviewCli).not.toHaveBeenCalled();
    },
  );
});
