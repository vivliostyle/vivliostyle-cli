import { Command } from 'commander';

import { runBrowserWorker } from '../browser-worker/server.js';
import { runCliCommand } from '../entry-util.js';
import { versionForDisplay } from '../util.js';

export async function runBuildWorkerCli(argv: string[]): Promise<void> {
  await runCliCommand(async (signal) => {
    const command = new Command()
      .name('vivliostyle build-worker')
      .description('Keep Chromium available for PDF builds on Linux and macOS')
      .requiredOption(
        '--socket <absolute-path>',
        'listen on a Unix socket in an owner-only directory',
      )
      .version(versionForDisplay, '-v, --version')
      .parse(argv);
    await runBrowserWorker(command.opts<{ socket: string }>().socket, signal);
  });
}
