import { create } from '../core/create.js';
import { runCliCommand } from '../entry-util.js';
import { parseCreateCommand } from './create.parser.js';

export async function runCreateCli(argv: string[]) {
  await runCliCommand(async (cliSignal) => {
    const inlineConfig = parseCreateCommand(argv);
    await create({ ...inlineConfig, signal: cliSignal });
  });
}
