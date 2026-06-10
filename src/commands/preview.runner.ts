import { preview } from '../core/preview.js';
import { runCliCommand } from '../entry-util.js';
import { parsePreviewCommand } from './preview.parser.js';

export async function runPreviewCli(argv: string[]) {
  await runCliCommand(async (cliSignal) => {
    const inlineConfig = parsePreviewCommand(argv);
    await preview({ ...inlineConfig, signal: cliSignal });
  });
}
