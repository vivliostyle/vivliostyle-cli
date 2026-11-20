import { once } from 'node:events';
import fs from 'node:fs';
import { Socket } from 'node:net';

import { toError } from '../util.js';
import { resolveWorkerSocket } from './protocol.js';

export const inheritedSocketFd = 3;

export function workerUnavailable(socketPath: string, cause?: unknown): Error {
  return serviceUnavailable('Browser worker', socketPath, cause);
}

function serviceUnavailable(
  service: string,
  socketPath: string,
  cause?: unknown,
): Error {
  return new Error(
    `${service} unavailable at ${socketPath}${cause ? `: ${toError(cause).message}` : ''}`,
    { cause },
  );
}

export function connectBrowserWorker(
  socketPath: string,
  signal: AbortSignal,
): Promise<Socket> {
  return connectOwnerSocket(socketPath, signal, 'Browser worker');
}

export async function connectOwnerSocket(
  socketPath: string,
  signal: AbortSignal,
  service: string,
): Promise<Socket> {
  signal.throwIfAborted();
  const unavailable = (cause?: unknown) =>
    serviceUnavailable(service, socketPath, cause);
  let address: string;
  try {
    address = resolveWorkerSocket(socketPath, service.toLowerCase());
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw unavailable(error);
    }
    throw error;
  }
  const info = fs.lstatSync(address, { throwIfNoEntry: false });
  if (!info) {
    throw unavailable();
  }
  if (!info.isSocket() || info.uid !== process.getuid?.()) {
    throw unavailable(
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
    throw unavailable(error);
  }
}
