import { Command } from 'commander';

import { runBuildDaemon } from '../build-daemon/server.js';
import { runCliCommand } from '../entry-util.js';
import { versionForDisplay } from '../util.js';

export async function runBuildDaemonCli(argv: string[]): Promise<void> {
  await runCliCommand(async (signal) => {
    const command = new Command()
      .name('vivliostyle build-daemon')
      .description('Serve builds for the current project on Linux and macOS')
      .requiredOption(
        '--socket <absolute-path>',
        'listen on a Unix socket in an owner-only directory',
      )
      .requiredOption(
        '--browser-worker <absolute-path>',
        'use this Chromium worker for PDF rendering',
      )
      .version(versionForDisplay, '-v, --version')
      .parse(argv);
    const { socket, browserWorker } = command.opts<{
      socket: string;
      browserWorker: string;
    }>();
    await runBuildDaemon(socket, browserWorker, signal);
  });
}
