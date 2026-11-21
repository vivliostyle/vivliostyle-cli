import { once } from 'node:events';
import fs from 'node:fs';
import { createServer, type Socket } from 'node:net';
import path from 'node:path';

import * as v from 'valibot';

import {
  buildShutdownGraceMs,
  checkBuildDaemonProcessInspection,
} from '../browser-worker/process-group.js';
import {
  resolveWorkerSocket,
  WorkerConnection,
} from '../browser-worker/protocol.js';
import { Logger } from '../logger.js';
import { BuildExecutor } from '../supervise-build-daemon.js';
import { registerTerminationHook, toError } from '../util.js';
import {
  buildProtocolVersion,
  CancelRequestSchema,
  InitialRequestSchema,
  type BuildReply,
} from './protocol.js';

interface Client {
  socket: Socket;
  connection: WorkerConnection<BuildReply>;
}

interface Job {
  args: string[];
  client: Client;
  controller: AbortController;
}

interface StandaloneSession {
  cliPath: string;
  cwd: string;
  stopWorker: () => Promise<void>;
}

const shutdownMessage = 'Build daemon is shutting down.';

export async function runBuildDaemon(
  socketPath: string,
  browserWorker: string,
  signal: AbortSignal,
  standalone?: StandaloneSession,
): Promise<void> {
  signal.throwIfAborted();
  const address = resolveWorkerSocket(socketPath, 'build daemon');
  const workerAddress = resolveWorkerSocket(browserWorker);
  if (address === workerAddress) {
    throw new Error(
      'The build daemon and browser worker require different sockets.',
    );
  }
  if (fs.lstatSync(address, { throwIfNoEntry: false })) {
    throw new Error(
      `Build daemon socket path already exists: ${address}. Remove a stale socket only after the previous daemon has stopped.`,
    );
  }

  const directory = fs.realpathSync(standalone?.cwd ?? process.cwd());
  await checkBuildDaemonProcessInspection();
  signal.throwIfAborted();
  const clients = new Set<Client>();
  const queue: Job[] = [];
  let executor: BuildExecutor | undefined;
  let active: Job | undefined;
  let processing: Promise<void> | undefined;
  let stopping = false;
  let retirementFailure: Error | undefined;

  function finish({ socket, connection }: Client, error?: string) {
    if (!socket.destroyed && !socket.writableEnded) {
      connection.send({ type: 'result', error: error?.slice(0, 64 * 1024) });
      endSocket(socket);
    }
  }

  function endSocket(socket: Socket) {
    socket.end(() => {
      socket.destroy();
    });
  }

  function cancel(client: Client, message: string) {
    if (active?.client === client) {
      active.controller.abort(message);
      return;
    }
    const index = queue.findIndex((job) => job.client === client);
    if (index !== -1) {
      queue.splice(index, 1);
    }
    finish(client, message);
  }

  function createExecutor() {
    return new BuildExecutor(directory, workerAddress, (error) => {
      retirementFailure = error;
      if (signal.aborted) {
        Logger.stderr.write(`${error.message}\n`);
      }
      void shutdown().catch(stopped.reject);
    });
  }

  async function retireExecutor() {
    if (executor?.retiring) {
      await executor.stop();
      executor = undefined;
    }
  }

  async function runQueue() {
    for (;;) {
      if (stopping) {
        return;
      }
      const job = queue.shift();
      if (!job) {
        return;
      }
      active = job;
      const { client, controller } = job;
      const { socket, connection } = client;
      try {
        await retireExecutor();
        controller.signal.throwIfAborted();
        executor ??= createExecutor();
        const result = await executor.run(
          job.args,
          controller.signal,
          (message) => {
            if (!socket.destroyed && !socket.writableEnded) {
              // A client that stops reading must not fill the daemon's memory.
              if (socket.writableLength > 4 * 1024 * 1024) {
                socket.destroy();
              } else {
                connection.send(message);
              }
            }
          },
        );
        const error = controller.signal.aborted
          ? String(controller.signal.reason)
          : result.error;
        finish(client, error);
      } catch (error) {
        finish(
          client,
          retirementFailure?.message ??
            (stopping ? shutdownMessage : toError(error).message),
        );
      } finally {
        active = undefined;
      }
      try {
        await retireExecutor();
      } catch {
        // The executor's retirement failure has already started daemon shutdown.
        return;
      }
    }
  }

  async function serve(client: Client) {
    const { socket, connection } = client;
    try {
      const request = v.parse(
        InitialRequestSchema,
        await connection.readMessage(),
      );
      if (stopping || socket.destroyed) {
        return;
      }
      if (request.version !== buildProtocolVersion) {
        throw new Error(
          `Incompatible build daemon protocol. Expected version ${buildProtocolVersion}.`,
        );
      }
      if (request.type === 'describe') {
        if (!standalone) {
          throw new Error(
            'Session discovery requires a standalone build daemon.',
          );
        }
        connection.send({
          type: 'session',
          version: buildProtocolVersion,
          cliPath: standalone.cliPath,
          cwd: directory,
        });
        endSocket(socket);
        return;
      }
      if (
        !path.isAbsolute(request.cwd) ||
        fs.realpathSync(request.cwd) !== directory
      ) {
        throw new Error(
          `Build daemon clients must run from its project directory: ${directory}`,
        );
      }
      queue.push({
        client,
        args: request.args,
        controller: new AbortController(),
      });
      if (processing) {
        connection.send({ type: 'queued' });
      } else {
        processing = runQueue().finally(() => {
          processing = undefined;
        });
      }
      v.parse(CancelRequestSchema, await connection.readMessage());
      cancel(client, 'Build request cancelled.');
    } catch (error) {
      if (!stopping) {
        cancel(client, toError(error).message);
      }
    }
  }

  const server = createServer((socket) => {
    if (stopping) {
      socket.destroy();
      return;
    }
    const client = {
      socket,
      connection: new WorkerConnection<BuildReply>(socket, 'Build daemon'),
    };
    clients.add(client);
    socket.on('error', () => {});
    socket.once('close', () => {
      clients.delete(client);
      cancel(client, 'Build daemon client disconnected.');
    });
    void serve(client);
  });

  const stopped = Promise.withResolvers<null>();
  void stopped.promise.catch(() => {});
  server.on('error', stopped.reject);
  let listening: Promise<unknown> | undefined;
  let shuttingDown: Promise<void> | undefined;
  const shutdown = () =>
    (shuttingDown ??= (async () => {
      stopping = true;
      await listening?.catch(() => {});
      const closeServer = () =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
      const closed = standalone ? undefined : closeServer();
      for (const client of clients) {
        if (client !== active?.client) {
          finish(client, retirementFailure?.message ?? shutdownMessage);
        }
      }
      queue.length = 0;
      active?.controller.abort(shutdownMessage);
      const timer = setTimeout(() => {
        for (const { socket } of clients) {
          socket.destroy();
        }
      }, buildShutdownGraceMs + 1000);
      try {
        await processing;
        await executor?.stop().catch(() => {});
      } finally {
        try {
          await standalone?.stopWorker();
        } finally {
          await (closed ?? closeServer());
          clearTimeout(timer);
          if (retirementFailure) {
            stopped.reject(retirementFailure);
          } else {
            stopped.resolve(null);
          }
        }
      }
    })());

  const onAbort = () => {
    void shutdown().catch(stopped.reject);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  const unregister = registerTerminationHook(shutdown);
  try {
    executor = createExecutor();
    await executor.ready();
    signal.throwIfAborted();
    listening = once(server, 'listening');
    server.listen(address);
    await listening;
    signal.throwIfAborted();
    fs.chmodSync(address, 0o600);
    Logger.stdout.write(`Build daemon ready at ${address}\n`);
    await stopped.promise;
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    try {
      await shutdown();
    } finally {
      signal.removeEventListener('abort', onAbort);
      unregister();
    }
  }
}
