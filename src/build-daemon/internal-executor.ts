import { AsyncLocalStorage } from 'node:async_hooks';
import type { Socket } from 'node:net';

import { withBrowserWorker } from '../browser-worker/client.js';
import {
  buildShutdownGraceMs,
  signalProcess,
  stopBuildDescendants,
} from '../browser-worker/process-group.js';
import { connectBrowserWorker } from '../browser-worker/socket.js';
import { parseBuildOptions } from '../commands/build.parser.js';
import { parseInlineFlags } from '../commands/cli-flags.js';
import { build } from '../core/build.js';
import { Logger } from '../logger.js';
import { reloadPostcssConfig } from '../processor/css.js';
import { getFormattedError, toError, withCleanupScope } from '../util.js';
import type { ExecutorReply, ExecutorRequest } from './protocol.js';

const [, , workerSocketArg] = process.argv;
if (!process.channel || !workerSocketArg) {
  throw new Error('The internal build executor requires a build daemon.');
}
const workerSocket = workerSocketArg;

const requestContext = new AsyncLocalStorage<number>();
let active:
  | { id: number; controller: AbortController; done: Promise<void> }
  | undefined;

function send(reply: ExecutorReply): void {
  if (process.connected) {
    process.send?.(reply, () => {});
  }
}

// Send CLI output and the terminal result on the same ordered channel. The
// ordinary descriptors remain available for subprocesses using inherited stdio.
function forwardLogs(name: 'stdout' | 'stderr'): void {
  const stream = process[name];
  const write = stream.write.bind(stream);
  stream.write = (
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ) => {
    const id = requestContext.getStore();
    if (id === undefined) {
      return typeof encoding === 'function'
        ? write(chunk, encoding)
        : write(chunk, encoding, callback);
    }
    if (active?.id === id) {
      const bytes =
        typeof chunk === 'string'
          ? Buffer.from(
              chunk,
              typeof encoding === 'string' ? encoding : undefined,
            )
          : Buffer.from(chunk);
      for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
        send({
          type: 'log',
          id,
          stream: name,
          data: bytes.subarray(offset, offset + 64 * 1024).toString('base64'),
        });
      }
    }
    const written = typeof encoding === 'function' ? encoding : callback;
    if (written) {
      queueMicrotask(written);
    }
    return true;
  };
}

function preserveProcessSettings(): Disposable {
  const logger = Logger.preserveState();
  const environment = { ...process.env };
  const directory = process.cwd();
  // oxlint-disable-next-line typescript/no-deprecated -- POSIX executor restores the mask when the request drains
  const umask = process.umask();
  const exitCode = process.exitCode;
  return {
    [Symbol.dispose]() {
      logger[Symbol.dispose]();
      process.chdir(directory);
      process.umask(umask);
      process.exitCode = exitCode;
      for (const key of Object.keys(process.env)) {
        if (!Object.hasOwn(environment, key)) {
          Reflect.deleteProperty(process.env, key);
        }
      }
      Object.assign(process.env, environment);
    },
  };
}

async function execute(args: string[], signal: AbortSignal): Promise<void> {
  using _ = preserveProcessSettings();
  await reloadPostcssConfig();

  let socket: Socket | undefined;
  try {
    const { options, browserWorker } = parseBuildOptions(
      ['vivliostyle', 'build', ...args],
      { exitOverride: true },
    );
    if (browserWorker !== undefined) {
      throw new Error(
        '--browser-worker is configured when starting the build daemon.',
      );
    }
    if (options.renderMode === 'docker') {
      throw new Error(
        '--build-daemon cannot be used with Docker PDF rendering.',
      );
    }
    const inlineConfig = parseInlineFlags(options);
    Logger.setLogOptions({ ...inlineConfig, signal });
    socket = await connectBrowserWorker(workerSocket, signal);
    await withBrowserWorker(socket, workerSocket, signal, (renderWithWorker) =>
      withCleanupScope(() =>
        build({ ...inlineConfig, signal }, { renderWithWorker }),
      ),
    );
    signal.throwIfAborted();
  } finally {
    // Keep the browser lease until the request and its descendants have drained.
    try {
      await stopBuildDescendants(
        process.pid,
        performance.now() + buildShutdownGraceMs,
        'reuse',
      );
    } finally {
      socket?.destroy();
    }
  }
}

forwardLogs('stdout');
forwardLogs('stderr');
process.on('message', (raw) => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- private IPC channel from the supervising daemon
  const request = raw as ExecutorRequest;
  if (request.type === 'cancel') {
    active?.controller.abort(new Error(request.message));
    return;
  }
  if (active) {
    throw new Error('Concurrent builds in the build executor.');
  }
  const { id, args } = request;
  const controller = new AbortController();
  const done = requestContext.run(id, async () => {
    // Install the active job before its synchronous startup can write logs.
    await Promise.resolve();
    let error: string | undefined;
    try {
      await execute(args, controller.signal);
    } catch (reason) {
      error = getFormattedError(toError(reason));
    } finally {
      active = undefined;
    }
    send({ type: 'result', id, error });
  });
  active = { id, controller, done };
});

process.once('disconnect', () => {
  const job = active;
  job?.controller.abort(new Error('Build daemon disconnected.'));
  const kill = setTimeout(() => {
    signalProcess(-process.pid, 'SIGKILL');
  }, buildShutdownGraceMs);
  void (async () => {
    await job?.done;
    clearTimeout(kill);
    process.exit();
  })();
});
send({ type: 'ready' });
