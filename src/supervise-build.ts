import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  buildShutdownGraceMs,
  signalProcess,
  stopBuildDescendants,
} from './browser-worker/process-group.js';
import { connectBrowserWorker } from './browser-worker/socket.js';
import { Logger } from './logger.js';
import { registerTerminationHook } from './util.js';

const buildEntry = fileURLToPath(
  new URL('./browser-worker/internal-build.js', import.meta.url),
);

export async function superviseBuild(
  args: string[],
  socketPath: string,
  abortSignal: AbortSignal,
): Promise<void> {
  const socket = await connectBrowserWorker(socketPath, abortSignal);
  try {
    abortSignal.throwIfAborted();
    const child = spawn(process.execPath, [buildEntry, ...args], {
      detached: true,
      stdio: ['inherit', 'inherit', 'inherit', socket, 'ipc'],
    });
    const group = child.pid;
    const exited = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    let deadline: number | undefined;
    let forceKill: ReturnType<typeof setTimeout> | undefined;
    const finished = (async () => {
      const result = await exited;
      if (group !== undefined) {
        await stopBuildDescendants(
          group,
          deadline ?? performance.now() + buildShutdownGraceMs,
          deadline === undefined ? 'exit' : 'cancel',
        );
      }
      process.exitCode =
        result.code ??
        (result.signal ? 128 + constants.signals[result.signal] : 1);
    })();
    const unregister = registerTerminationHook((_, signal) => {
      if (group !== undefined) {
        deadline = performance.now() + buildShutdownGraceMs;
        signalProcess(-group, signal);
        forceKill = setTimeout(() => {
          Logger.debug(
            'Browser worker build exceeded its shutdown grace period',
          );
          signalProcess(-group, 'SIGKILL');
        }, buildShutdownGraceMs);
      }
      return finished;
    });
    try {
      await finished;
    } finally {
      clearTimeout(forceKill);
      unregister();
    }
  } finally {
    // Close our descriptor. end() would shut down the shared connection.
    socket.destroy();
  }
}
