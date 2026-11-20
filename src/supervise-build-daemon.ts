import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildShutdownGraceMs,
  signalProcess,
  stopBuildDescendants,
} from './browser-worker/process-group.js';
import type {
  BuildReply,
  BuildResult,
  ExecutorReply,
  ExecutorRequest,
} from './build-daemon/protocol.js';
import { Logger } from './logger.js';

const entry = fileURLToPath(
  new URL('./build-daemon/internal-executor.js', import.meta.url),
);

export class BuildExecutor {
  readonly #child;
  readonly #ready = Promise.withResolvers<null>();
  readonly exited: Promise<Error>;
  #onReply?: (reply: ExecutorReply) => void;
  #onExit?: (error: Error) => void;
  #nextId = 0;

  constructor(cwd: string, workerSocket: string) {
    this.#child = fork(entry, [workerSocket], {
      cwd,
      detached: true,
      execArgv: [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const group = this.#child.pid;
    const exit = Promise.withResolvers<Error>();
    this.#child.on('error', (error) => exit.resolve(error));
    this.#child.once('exit', (code, signal) => {
      exit.resolve(
        new Error(`Build daemon executor exited (${signal ?? code}).`),
      );
    });
    this.exited = exit.promise.then(async (error) => {
      if (group !== undefined) {
        await stopBuildDescendants(
          group,
          performance.now() + buildShutdownGraceMs,
          'exit',
        );
      }
      this.#ready.reject(error);
      this.#onExit?.(error);
      return error;
    });
    void this.#ready.promise.catch(() => {});
    this.#child.on('message', (raw) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- private IPC channel from the supervised executor
      const reply = raw as ExecutorReply;
      if (reply.type === 'ready') {
        this.#ready.resolve(null);
      } else {
        this.#onReply?.(reply);
      }
    });
    for (const stream of ['stdout', 'stderr'] as const) {
      this.#child[stream]?.on('data', (data: Buffer) => {
        // Native output and inherited subprocess descriptors bypass Node's writes.
        if (this.#onReply) {
          this.#onReply({
            type: 'log',
            id: this.#nextId,
            stream,
            data: data.toString('base64'),
          });
        } else {
          Logger[stream].write(data);
        }
      });
    }
  }

  get connected(): boolean {
    return this.#child.connected;
  }

  ready(): Promise<null> {
    return this.#ready.promise;
  }

  #kill(): void {
    const pid = this.#child.pid;
    if (pid !== undefined) {
      signalProcess(-pid, 'SIGKILL');
    }
  }

  #send(request: ExecutorRequest): void {
    if (this.connected) {
      this.#child.send(request, (error) => {
        if (error) {
          this.#kill();
        }
      });
    }
  }

  async run(
    args: string[],
    signal: AbortSignal,
    reply: (message: BuildReply) => void,
  ): Promise<BuildResult> {
    const result = Promise.withResolvers<BuildResult>();
    const id = ++this.#nextId;
    let timedOut = false;
    let forceKill: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      this.#send({ type: 'cancel', message: String(signal.reason) });
      forceKill = setTimeout(() => {
        timedOut = true;
        this.#kill();
      }, buildShutdownGraceMs);
    };
    signal.throwIfAborted();
    signal.addEventListener('abort', abort, { once: true });
    try {
      await this.ready();
      signal.throwIfAborted();
      const pid = this.#child.pid;
      if (pid === undefined || !this.connected) {
        throw await this.exited;
      }
      this.#onReply = (message) => {
        if (message.type !== 'ready' && message.id === id) {
          if (message.type === 'result') {
            result.resolve({ type: 'result', error: message.error });
          } else {
            const { type, stream, data } = message;
            reply({ type, stream, data });
          }
        }
      };
      this.#onExit = (error) => {
        result.reject(
          timedOut
            ? new Error(
                'Build daemon executor exceeded its shutdown grace period.',
              )
            : error,
        );
      };
      reply({ type: 'started', pid });
      this.#send({ type: 'build', id, args });
      return await result.promise;
    } finally {
      clearTimeout(forceKill);
      this.#onReply = undefined;
      this.#onExit = undefined;
      signal.removeEventListener('abort', abort);
    }
  }

  async stop(): Promise<void> {
    const forceKill = setTimeout(() => this.#kill(), buildShutdownGraceMs);
    try {
      if (this.connected) {
        this.#child.disconnect();
      }
      await this.exited;
    } finally {
      clearTimeout(forceKill);
    }
  }
}
