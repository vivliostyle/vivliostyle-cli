import fs from 'node:fs';
import type { Writable } from 'node:stream';

import { WorkerConnection } from '../browser-worker/protocol.js';
import { connectOwnerSocket } from '../browser-worker/socket.js';
import { Logger } from '../logger.js';
import { registerTerminationHook } from '../util.js';
import {
  buildProtocolVersion,
  type BuildReply,
  type BuildRequest,
} from './protocol.js';

function writeLog(
  stream: Writable,
  data: string,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => resolve();
    signal.addEventListener('abort', onAbort, { once: true });
    stream.write(Buffer.from(data, 'base64'), (error) => {
      signal.removeEventListener('abort', onAbort);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export async function submitBuild(
  args: string[],
  socketPath: string,
  signal: AbortSignal,
): Promise<void> {
  const socket = await connectOwnerSocket(socketPath, signal, 'Build daemon');
  const connection = new WorkerConnection<BuildRequest>(socket, 'Build daemon');
  const completed = Promise.withResolvers<null>();
  const cancel = () => connection.send({ type: 'cancel' });
  const unregister = registerTerminationHook(async () => {
    await completed.promise;
  });
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    connection.send({
      type: 'build',
      version: buildProtocolVersion,
      cwd: fs.realpathSync(process.cwd()),
      args,
    });
    for (;;) {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- messages come from the daemon in the owner-only directory
      const reply = (await connection.readMessage()) as BuildReply;
      switch (reply.type) {
        case 'queued':
          Logger.debug('Waiting for build daemon executor');
          break;
        case 'started':
          Logger.debug('Build daemon executor pid=%d', reply.pid);
          break;
        case 'log':
          await writeLog(process[reply.stream], reply.data, signal);
          break;
        case 'result':
          signal.throwIfAborted();
          if (reply.error !== undefined) {
            const error = new Error(reply.error);
            error.stack = reply.error;
            throw error;
          }
          return;
        default:
          throw new Error('Unexpected build daemon reply.');
      }
    }
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    unregister();
    socket.destroy();
    completed.resolve(null);
  }
}
