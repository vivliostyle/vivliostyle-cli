import { create } from '../core/create.js';
import { runCliCommand } from '../entry-util.js';
import { parseInitCommand } from './init.parser.js';

export async function runInitCli(argv: string[]) {
  await runCliCommand(async (cliSignal) => {
    const inlineConfig = parseInitCommand(argv);
    await create({ ...inlineConfig, signal: cliSignal });
  });
}
