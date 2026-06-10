import { preview } from '../core/preview.js';
import { gracefulError, setupExitHandlers } from '../util.js';
import { parsePreviewCommand } from './preview.parser.js';

export async function runPreviewCli(argv: string[]) {
  setupExitHandlers();

  try {
    const inlineConfig = parsePreviewCommand(argv);
    await preview(inlineConfig);
  } catch (err) {
    if (err instanceof Error) {
      await gracefulError(err);
    }
  }
}
