import { once } from 'node:events';
import fs from 'node:fs';
import { Socket } from 'node:net';
import path from 'node:path';

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

function validateSocketAncestors(directory: string): void {
  const uid = process.getuid?.();
  const { root } = path.parse(directory);
  let ancestor = root;
  for (const segment of path.relative(root, directory).split(path.sep)) {
    const info = fs.lstatSync(ancestor);
    const replaceableEntries =
      (info.mode & 0o022) !== 0 && (info.mode & 0o1000) === 0;
    if (
      !info.isDirectory() ||
      (info.uid !== uid && info.uid !== 0) ||
      replaceableEntries
    ) {
      throw new Error(`Unsafe ancestor of the socket directory: ${ancestor}`);
    }
    ancestor = path.join(ancestor, segment);
  }
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
  const socket = new Socket();
  // The build process owns all reads and writes on the inherited socket.
  socket.pause();
  socket.on('error', () => {});
  let directoryFd: number | undefined;
  try {
    let connectPath = address;
    if (process.platform === 'linux') {
      const directoryPath = path.dirname(address);
      // Pin the private directory through connect so renaming an ancestor
      // cannot redirect the connection after the socket ownership check.
      if (
        fs.existsSync('/proc/self/fd') &&
        fs.lstatSync(directoryPath).mode & 0o400
      ) {
        directoryFd = fs.openSync(
          directoryPath,
          fs.constants.O_RDONLY |
            fs.constants.O_DIRECTORY |
            fs.constants.O_NOFOLLOW,
        );
        const pinnedPath = `/proc/self/fd/${directoryFd}/${path.basename(address)}`;
        if (Buffer.byteLength(pinnedPath) <= 107) {
          connectPath = pinnedPath;
        }
      }
      if (connectPath === address) {
        validateSocketAncestors(directoryPath);
      }
      const directory =
        connectPath === address || directoryFd === undefined
          ? fs.lstatSync(directoryPath)
          : fs.fstatSync(directoryFd);
      if (
        !directory.isDirectory() ||
        directory.uid !== process.getuid?.() ||
        directory.mode & 0o077
      ) {
        throw new Error('Expected a directory accessible only to its owner.');
      }
    }
    const info = fs.lstatSync(connectPath);
    if (!info.isSocket() || info.uid !== process.getuid?.()) {
      throw new Error('Expected a Unix socket owned by the current user.');
    }
    socket.connect(connectPath);
    await once(socket, 'connect', { signal });
    signal.throwIfAborted();
    return socket;
  } catch (error) {
    socket.destroy();
    signal.throwIfAborted();
    throw unavailable(error);
  } finally {
    if (directoryFd !== undefined) {
      fs.closeSync(directoryFd);
    }
  }
}
