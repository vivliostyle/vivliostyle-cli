import process from 'node:process';

import { runCliCommand } from '../entry-util.js';
import { Logger } from '../logger.js';
import { isInContainer } from '../util.js';
import { parseBuildCli } from './build.parser.js';

export async function runBuildCli(argv: string[]): Promise<void> {
  await runCliCommand(async (cliSignal) => {
    const { inlineConfig: parsedConfig, browserWorker } = parseBuildCli(argv);
    let inlineConfig = parsedConfig;
    let containerForkMode = false;
    if (isInContainer() && process.env.VS_CLI_BUILD_PDF_OPTIONS) {
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- options forwarded from the parent build process as JSON
      inlineConfig = JSON.parse(process.env.VS_CLI_BUILD_PDF_OPTIONS);
      containerForkMode = true;
      Logger.debug('bypassedPdfBuilderOption %O', inlineConfig);
    }
    inlineConfig = { ...inlineConfig, signal: cliSignal };
    if (browserWorker === undefined) {
      const { build } = await import('../core/build.js');
      await build(inlineConfig, { containerForkMode });
    } else {
      if (containerForkMode || inlineConfig.renderMode === 'docker') {
        throw new Error(
          '--browser-worker cannot be used with Docker PDF rendering.',
        );
      }
      Logger.setLogOptions(inlineConfig);
      const { superviseBuild } = await import('../supervise-build.js');
      await superviseBuild(argv.slice(2), browserWorker, cliSignal);
    }
  });
}
