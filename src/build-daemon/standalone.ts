import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { resolveWorkerSocket } from '../browser-worker/protocol.js';
import { runBrowserWorker } from '../browser-worker/server.js';
import { executeWithCleanupOnInterrupt } from '../util.js';
import { runBuildDaemon } from './server.js';

export function runStandaloneBuildDaemon(
  socketPath: string,
  cliPath: string,
  signal: AbortSignal,
): Promise<void> {
  return executeWithCleanupOnInterrupt(
    'Stopping standalone build daemon',
    async () => {
      signal.throwIfAborted();
      const address = resolveWorkerSocket(socketPath, 'build daemon');
      const cwd = fs.mkdtempSync(path.join(tmpdir(), 'vs-daemon-'));
      const workerAddress = path.join(cwd, 'worker.sock');
      const ready = Promise.withResolvers<null>();
      const workerShutdown = new AbortController();
      const workerFailure = new AbortController();
      const worker = runBrowserWorker(
        workerAddress,
        workerShutdown.signal,
        () => ready.resolve(null),
      );
      void worker.catch((error: unknown) => {
        workerFailure.abort(error);
      });
      const stopWorker = () => {
        workerShutdown.abort();
        return worker;
      };
      try {
        await Promise.race([ready.promise, worker]);
        await runBuildDaemon(
          address,
          workerAddress,
          AbortSignal.any([signal, workerFailure.signal]),
          { cliPath: fs.realpathSync(cliPath), cwd, stopWorker },
        );
      } finally {
        try {
          await stopWorker();
        } finally {
          fs.rmSync(cwd, { recursive: true, force: true });
        }
      }
    },
  );
}
