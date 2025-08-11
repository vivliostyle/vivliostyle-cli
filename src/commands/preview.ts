import { preview } from '../core/preview.js';
import { gracefulError } from '../util.js';
import { parsePreviewCommand } from './preview.parser.js';

try {
  const inlineConfig = parsePreviewCommand(process.argv);
  await preview(inlineConfig);
} catch (err) {
  if (err instanceof Error) {
    gracefulError(err);
  }
}
