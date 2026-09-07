import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedCommands = vi.hoisted(() => ({
  runThemeCreateCli: vi.fn<(...args: any[]) => unknown>(),
  runThemeValidateCli: vi.fn<(...args: any[]) => unknown>(),
}));

vi.mock('../src/commands/theme-create.runner.js', () => ({
  runThemeCreateCli: mockedCommands.runThemeCreateCli,
}));

vi.mock('../src/commands/theme-validate.runner.js', () => ({
  runThemeValidateCli: mockedCommands.runThemeValidateCli,
}));

import { runThemeCli } from '../src/commands/theme.runner.js';

function expectThemeHelp(calls: unknown[][]) {
  const output = calls.flat().map(String).join('');

  expect(output).toContain('Usage: vivliostyle theme [options] [command]');
  for (const command of ['create', 'validate']) {
    expect(output).toMatch(new RegExp(`^  ${command}\\b`, 'mv'));
  }
}

describe('runThemeCli', () => {
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
    ['create', mockedCommands.runThemeCreateCli],
    ['validate', mockedCommands.runThemeValidateCli],
  ])('routes the %s subcommand in-process', async (command, runner) => {
    await runThemeCli(['vivliostyle', 'theme', command, '--name', 'x', 'dir']);

    expect(runner).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledWith([
      'vivliostyle',
      `theme ${command}`,
      '--name',
      'x',
      'dir',
    ]);
  });

  it('shows the theme command tree', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runThemeCli(['vivliostyle', 'theme', '--help']);

    expectThemeHelp(write.mock.calls);
    expect(process.exitCode).toBe(0);
  });

  it('shows help with a failure status when no subcommand is specified', async () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await runThemeCli(['vivliostyle', 'theme']);

    expectThemeHelp(write.mock.calls);
    expect(process.exitCode).toBe(1);
  });

  it('routes help for subcommands in-process', async () => {
    await runThemeCli(['vivliostyle', 'theme', 'help', 'validate']);

    expect(mockedCommands.runThemeValidateCli).toHaveBeenCalledWith([
      'vivliostyle',
      'theme validate',
      '--help',
    ]);
  });

  it('reports unknown subcommands', async () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await runThemeCli(['vivliostyle', 'theme', 'bogus']);

    expect(write).toHaveBeenCalledWith("error: unknown command 'bogus'\n");
    expect(process.exitCode).toBe(1);
    expect(mockedCommands.runThemeCreateCli).not.toHaveBeenCalled();
    expect(mockedCommands.runThemeValidateCli).not.toHaveBeenCalled();
  });
});
