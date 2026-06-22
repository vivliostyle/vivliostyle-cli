import process from 'node:process';

import { build } from '../core/build.js';
import { runCliCommand } from '../entry-util.js';
import { Logger } from '../logger.js';
import { isInContainer } from '../util.js';
import { parseBuildCommand } from './build.parser.js';

export async function runBuildCli(argv: string[]): Promise<void> {
  await runCliCommand(async (cliSignal) => {
    let inlineConfig = parseBuildCommand(argv);
    let containerForkMode = false;
    if (isInContainer() && process.env.VS_CLI_BUILD_PDF_OPTIONS) {
      inlineConfig = JSON.parse(process.env.VS_CLI_BUILD_PDF_OPTIONS);
      containerForkMode = true;
      Logger.debug('bypassedPdfBuilderOption %O', inlineConfig);
    }
    await build({ ...inlineConfig, signal: cliSignal }, { containerForkMode });
  });
}
