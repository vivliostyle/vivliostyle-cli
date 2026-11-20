import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildShutdownGraceMs,
  signalProcess,
  waitForDaemonBuildGroup,
} from './browser-worker/process-group.js';
import type {
  BuildReply,
  BuildResult,
  ExecutorReply,
  ExecutorRequest,
} from './build-daemon/protocol.js';
import { Logger } from './logger.js';
import { toError } from './util.js';

const entry = fileURLToPath(
  new URL('./build-daemon/internal-executor.js', import.meta.url),
);
const maxDispatchedBuilds = 100;

export class BuildExecutor {
  readonly #child;
  readonly #directory: string;
  readonly #onRetirementFailure: (error: Error) => void;
  readonly #ready = Promise.withResolvers<null>();
  readonly #exit = Promise.withResolvers<Error>();
  readonly #killed = Promise.withResolvers<null>();
  #killDeadline?: number;
  #retirement?: Promise<void>;
  #onReply?: (reply: ExecutorReply) => void;
  #dispatched = 0;

  constructor(
    cwd: string,
    workerSocket: string,
    onRetirementFailure: (error: Error) => void,
  ) {
    this.#onRetirementFailure = onRetirementFailure;
    this.#directory = mkdtempSync(
      path.resolve(tmpdir(), 'vivliostyle-executor-'),
    );
    try {
      this.#child = fork(entry, [workerSocket], {
        cwd,
        detached: true,
        env: { ...process.env, TMPDIR: this.#directory },
        execArgv: [],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
    } catch (error) {
      rmSync(this.#directory, { recursive: true, force: true });
      throw error;
    }
    const onExit = (error: Error) => {
      this.#ready.reject(error);
      this.#exit.resolve(error);
      void this.stop();
    };
    this.#child.on('error', (error) => {
      if (this.#child.pid === undefined) {
        onExit(error);
      } else {
        void this.stop(true);
      }
    });
    this.#child.once('exit', (code, signal) => {
      onExit(new Error(`Build daemon executor exited (${signal ?? code}).`));
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
            id: this.#dispatched,
            stream,
            data: data.toString('base64'),
          });
        } else {
          Logger[stream].write(data);
        }
      });
    }
  }

  get retiring(): boolean {
    return (
      this.#retirement !== undefined ||
      !this.#child.connected ||
      this.#dispatched >= maxDispatchedBuilds
    );
  }

  ready(): Promise<null> {
    return this.#ready.promise;
  }

  #signalGroup(signal: NodeJS.Signals): void {
    const group = this.#child.pid;
    if (group !== undefined) {
      try {
        signalProcess(-group, signal);
      } catch (error) {
        Logger.debug('Could not signal the build daemon executor group', error);
      }
    }
  }

  #forceKill(): void {
    if (this.#killDeadline === undefined) {
      this.#signalGroup('SIGKILL');
      this.#killDeadline = performance.now() + 1000;
      this.#killed.resolve(null);
    }
  }

  #send(request: ExecutorRequest): void {
    if (this.#child.connected) {
      this.#child.send(request, (error) => {
        if (error) {
          void this.stop(true);
        }
      });
    }
  }

  async run(
    args: string[],
    signal: AbortSignal,
    reply: (message: BuildReply) => void,
  ): Promise<BuildResult> {
    signal.throwIfAborted();
    const result = Promise.withResolvers<BuildResult>();
    const finished = Promise.race([
      result.promise,
      this.#exit.promise.then((error) => {
        throw error;
      }),
      this.#killed.promise.then(() => {
        throw new Error('Build daemon executor was killed.');
      }),
    ]);
    const id = this.#dispatched + 1;
    let forceKill: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      this.#send({ type: 'cancel', message: String(signal.reason) });
      forceKill = setTimeout(() => {
        result.reject(
          new Error(
            'Build daemon executor exceeded its shutdown grace period.',
          ),
        );
        void this.stop(true);
      }, buildShutdownGraceMs);
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      await Promise.race([this.ready(), finished]);
      signal.throwIfAborted();
      const pid = this.#child.pid;
      if (pid === undefined || !this.#child.connected) {
        throw await this.#exit.promise;
      }
      this.#onReply = (message) => {
        if (message.type !== 'ready' && message.id === id) {
          if (message.type === 'result') {
            if (message.retire === 'force') {
              result.reject(new Error(message.error));
              void this.stop(true);
            } else {
              result.resolve({ type: 'result', error: message.error });
              if (message.retire === 'graceful') {
                void this.stop();
              }
            }
          } else {
            const { type, stream, data } = message;
            reply({ type, stream, data });
          }
        }
      };
      reply({ type: 'started', pid });
      this.#send({ type: 'build', id, args });
      this.#dispatched = id;
      return await finished;
    } finally {
      clearTimeout(forceKill);
      this.#onReply = undefined;
      signal.removeEventListener('abort', abort);
    }
  }

  stop(force = false): Promise<void> {
    if (force) {
      this.#forceKill();
    }
    if (!this.#retirement) {
      this.#retirement = this.#retire();
      void this.#retirement.catch((error) => {
        this.#onRetirementFailure(toError(error));
      });
    }
    return this.#retirement;
  }

  async #retire(): Promise<void> {
    const deadline = performance.now() + buildShutdownGraceMs;
    const forceKill = setTimeout(() => this.#forceKill(), buildShutdownGraceMs);
    try {
      if (this.#child.connected) {
        this.#child.disconnect();
      }
      await Promise.race([this.#exit.promise, this.#killed.promise]);
      const group = this.#child.pid;
      if (group !== undefined) {
        if (this.#killDeadline === undefined) {
          this.#signalGroup('SIGTERM');
          if (!(await waitForDaemonBuildGroup(group, deadline, 'retirement'))) {
            this.#forceKill();
          }
        }
        if (
          this.#killDeadline !== undefined &&
          !(await waitForDaemonBuildGroup(
            group,
            this.#killDeadline,
            'retirement',
          ))
        ) {
          throw new Error(
            `Could not verify that build daemon executor group ${group} stopped after SIGKILL. Retaining temporary directory ${this.#directory}.`,
          );
        }
      }
      clearTimeout(forceKill);
      await rm(this.#directory, { recursive: true, force: true });
    } finally {
      clearTimeout(forceKill);
      this.#child.stdout?.destroy();
      this.#child.stderr?.destroy();
      this.#child.unref();
    }
  }
}
