import { createTheme } from '../core/theme-create.js';
import { runCliCommand } from '../entry-util.js';
import { parseThemeCreateCommand } from './theme-create.parser.js';

export async function runThemeCreateCli(argv: string[]): Promise<void> {
  await runCliCommand(async (cliSignal) => {
    const config = parseThemeCreateCommand(argv);
    await createTheme({ ...config, signal: cliSignal });
  });
}
