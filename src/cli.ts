#!/usr/bin/env node

import process from 'node:process';

import { Command, CommanderError } from 'commander';

import { isDirectExecution } from './entry-util.js';
import { versionForDisplay } from './util.js';

const commandLoaders = {
  build: async () => (await import('./commands/build.runner.js')).runBuildCli,
  create: async () =>
    (await import('./commands/create.runner.js')).runCreateCli,
  init: async () => (await import('./commands/init.runner.js')).runInitCli,
  preview: async () =>
    (await import('./commands/preview.runner.js')).runPreviewCli,
} as const;

type CommandName = keyof typeof commandLoaders;

async function runCommand(command: CommandName, argv: string[]) {
  const runner = await commandLoaders[command]();
  await runner(argv);
}

function setupProgram(argv: string[]) {
  const program = new Command()
    .name('vivliostyle')
    .version(versionForDisplay, '-v, --version')
    .helpCommand(false)
    .exitOverride();

  const addProxyCommand = (command: CommandName, description: string) => {
    program
      .command(command)
      .description(description)
      .helpOption(false)
      .allowUnknownOption()
      .allowExcessArguments()
      .action(async () => {
        const commandIndex = argv.indexOf(command);
        // Preserve `--` so the existing parser does not reinterpret following
        // option-like operands during its second parse.
        const commandArgs = argv.slice(commandIndex + 1);
        await runCommand(command, ['vivliostyle', command, ...commandArgs]);
      });
  };

  addProxyCommand('create', 'Scaffold a new Vivliostyle project');
  addProxyCommand('init', 'Create a Vivliostyle configuration file');
  addProxyCommand('build', 'Create PDF, EPUB, and other publication files');
  addProxyCommand(
    'preview',
    'Open the preview page and interactively save PDFs',
  );

  program
    .command('help [command]')
    .description('display help for command')
    .helpOption(false)
    .allowUnknownOption()
    .allowExcessArguments()
    .action(async (command?: string) => {
      if (!command) {
        program.help();
        return;
      }
      if (isCommandName(command)) {
        await runCommand(command, ['vivliostyle', command, '--help']);
        return;
      }
      program.help({ error: true });
    });

  return program;
}

function isCommandName(command: string): command is CommandName {
  return Object.hasOwn(commandLoaders, command);
}

export async function dispatchCli(argv: string[]): Promise<void> {
  const commandArgs = argv.slice(2);
  const rootProgram = setupProgram(commandArgs);

  try {
    await rootProgram.parseAsync(commandArgs, { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode;
      return;
    }
    throw error;
  }
}

if (isDirectExecution(import.meta.url)) {
  await dispatchCli(process.argv);
}
