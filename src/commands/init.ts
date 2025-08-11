import { init } from '../core/init.js';
import { gracefulError } from '../util.js';
import { parseInitCommand } from './init.parser.js';

try {
  const inlineConfig = parseInitCommand(process.argv);
  await init(inlineConfig);
} catch (err) {
  if (err instanceof Error) {
    gracefulError(err);
  }
}
