import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { Browser, detectBrowserPlatform, install } from '@puppeteer/browsers';

import { DEFAULT_BROWSER_VERSIONS } from '../dist/constants.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const { values, positionals } = parseArgs({
  options: { 'executable-browser': { type: 'string' } },
  allowPositionals: true,
});
const requestedDocuments = positionals.map((file) => path.resolve(file));
if (process.platform !== 'linux' && process.platform !== 'darwin') {
  throw new Error('The build benchmark requires Linux or macOS.');
}
await fs.access(cli);
const documentCwd = requestedDocuments.length > 0 ? process.cwd() : undefined;
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vs-bench-'));
const cwd = documentCwd ?? directory;
const workerSocket = path.join(directory, 'chromium.sock');
const daemonSocket = path.join(directory, 'build.sock');
const round = (milliseconds: number) => Math.round(milliseconds);

function startCli(args: string[], onStdout?: (output: string) => void) {
  const start = performance.now();
  const child = spawn(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, DEBUG: 'vs-cli:build-timing,vs-cli:pdf-timing' },
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

async function getBrowserExecutable() {
  if (values['executable-browser']) {
    return path.resolve(values['executable-browser']);
  }
  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error('No managed Chrome build is available on this platform.');
  }
  const { executablePath } = await install({
    browser: Browser.CHROME,
    buildId: DEFAULT_BROWSER_VERSIONS.chrome[platform],
    cacheDir: fileURLToPath(
      new URL(
        '../node_modules/.cache/vivliostyle-browser-worker',
        import.meta.url,
      ),
    ),
  });
  return executablePath;
}

function timing(output: string, field: string): number | undefined {
  const samples = [...output.matchAll(new RegExp(`\\b${field}=(\\d+)`, 'gv'))];
  return samples.length > 0
    ? samples.reduce((total, [, sample]) => total + Number(sample), 0)
    : undefined;
}

type Mode = 'one-shot' | 'browser worker' | 'build daemon';

async function build(
  document: string,
  index: number,
  mode: Mode,
  executable: string,
) {
  const transport = {
    'one-shot': [],
    'browser worker': ['--browser-worker', workerSocket],
    'build daemon': ['--build-daemon', daemonSocket],
  }[mode];
  const { code, output, wallMs } = await startCli([
    'build',
    ...transport,
    '--log-level',
    'silent',
    '--executable-browser',
    executable,
    document,
    '-o',
    path.join(directory, `${mode}-${index}.pdf`),
  ]).exit;
  if (code !== 0) {
    throw new Error(`Build failed for ${document}\n${output}`);
  }
  return {
    mode,
    build: index === 0 ? 'first' : 'subsequent',
    document: path.basename(document),
    wallMs: round(wallMs),
    configMs: timing(output, 'configMs'),
    viteConfigMs: timing(output, 'viteConfigMs'),
    viteStartupMs: timing(output, 'viteStartupMs'),
    compileMs: timing(output, 'compileMs'),
    launchMs: timing(output, 'launchMs'),
    renderMs: timing(output, 'renderMs'),
    postprocessMs: timing(output, 'postprocessMs'),
  };
}

async function stopService(service: ReturnType<typeof startCli>) {
  const start = performance.now();
  service.child.kill('SIGTERM');
  const forceKill = setTimeout(() => {
    service.child.kill('SIGKILL');
  }, 15_000);
  try {
    const result = await service.exit;
    if (result.code !== 143) {
      throw new Error(`Service failed to shut down normally\n${result.output}`);
    }
    return round(performance.now() - start);
  } finally {
    clearTimeout(forceKill);
  }
}

async function startService(args: string[], pattern: RegExp) {
  const start = performance.now();
  const ready = Promise.withResolvers<number>();
  const service = startCli(args, (output) => {
    if (pattern.test(output)) {
      ready.resolve(performance.now());
    }
  });
  const timer = setTimeout(() => {
    ready.reject(new Error(`${args[0]} readiness timed out.`));
  }, 20_000);
  try {
    const readyAt = await Promise.race([
      ready.promise,
      service.exit.then(({ output }) => {
        throw new Error(`Service exited before readiness\n${output}`);
      }),
    ]);
    return { service, startupMs: round(readyAt - start) };
  } catch (error) {
    await stopService(service).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function stopServices(
  daemon: Awaited<ReturnType<typeof startService>> | undefined,
  worker: Awaited<ReturnType<typeof startService>> | undefined,
) {
  let daemonShutdownMs = 0;
  let workerShutdownMs = 0;
  try {
    if (daemon) {
      daemonShutdownMs = await stopService(daemon.service);
    }
  } finally {
    if (worker) {
      workerShutdownMs = await stopService(worker.service);
    }
  }
  return { daemonShutdownMs, workerShutdownMs };
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
  const executable = await getBrowserExecutable();
  await fs.access(executable);
  console.log(`Chromium executable: ${executable}`);
  console.log('Warming filesystem caches with an unmeasured one-shot build.');
  await build(documents[0], 0, 'one-shot', executable);

  const rows = [];
  const totals = [];
  for (const mode of ['one-shot', 'browser worker', 'build daemon'] as const) {
    const start = performance.now();
    const worker =
      mode === 'one-shot'
        ? undefined
        : await startService(
            ['build-worker', '--socket', workerSocket],
            /Browser worker ready at [^\n]+\n/v,
          );
    let daemon: Awaited<ReturnType<typeof startService>> | undefined;
    let shutdown: Awaited<ReturnType<typeof stopServices>>;
    try {
      if (mode === 'build daemon') {
        daemon = await startService(
          [
            'build-daemon',
            '--socket',
            daemonSocket,
            '--browser-worker',
            workerSocket,
          ],
          /Build daemon ready at [^\n]+\n/v,
        );
      }
      for (const [index, document] of documents.entries()) {
        rows.push(await build(document, index, mode, executable));
      }
    } finally {
      shutdown = await stopServices(daemon, worker);
    }
    totals.push({
      mode,
      totalMs: round(performance.now() - start),
      workerStartupMs: worker?.startupMs ?? 0,
      daemonStartupMs: daemon?.startupMs ?? 0,
      ...shutdown,
    });
  }
  console.table(rows);
  console.table(totals);
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}
