import process from 'node:process';

import { validateTheme } from '../core/theme-validate.js';
import { runCliCommand } from '../entry-util.js';
import { parseThemeValidateCommand } from './theme-validate.parser.js';

export async function runThemeValidateCli(argv: string[]): Promise<void> {
  await runCliCommand(async (cliSignal) => {
    const config = parseThemeValidateCommand(argv);
    const results = await validateTheme({ ...config, signal: cliSignal });
    if (results.some((result) => result.type === 'error')) {
      process.exitCode = 1;
    }
  });
}
