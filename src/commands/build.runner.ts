import process from 'node:process';

import { runCliCommand } from '../entry-util.js';
import { Logger } from '../logger.js';
import { isInContainer } from '../util.js';
import { parseBuildOptions } from './build.parser.js';

export async function runBuildCli(argv: string[]): Promise<void> {
  await runCliCommand(async (cliSignal) => {
    const { options, browserWorker } = parseBuildOptions(argv);
    const containerOptions = isInContainer()
      ? process.env.VS_CLI_BUILD_PDF_OPTIONS
      : undefined;
    if (browserWorker !== undefined) {
      if (containerOptions || options.renderMode === 'docker') {
        throw new Error(
          '--browser-worker cannot be used with Docker PDF rendering.',
        );
      }
      // The build subprocess validates the options against the config schema.
      Logger.setLogOptions({ logLevel: options.logLevel, signal: cliSignal });
      const { superviseBuild } = await import('../supervise-build.js');
      await superviseBuild(argv.slice(2), browserWorker, cliSignal);
      return;
    }

    const { parseInlineFlags } = await import('./cli-flags.js');
    let inlineConfig = parseInlineFlags(options);
    if (containerOptions) {
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- options forwarded from the parent build process as JSON
      inlineConfig = JSON.parse(containerOptions);
      Logger.debug('bypassedPdfBuilderOption %O', inlineConfig);
    }
    const { build } = await import('../core/build.js');
    await build(
      { ...inlineConfig, signal: cliSignal },
      { containerForkMode: Boolean(containerOptions) },
    );
  });
}
