import { Socket } from 'node:net';
import { setTimeout } from 'node:timers/promises';

import { parseBuildOptions } from '../commands/build.parser.js';
import { parseInlineFlags } from '../commands/cli-flags.js';
import { build } from '../core/build.js';
import { runCliCommand } from '../entry-util.js';
import { Logger } from '../logger.js';
import { registerTerminationHook, runCleanupHandlers } from '../util.js';
import { withBrowserWorker } from './client.js';
import {
  buildShutdownGraceMs,
  signalProcess,
  stopBuildDescendants,
} from './process-group.js';
import { inheritedSocketFd } from './socket.js';

if (!process.channel) {
  throw new Error('The internal browser worker build requires a supervisor.');
}

const socket = new Socket({
  fd: inheritedSocketFd,
  readable: true,
  writable: true,
});
// A worker can exit while the CLI is preparing files, with no pending read.
socket.on('error', () => {});
const completed = Promise.withResolvers<null>();
let orphanCleanup: Promise<void> | undefined;
const onDisconnect = () => {
  orphanCleanup ??= (async () => {
    const deadline = performance.now() + buildShutdownGraceMs;
    signalProcess(-process.pid, 'SIGTERM');
    await Promise.race([
      completed.promise,
      setTimeout(buildShutdownGraceMs, null, { ref: false }),
    ]);
    await stopBuildDescendants(process.pid, deadline, 'orphan');
    process.exit(143);
  })();
};

const unregister = registerTerminationHook(async () => {
  // Keep the build alive through cleanup, or until the supervisor's deadline.
  await completed.promise;
  await orphanCleanup;
});
const command = runCliCommand(async (signal) => {
  const { options, browserWorker } = parseBuildOptions(process.argv);
  if (browserWorker === undefined) {
    throw new Error('The internal build requires --browser-worker.');
  }
  const inlineConfig = parseInlineFlags(options);
  Logger.setLogOptions(inlineConfig);
  await withBrowserWorker(socket, browserWorker, signal, (renderWithWorker) =>
    build({ ...inlineConfig, signal }, { renderWithWorker }),
  );
});
process.once('disconnect', onDisconnect);
if (!process.connected) {
  onDisconnect();
}
try {
  await command;
} finally {
  await runCleanupHandlers();
  completed.resolve(null);
  await orphanCleanup;
  unregister();
  process.removeListener('disconnect', onDisconnect);
  socket.destroy();
  if (process.connected) {
    process.disconnect?.();
  }
}
