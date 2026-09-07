import { describe, expect, it, vi } from 'vitest';

const mockedCommands = vi.hoisted(() => ({
  runBuildCli: vi.fn<(...args: any[]) => unknown>(),
  runCreateCli: vi.fn<(...args: any[]) => unknown>(),
  runInitCli: vi.fn<(...args: any[]) => unknown>(),
  runPreviewCli: vi.fn<(...args: any[]) => unknown>(),
  runThemeCli: vi.fn<(...args: any[]) => unknown>(),
  runThemeCreateCli: vi.fn<(...args: any[]) => unknown>(),
  runThemeValidateCli: vi.fn<(...args: any[]) => unknown>(),
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

vi.mock('../src/commands/theme.runner.js', () => ({
  runThemeCli: mockedCommands.runThemeCli,
}));

vi.mock('../src/commands/theme-create.runner.js', () => ({
  runThemeCreateCli: mockedCommands.runThemeCreateCli,
}));

vi.mock('../src/commands/theme-validate.runner.js', () => ({
  runThemeValidateCli: mockedCommands.runThemeValidateCli,
}));

describe('standalone command entry points', () => {
  it.each([
    [
      'build',
      mockedCommands.runBuildCli,
      () => import('../src/commands/build.js'),
    ],
    [
      'create',
      mockedCommands.runCreateCli,
      () => import('../src/commands/create.js'),
    ],
    [
      'init',
      mockedCommands.runInitCli,
      () => import('../src/commands/init.js'),
    ],
    [
      'preview',
      mockedCommands.runPreviewCli,
      () => import('../src/commands/preview.js'),
    ],
    [
      'theme',
      mockedCommands.runThemeCli,
      () => import('../src/commands/theme.js'),
    ],
    [
      'theme-create',
      mockedCommands.runThemeCreateCli,
      () => import('../src/commands/theme-create.js'),
    ],
    [
      'theme-validate',
      mockedCommands.runThemeValidateCli,
      () => import('../src/commands/theme-validate.js'),
    ],
  ])('runs the %s command when imported', async (_command, runner, load) => {
    await load();

    expect(runner).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledWith(process.argv);
  });
});
