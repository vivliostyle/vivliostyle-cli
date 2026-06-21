import { writeFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { runCliCommand } from '../../src/entry-util.js';
import { Logger } from '../../src/logger.js';
import { registerCleanupHandler } from '../../src/util.js';

const markerPath = process.argv[2];
if (!markerPath) {
  throw new Error('Cleanup marker path is required');
}

delete process.env.CI;
process.env.TERM = 'xterm';

const ttyStream = new Writable({
  write(_chunk, _encoding, callback) {
    callback();
  },
}) as Writable & { isTTY: boolean };
ttyStream.isTTY = true;
Logger.setLogOptions({ stderr: ttyStream });

await runCliCommand(async (signal) => {
  Logger.startLogging('Waiting for termination signal');
  registerCleanupHandler('Writing cleanup marker', async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await writeFile(
      markerPath,
      JSON.stringify({
        aborted: signal.aborted,
        exitCode:
          // Check if the signal reason is a CliInterruptError
          signal.reason instanceof Error && signal.reason.name === 'CliInterruptError'
            ? (signal.reason as Error & { exitCode: number }).exitCode
            : null,
      }),
    );
  });

  process.stdout.write('READY\n');
  await new Promise<void>((_resolve, reject) => {
    const keepAlive = setInterval(() => {}, 1_000);
    signal.addEventListener(
      'abort',
      () => {
        clearInterval(keepAlive);
        reject(signal.reason);
      },
      { once: true },
    );
  });
});
