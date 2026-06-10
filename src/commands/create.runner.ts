import { create } from '../core/create.js';
import { gracefulError, setupExitHandlers } from '../util.js';
import { parseCreateCommand } from './create.parser.js';

export async function runCreateCli(argv: string[]) {
  setupExitHandlers();

  try {
    const inlineConfig = parseCreateCommand(argv);
    await create(inlineConfig);
  } catch (err) {
    if (err instanceof Error) {
      await gracefulError(err);
    }
  }
}
