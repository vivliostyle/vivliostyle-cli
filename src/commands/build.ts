import process from 'node:process';
import { build } from '../core/build.js';
import { Logger } from '../logger.js';
import { gracefulError, isInContainer } from '../util.js';
import { setupBuildParserProgram } from './build.parser.js';
import { parseFlagsToInlineConfig } from './cli-flags.js';

try {
  let inlineConfig = parseFlagsToInlineConfig(
    process.argv,
    setupBuildParserProgram,
  );
  let containerForkMode = false;
  if (isInContainer() && process.env.VS_CLI_BUILD_PDF_OPTIONS) {
    inlineConfig = JSON.parse(process.env.VS_CLI_BUILD_PDF_OPTIONS);
    containerForkMode = true;
    Logger.debug('bypassedPdfBuilderOption %O', inlineConfig);
  }
  await build(inlineConfig, { containerForkMode });
} catch (err) {
  if (err instanceof Error) {
    gracefulError(err);
  }
}
