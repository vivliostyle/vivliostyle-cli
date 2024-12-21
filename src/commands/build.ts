import process from 'node:process';
import { build } from '../core/build.js';
import { gracefulError } from '../util.js';
import { setupBuildParserProgram } from './build.parser.js';
import { parseFlagsToInlineConfig } from './cli-flags.js';

try {
  const inlineConfig = parseFlagsToInlineConfig(
    process.argv,
    setupBuildParserProgram,
  );
  await build(inlineConfig);
} catch (err) {
  if (err instanceof Error) {
    gracefulError(err);
  }
}
