import { once } from 'node:events';
import fs from 'node:fs';
import { Socket } from 'node:net';

import { toError } from '../util.js';
import { resolveWorkerSocket } from './protocol.js';

export const inheritedSocketFd = 3;

export function workerUnavailable(socketPath: string, cause?: unknown): Error {
  return new Error(
    `Browser worker unavailable at ${socketPath}${cause ? `: ${toError(cause).message}` : ''}`,
    { cause },
  );
}

export async function connectBrowserWorker(
  socketPath: string,
  signal: AbortSignal,
): Promise<Socket> {
  signal.throwIfAborted();
  let address: string;
  try {
    address = resolveWorkerSocket(socketPath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw workerUnavailable(socketPath, error);
    }
    throw error;
  }
  const info = fs.lstatSync(address, { throwIfNoEntry: false });
  if (!info) {
    throw workerUnavailable(socketPath);
  }
  if (!info.isSocket() || info.uid !== process.getuid?.()) {
    throw workerUnavailable(
      socketPath,
      new Error('Expected a Unix socket owned by the current user.'),
    );
  }

  const socket = new Socket();
  // The build process owns all reads and writes on the inherited socket.
  socket.pause();
  socket.on('error', () => {});
  try {
    socket.connect(address);
    await once(socket, 'connect', { signal });
    signal.throwIfAborted();
    return socket;
  } catch (error) {
    socket.destroy();
    signal.throwIfAborted();
    throw workerUnavailable(socketPath, error);
  }
}
