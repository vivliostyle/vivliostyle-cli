import { describe, expect, it, vi } from 'vitest';

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
  ])('runs the %s command when imported', async (_command, runner, load) => {
    await load();

    expect(runner).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledWith(process.argv);
  });
});
