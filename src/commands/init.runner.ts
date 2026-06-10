import { create } from '../core/create.js';
import { gracefulError, setupExitHandlers } from '../util.js';
import { parseInitCommand } from './init.parser.js';

export async function runInitCli(argv: string[]) {
  setupExitHandlers();

  try {
    const inlineConfig = parseInitCommand(argv);
    await create(inlineConfig);
  } catch (err) {
    if (err instanceof Error) {
      await gracefulError(err);
    }
  }
}
