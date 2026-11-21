import { Command, Option } from 'commander';

import { runBuildDaemon } from '../build-daemon/server.js';
import { runCliCommand } from '../entry-util.js';
import { versionForDisplay } from '../util.js';

export async function runBuildDaemonCli(
  argv: string[],
  cliPath: string,
): Promise<void> {
  await runCliCommand(async (signal) => {
    const command = new Command()
      .name('vivliostyle build-daemon')
      .description(
        'Keep a publication build process running on Linux and macOS',
      )
      .requiredOption(
        '--socket <absolute-path>',
        'listen on a Unix socket in an owner-only directory',
      )
      .addOption(
        new Option(
          '--standalone',
          'manage a Chromium worker and isolated working directory',
        ).conflicts('browserWorker'),
      )
      .option(
        '--browser-worker <absolute-path>',
        'use this Chromium worker for project builds',
      )
      .version(versionForDisplay, '-v, --version')
      .parse(argv);
    const { socket, browserWorker, standalone } = command.opts<{
      socket: string;
      browserWorker?: string;
      standalone?: boolean;
    }>();
    if (standalone) {
      const { runStandaloneBuildDaemon } =
        await import('../build-daemon/standalone.js');
      await runStandaloneBuildDaemon(socket, cliPath, signal);
      return;
    }
    if (browserWorker === undefined) {
      return command.error(
        'error: specify either --standalone or --browser-worker',
      );
    }
    await runBuildDaemon(socket, browserWorker, signal);
  });
}
