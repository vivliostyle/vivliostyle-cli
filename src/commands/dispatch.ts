import process from 'node:process';

import { Command, CommanderError } from 'commander';

import { versionForDisplay } from '../util.js';

type CommandRunner = (argv: string[]) => Promise<void>;

export interface DispatchedCommand {
  description: string;
  load: () => Promise<CommandRunner>;
}

export function createCommandDispatcher<Name extends string>({
  commandPath = [],
  description,
  commands,
}: {
  commandPath?: string[];
  description?: string;
  commands: Record<Name, DispatchedCommand>;
}): CommandRunner {
  const isCommandName = (command: string): command is Name =>
    Object.hasOwn(commands, command);

  const runCommand = async (command: Name, args: string[]) => {
    const runner = await commands[command].load();
    await runner(['vivliostyle', [...commandPath, command].join(' '), ...args]);
  };

  const setupProgram = (argv: string[]) => {
    const program = new Command()
      .name(['vivliostyle', ...commandPath].join(' '))
      .version(versionForDisplay, '-v, --version')
      .helpCommand(false)
      .exitOverride();
    if (description) {
      program.description(description);
    }

    for (const command of Object.keys(commands)) {
      if (isCommandName(command)) {
        program
          .command(command)
          .description(commands[command].description)
          .helpOption(false)
          .allowUnknownOption()
          .allowExcessArguments()
          .action(async () => {
            const commandIndex = argv.indexOf(command);
            await runCommand(command, argv.slice(commandIndex + 1));
          });
      }
    }

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
          await runCommand(command, ['--help']);
          return;
        }
        program.help({ error: true });
      });

    return program;
  };

  return async (argv) => {
    const commandArgs = argv.slice(2);
    const program = setupProgram(commandArgs);
    try {
      await program.parseAsync(commandArgs, { from: 'user' });
    } catch (error) {
      if (error instanceof CommanderError) {
        process.exitCode = error.exitCode;
        return;
      }
      throw error;
    }
  };
}
