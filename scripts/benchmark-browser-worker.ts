import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const requestedDocuments = process.argv
  .slice(2)
  .map((file) => path.resolve(file));
if (process.platform !== 'linux' && process.platform !== 'darwin') {
  throw new Error('The browser worker benchmark requires Linux or macOS.');
}
await fs.access(cli);
const documentCwd = requestedDocuments.length > 0 ? process.cwd() : undefined;
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-bench-'));
const socket = path.join(directory, 'build.sock');
const round = (milliseconds: number) => Math.round(milliseconds);

function startCli(
  cwd: string,
  args: string[],
  onStdout?: (output: string) => void,
) {
  const start = performance.now();
  const child = spawn(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, DEBUG: 'vs-cli:pdf-timing' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
    onStdout?.(stdout);
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exit = new Promise<{
    code: number | null;
    output: string;
    wallMs: number;
  }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      resolve({
        code,
        output: stdout + stderr,
        wallMs: performance.now() - start,
      }),
    );
  });
  return { child, exit };
}

async function build(document: string, index: number, worker: boolean) {
  const { code, output, wallMs } = await startCli(documentCwd ?? directory, [
    'build',
    ...(worker ? ['--browser-worker', socket] : []),
    '--log-level',
    'silent',
    document,
    '-o',
    path.join(directory, `build-${index}.pdf`),
  ]).exit;
  if (code !== 0) {
    throw new Error(`Build failed for ${document}\n${output}`);
  }
  const launch = /PDF browser pid=\d+ launchMs=(\d+)/v.exec(output)?.[1];
  const render = /PDF render renderMs=(\d+)/v.exec(output)?.[1];
  if (launch === undefined || render === undefined) {
    throw new Error(`Build timing was unavailable for ${document}\n${output}`);
  }
  return {
    document: path.basename(document),
    wallMs: round(wallMs),
    launchMs: Number(launch),
    renderMs: Number(render),
  };
}

async function stopWorker(worker: ReturnType<typeof startCli>) {
  const start = performance.now();
  worker.child.kill('SIGTERM');
  const forceKill = setTimeout(() => {
    worker.child.kill('SIGKILL');
  }, 10_000);
  try {
    const result = await worker.exit;
    return { ...result, shutdownMs: round(performance.now() - start) };
  } finally {
    clearTimeout(forceKill);
  }
}

try {
  const documents =
    requestedDocuments.length > 0
      ? requestedDocuments
      : await Promise.all(
          [1, 5, 15].map(async (sections) => {
            const file = path.join(directory, `document-${sections}.md`);
            const body = Array.from(
              { length: sections },
              (_, i) =>
                `## Section ${i + 1}\n\n${'A paragraph of representative publication text. '.repeat(20)}\n\n`,
            ).join('');
            await fs.writeFile(
              file,
              `# Sample document (${sections} sections)\n\n${body}`,
            );
            return file;
          }),
        );
  await Promise.all(documents.map((document) => fs.access(document)));

  console.log('Priming the managed browser cache with a one-shot build.');
  await build(documents[0], 0, false);

  const rows = [];
  const oneShotStart = performance.now();
  for (const [index, document] of documents.entries()) {
    rows.push({ mode: 'one-shot', ...(await build(document, index, false)) });
  }
  const oneShotMs = round(performance.now() - oneShotStart);

  const persistentStart = performance.now();
  const ready = Promise.withResolvers<number>();
  const worker = startCli(
    directory,
    ['build-worker', '--socket', socket],
    (output) => {
      if (/Browser worker ready at [^\n]+\n/v.test(output)) {
        ready.resolve(performance.now());
      }
    },
  );
  let startupMs = 0;
  let workerExit: Awaited<ReturnType<typeof stopWorker>>;
  let readinessTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    readinessTimer = setTimeout(() => {
      ready.reject(new Error('Worker readiness timed out.'));
    }, 20_000);
    const readyAt = await Promise.race([
      ready.promise,
      worker.exit.then(({ output }) => {
        throw new Error(`Worker exited before readiness\n${output}`);
      }),
    ]);
    clearTimeout(readinessTimer);
    startupMs = round(readyAt - persistentStart);
    for (const [index, document] of documents.entries()) {
      rows.push({
        mode: index === 0 ? 'persistent first' : 'persistent reused',
        ...(await build(document, index, true)),
      });
    }
  } finally {
    clearTimeout(readinessTimer);
    workerExit = await stopWorker(worker);
  }
  if (workerExit.code !== 143) {
    throw new Error(
      `Worker failed to shut down normally\n${workerExit.output}`,
    );
  }
  const persistentMs = round(performance.now() - persistentStart);
  console.table(rows);
  console.table([
    {
      mode: 'one-shot',
      totalMs: oneShotMs,
      workerStartupMs: 0,
      workerShutdownMs: 0,
    },
    {
      mode: 'persistent',
      totalMs: persistentMs,
      workerStartupMs: startupMs,
      workerShutdownMs: workerExit.shutdownMs,
    },
  ]);
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
