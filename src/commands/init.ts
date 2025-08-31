import { create } from '../core/create.js';
import { gracefulError } from '../util.js';
import { parseInitCommand } from './init.parser.js';

try {
  const inlineConfig = parseInitCommand(process.argv);
  await create(inlineConfig);
} catch (err) {
  if (err instanceof Error) {
    gracefulError(err);
  }
}
