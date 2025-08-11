import { create } from '../core/create.js';
import { gracefulError } from '../util.js';
import { parseCreateCommand } from './create.parser.js';

try {
  const inlineConfig = parseCreateCommand(process.argv);
  await create(inlineConfig);
} catch (err) {
  if (err instanceof Error) {
    gracefulError(err);
  }
}
