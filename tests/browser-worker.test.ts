import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { createConnection, type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Browser, install } from '@puppeteer/browsers';
import { PDFDocument } from 'pdf-lib';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { WorkerConnection } from '../src/browser-worker/protocol.js';
import { DEFAULT_BROWSER_VERSIONS } from '../src/constants.js';
import { detectBrowserPlatform } from '../src/util.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const supported = process.platform === 'linux' || process.platform === 'darwin';
const waitOptions = { timeout: 20_000, interval: 50 };

describe.skipIf(!supported)('bundled browser worker', () => {
  let directory: string;
  let socket: string;
  let executablePath: string;
  const children = new Set<ChildProcess>();
  const exits = new Set<Promise<unknown>>();
  const listening = createServer();
  let origin: string;
  const storage = new Map<
    string,
    { cookie: string | undefined; local: string | null }
  >();
  const holds = new Set<string>();

  function start(...args: string[]) {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: directory,
      env: {
        ...process.env,
        DEBUG: 'vs-cli,vs-cli:pdf-timing',
        ...(args[0] === 'build-worker' ? { TMPDIR: directory } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.add(child);
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
    });
    const exit = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
      output: string;
    }>((resolve) => {
      child.once('close', (code, signal) => {
        children.delete(child);
        resolve({ code, signal, output });
      });
    });
    exits.add(exit);
    return {
      child,
      exit,
      waitFor: (pattern: RegExp) =>
        vi.waitFor(() => {
          expect(output).toMatch(pattern);
        }, waitOptions),
    };
  }

  async function startWorker() {
    const worker = start('build-worker', '--socket', socket);
    await worker.waitFor(/Browser worker ready at /v);
    return worker;
  }

  async function profiles() {
    return (await fs.readdir(directory)).filter((name) =>
      name.startsWith('vivliostyle-browser-'),
    );
  }

  function build(
    name: string,
    {
      document = 'first.md',
      viewer,
      worker = true,
      args = [],
    }: {
      document?: string;
      viewer?: string;
      worker?: boolean;
      args?: string[];
    } = {},
  ) {
    return start(
      'build',
      ...(worker ? ['--browser-worker', socket] : []),
      ...(viewer ? ['--viewer', `${origin}/${viewer}`] : []),
      '--log-level',
      'silent',
      '--executable-browser',
      executablePath,
      ...args,
      document,
      '-o',
      `${name}.pdf`,
    );
  }

  async function succeeded(job: ReturnType<typeof start>) {
    const result = await job.exit;
    expect(result).toMatchObject({ code: 0 });
    const pid = browserPid(result.output);
    expect(result.output).toMatch(/PDF browser pid=[1-9]\d*/v);
    return pid;
  }

  async function inspectPdf(name: string) {
    const pdf = await PDFDocument.load(
      await fs.readFile(path.join(directory, `${name}.pdf`)),
    );
    return {
      title: pdf.getTitle(),
      creator: pdf.getCreator(),
      author: pdf.getAuthor(),
      pages: pdf.getPages().map((page) => ({
        size: page.getSize(),
        trim: page.getTrimBox(),
        bleed: page.getBleedBox(),
      })),
    };
  }

  beforeAll(async () => {
    // The one-shot PDF suite can download its managed browser concurrently.
    const platform = detectBrowserPlatform();
    if (!platform) {
      throw new Error(
        'No default Chrome build is configured for this platform.',
      );
    }
    ({ executablePath } = await install({
      browser: Browser.CHROME,
      buildId: DEFAULT_BROWSER_VERSIONS.chrome[platform],
      cacheDir: fileURLToPath(
        new URL(
          '../node_modules/.cache/vivliostyle-browser-worker',
          import.meta.url,
        ),
      ),
    }));
  }, 120_000);

  beforeEach(async () => {
    // Keep socket paths short enough for macOS.
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vsw-'));
    socket = path.join(directory, 'build.sock');
    await Promise.all([
      fs.writeFile(
        path.join(directory, 'first.md'),
        '# First PDF\n\nFirst document.\n',
      ),
      fs.writeFile(
        path.join(directory, 'second.html'),
        '<!doctype html><title>Second PDF</title><p>Second document.</p><p style="break-before: page">Extra page.</p>',
      ),
    ]);
    storage.clear();
    holds.clear();
    listening.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', origin);
      const viewer = url.pathname.slice(1);
      if (viewer === 'observed') {
        storage.set(url.searchParams.get('viewer') ?? '', {
          cookie: request.headers.cookie,
          local: url.searchParams.get('local'),
        });
        response.end();
      } else if (viewer === 'holding') {
        holds.add(url.searchParams.get('viewer') ?? '');
        response.end();
      } else {
        response.setHeader('Content-Type', 'text/html');
        response.end(controlledViewer(viewer));
      }
    });
    listening.listen(0, '127.0.0.1');
    await once(listening, 'listening');
    origin = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    const running = [...children];
    for (const child of running) {
      child.kill('SIGTERM');
    }
    const force = setTimeout(() => {
      for (const child of running) {
        if (children.has(child)) {
          child.kill('SIGKILL');
        }
      }
    }, 15_000);
    try {
      await Promise.all(exits);
    } finally {
      clearTimeout(force);
      exits.clear();
      if (listening.listening) {
        const closed = once(listening, 'close');
        listening.close();
        listening.closeAllConnections();
        await closed;
      }
      listening.removeAllListeners('request');
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it('reuses a live Chromium across CLI exits, matches PDF output, and isolates origin storage', async () => {
    const worker = await startWorker();
    expect(await profiles()).toHaveLength(0);
    const first = {
      args: [
        '--title',
        'First book',
        '--author',
        'An Author',
        '--size',
        'A5',
        '--crop-marks',
      ],
    };
    const second = {
      document: 'second.html',
      args: ['--size', 'A4', '--single-doc'],
    };
    const pid = await succeeded(build('first-worker', first));
    expect(process.kill(pid, 0)).toBe(true);
    expect(await profiles()).toHaveLength(1);
    expect(await succeeded(build('second-worker', second))).toBe(pid);
    expect(process.kill(pid, 0)).toBe(true);

    await succeeded(build('first-local', { ...first, worker: false }));
    await succeeded(build('second-local', { ...second, worker: false }));
    const firstPdf = await inspectPdf('first-worker');
    const secondPdf = await inspectPdf('second-worker');
    expect(firstPdf).toEqual(await inspectPdf('first-local'));
    expect(secondPdf).toEqual(await inspectPdf('second-local'));
    expect(firstPdf).toMatchObject({
      title: 'First book',
      author: 'An Author',
    });
    expect(secondPdf.title).toBe('Second PDF');
    expect(firstPdf.pages).toHaveLength(1);
    expect(secondPdf.pages).toHaveLength(2);
    expect(firstPdf.pages[0].size).not.toEqual(secondPdf.pages[0].size);

    expect(await succeeded(build('seed', { viewer: 'seed' }))).toBe(pid);
    expect(await succeeded(build('probe', { viewer: 'probe' }))).toBe(pid);
    expect(storage.get('seed')).toEqual({
      cookie: 'previous=stored',
      local: 'stored',
    });
    expect(storage.get('probe')).toEqual({ cookie: undefined, local: null });

    expect(
      await succeeded(
        build('mixed', {
          args: [
            '-o',
            'publication.epub',
            '-o',
            'extra.pdf',
            '-o',
            'web/',
            '-f',
            'webpub',
          ],
        }),
      ),
    ).toBe(pid);
    await expect(
      fs.stat(path.join(directory, 'publication.epub')),
    ).resolves.toBeDefined();
    await expect(
      fs.stat(path.join(directory, 'web/publication.json')),
    ).resolves.toBeDefined();

    expect((await inspectPdf('extra')).pages).toHaveLength(1);

    const replacement = await succeeded(
      build('new-settings', { args: ['--ignore-https-errors'] }),
    );
    expect(replacement).not.toBe(pid);
    expect(
      await succeeded(
        build('same-settings', { args: ['--ignore-https-errors'] }),
      ),
    ).toBe(replacement);
    expect(() => process.kill(pid, 0)).toThrow(/ESRCH/v);

    worker.child.kill('SIGTERM');
    expect((await worker.exit).code).toBe(143);
    await expect(fs.stat(socket)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(() => process.kill(replacement, 0)).toThrow(/ESRCH/v);
    expect(await profiles()).toHaveLength(0);
  }, 120_000);

  it('holds a FIFO lease across preparation, handles cancellation and errors, and replaces a crashed browser', async () => {
    const worker = await startWorker();
    const active = build('active', { viewer: 'hold-active' });
    await vi.waitFor(
      () => expect(holds.has('hold-active')).toBe(true),
      waitOptions,
    );

    await fs.writeFile(
      path.join(directory, 'queued.config.mjs'),
      `
      import { writeFileSync } from 'node:fs';
      writeFileSync('prepared', '');
      export default { entry: 'second.html' };
    `,
    );
    const waiting = /Waiting for browser worker lease/v;
    const cancelled = build('cancelled', {
      args: ['--config', 'queued.config.mjs'],
    });
    await cancelled.waitFor(waiting);
    const next = build('next', {
      viewer: 'hold-next',
      args: ['--config', 'queued.config.mjs'],
    });
    await next.waitFor(waiting);
    const last = build('last', { viewer: 'last' });
    await last.waitFor(waiting);
    await expect(
      fs.stat(path.join(directory, 'prepared')),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    cancelled.child.kill('SIGINT');
    expect((await cancelled.exit).code).toBe(130);
    active.child.kill('SIGINT');
    const activeResult = await active.exit;
    expect(activeResult).toMatchObject({ code: 130 });
    const pid = browserPid(activeResult.output);
    expect(pid).toBeGreaterThan(0);

    await vi.waitFor(
      () => expect(holds.has('hold-next')).toBe(true),
      waitOptions,
    );
    expect(storage.has('last')).toBe(false);
    await expect(
      fs.stat(path.join(directory, 'prepared')),
    ).resolves.toBeDefined();
    next.child.kill('SIGKILL');
    expect((await next.exit).signal).toBe('SIGKILL');
    expect(await succeeded(last)).toBe(pid);
    for (const name of ['active', 'cancelled', 'next']) {
      await expect(
        fs.stat(path.join(directory, `${name}.pdf`)),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    }

    const timedOut = await build('timeout', {
      viewer: 'hold-timeout',
      args: ['--timeout', '1'],
    }).exit;
    expect(timedOut).toMatchObject({ code: 1 });
    expect(timedOut.output).toContain('PDF rendering timed out after 1 s');
    expect(browserPid(timedOut.output)).toBe(pid);

    const failure = await build('failed', { viewer: 'failure' }).exit;
    expect(failure).toMatchObject({ code: 1 });
    expect(failure.output).toContain('Controlled render failure');
    expect(browserPid(failure.output)).toBe(pid);
    expect(await succeeded(build('after-errors'))).toBe(pid);

    const crashing = build('crashing', { viewer: 'hold-crash' });
    await vi.waitFor(
      () => expect(holds.has('hold-crash')).toBe(true),
      waitOptions,
    );
    process.kill(pid, 'SIGKILL');
    const crash = await crashing.exit;
    expect(crash).toMatchObject({ code: 1 });
    expect(crash.output).toContain(
      'Chromium disconnected during PDF rendering',
    );
    expect(crash.output.match(/PDF browser pid=/gv)).toHaveLength(1);
    await expect(
      fs.stat(path.join(directory, 'crashing.pdf')),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    const replacement = await succeeded(build('after-crash'));
    expect(replacement).not.toBe(pid);
    const stopping = build('stopping', { viewer: 'hold-shutdown' });
    await vi.waitFor(
      () => expect(holds.has('hold-shutdown')).toBe(true),
      waitOptions,
    );
    const queued = build('shutdown-queued');
    await queued.waitFor(waiting);
    worker.child.kill('SIGTERM');
    for (const job of [stopping, queued]) {
      const result = await job.exit;
      expect(result).toMatchObject({ code: 1 });
      expect(result.output).toContain('Browser worker is shutting down');
    }
    expect((await worker.exit).code).toBe(143);
    await expect(fs.stat(socket)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(() => process.kill(replacement, 0)).toThrow(/ESRCH/v);
    expect(await profiles()).toHaveLength(0);
  }, 120_000);

  it('reports missing and incompatible workers and preserves an existing socket path', async () => {
    const missing = await build('missing').exit;
    expect(missing.code).toBe(1);
    expect(missing.output).toContain('Browser worker unavailable');
    await fs.writeFile(socket, 'existing');
    const existing = await start('build-worker', '--socket', socket).exit;
    expect(existing.code).toBe(1);
    expect(existing.output).toContain('socket path already exists');
    expect(await fs.readFile(socket, 'utf8')).toBe('existing');
    await fs.unlink(socket);

    const unsafeDir = path.join(directory, 'unsafe');
    await fs.mkdir(unsafeDir);
    await fs.chmod(unsafeDir, 0o755);
    const unsafe = await start(
      'build-worker',
      '--socket',
      path.join(unsafeDir, 'build.sock'),
    ).exit;
    expect(unsafe.code).toBe(1);
    expect(unsafe.output).toContain('accessible only to its owner');

    await startWorker();
    const incompatibleSocket = createConnection(socket);
    try {
      const connection = new WorkerConnection(incompatibleSocket);
      connection.send({ type: 'acquire', version: 0 });
      await expect(connection.readMessage()).resolves.toMatchObject({
        type: 'error',
        message: expect.stringContaining(
          'Incompatible browser worker protocol',
        ),
      });
    } finally {
      incompatibleSocket.destroy();
    }
    const firefox = await build('firefox', { args: ['--browser', 'firefox'] })
      .exit;
    expect(firefox.code).toBe(1);
    expect(firefox.output).toContain('Firefox is unsupported');
    const docker = await build('docker', { args: ['--render-mode', 'docker'] })
      .exit;
    expect(docker.code).toBe(1);
    expect(docker.output).toContain('cannot be used with Docker PDF rendering');
  }, 45_000);

  it('keeps the worker usable after Chromium cannot start', async () => {
    await startWorker();
    const pid = await succeeded(build('initial'));

    const nonExecutable = path.join(directory, 'non-executable');
    await fs.writeFile(nonExecutable, '', { mode: 0o600 });
    const denied = await build('permission-error', {
      args: ['--executable-browser', nonExecutable],
    }).exit;
    expect(denied).toMatchObject({ code: 1 });
    expect(denied.output).toContain('Chromium path is not an executable file');
    expect(await succeeded(build('still-warm'))).toBe(pid);

    const broken = path.join(directory, "broken browser's launcher");
    await fs.writeFile(broken, '#!/nonexistent-vivliostyle-interpreter\n', {
      mode: 0o700,
    });
    const failed = await build('launch-error', {
      args: ['--executable-browser', broken],
    }).exit;
    expect(failed).toMatchObject({ code: 1 });
    expect(failed.output).toContain(`Failed to launch Chromium at ${broken}`);
    expect(await profiles()).toHaveLength(0);
    const replacement = await succeeded(build('after-launch-error'));
    expect(replacement).not.toBe(pid);
    expect(await succeeded(build('after-launch-recovery'))).toBe(replacement);
  }, 60_000);

  it('validates build options before leasing the worker', async () => {
    await startWorker();
    const invalid = await build('invalid-options', {
      args: ['--timeout=-1'],
    }).exit;
    expect(invalid.code).toBe(1);
    expect(invalid.output).toContain('Invalid value: Expected >=0');
    expect(invalid.output).not.toContain('PDF browser pid=');
    await succeeded(build('valid-options'));
  }, 30_000);

  it('releases the lease after interrupting a config that does not settle', async () => {
    await startWorker();
    const pid = await succeeded(build('before-config'));
    await fs.writeFile(
      path.join(directory, 'stalled.config.mjs'),
      `
      console.log('Waiting inside config');
      await new Promise(() => {});
      export default { entry: 'first.md' };
    `,
    );
    const active = build('stuck-config', {
      args: ['--config', 'stalled.config.mjs'],
    });
    await active.waitFor(/Waiting inside config/v);
    const next = build('after-config');
    await next.waitFor(/Waiting for browser worker lease/v);

    active.child.kill('SIGINT');
    await active.waitFor(
      /Browser worker build exceeded its shutdown grace period/v,
    );
    expect(await active.exit).toMatchObject({ code: 130 });
    await expect(
      fs.stat(path.join(directory, 'stuck-config.pdf')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await succeeded(next)).toBe(pid);
  }, 45_000);

  it.each([
    {
      signal: 'SIGINT' as const,
      writerExitsOnTerm: false,
      expectedSignalLog: /Writer ignored SIGINT/v,
      expectedExit: { code: 130 },
    },
    {
      signal: 'SIGKILL' as const,
      writerExitsOnTerm: true,
      expectedSignalLog: /Writer received SIGTERM/v,
      expectedExit: { signal: 'SIGKILL' },
    },
  ])(
    'waits for a config descendant before granting the next lease after $signal',
    async ({ signal, writerExitsOnTerm, expectedSignalLog, expectedExit }) => {
      await startWorker();
      const pid = await succeeded(build('before-descendant'));
      await Promise.all([
        fs.writeFile(
          path.join(directory, 'writer.mjs'),
          `
          import { existsSync, writeFileSync } from 'node:fs';
          process.on('SIGINT', () => console.log('Writer ignored SIGINT'));
          process.on('SIGTERM', () => {
            console.log('Writer received SIGTERM');
            if (${writerExitsOnTerm}) process.exit(0);
          });
          writeFileSync('writer.pid', String(process.pid));
          console.log('Writer ready');
          setInterval(() => {
            if (existsSync('shared')) writeFileSync('shared', 'stale');
          }, 10);
        `,
        ),
        fs.writeFile(
          path.join(directory, 'writer.config.mjs'),
          `
          import { spawn } from 'node:child_process';
          spawn(process.execPath, ['writer.mjs'], { stdio: 'inherit' }).unref();
          export default { entry: 'first.md' };
        `,
        ),
        fs.writeFile(
          path.join(directory, 'next.config.mjs'),
          `
          import { spawnSync } from 'node:child_process';
          import { readFileSync, writeFileSync } from 'node:fs';
          const pid = readFileSync('writer.pid', 'utf8');
          const result = spawnSync('/bin/ps', ['-p', pid, '-o', 'stat='], {
            encoding: 'utf8',
          });
          writeFileSync('shared', 'next');
          if (result.error || (result.status !== 1 &&
              (result.status !== 0 || !result.stdout.trim().startsWith('Z')))) {
            throw new Error('The next build started while the writer could still run');
          }
          export default { entry: 'first.md' };
        `,
        ),
      ]);
      const active = build('with-descendant', {
        viewer: 'hold-with-descendant',
        args: ['--config', 'writer.config.mjs'],
      });
      await active.waitFor(/Writer ready/v);
      await vi.waitFor(
        () => expect(holds.has('hold-with-descendant')).toBe(true),
        waitOptions,
      );
      const next = build('after-descendant', {
        args: ['--config', 'next.config.mjs'],
      });
      await next.waitFor(/Waiting for browser worker lease/v);
      active.child.kill(signal);
      await active.waitFor(expectedSignalLog);

      expect(await succeeded(next)).toBe(pid);
      await expect(
        fs.readFile(path.join(directory, 'shared'), 'utf8'),
      ).resolves.toBe('next');
      expect(await active.exit).toMatchObject(expectedExit);
    },
    45_000,
  );

  it('writes a PDF with 34 MiB of viewer diagnostics and still reports rendering errors', async () => {
    await startWorker();
    const pid = await succeeded(build('noisy', { viewer: 'noisy' }));
    expect((await inspectPdf('noisy')).pages).toHaveLength(1);

    const failure = await build('noisy-failure', { viewer: 'noisy-failure' })
      .exit;
    expect(failure).toMatchObject({ code: 1 });
    expect(failure.output).toContain('Controlled render failure');
    expect(browserPid(failure.output)).toBe(pid);
    await expect(
      fs.stat(path.join(directory, 'noisy-failure.pdf')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  }, 60_000);
});

function browserPid(output: string) {
  return Number(/PDF browser pid=(\d+)/v.exec(output)?.[1] ?? 0);
}

function controlledViewer(viewer: string) {
  return `<!doctype html>
    <meta charset="utf-8">
    <style>
      @page { size: 300px 400px; margin: 0 }
      body, p { margin: 0 }
    </style>
    <div id="vivliostyle-viewer-viewport"><div><div>
      <div data-vivliostyle-page-container style="width:300px;height:400px">
        <div data-vivliostyle-bleed-box style="left:0;padding-left:0">
          <p>Controlled viewer output</p>
        </div>
      </div>
    </div></div></div>
    <script>
      const viewer = ${JSON.stringify(viewer)};
      if (viewer === 'seed') {
        document.cookie = 'previous=stored; path=/';
        localStorage.setItem('previous', 'stored');
      }
      if (viewer.startsWith('noisy')) {
        console.log('x'.repeat(34 * 1024 * 1024));
        void window.__vsCliReportPaginationProgress(1, 0.5, 'あ'.repeat(4096));
      }
      const observed = new URLSearchParams({ viewer });
      const previous = localStorage.getItem('previous');
      if (previous !== null) observed.set('local', previous);
      void fetch('/observed?' + observed);
      const listeners = new Set();
      window.coreViewer = {
        readyState: 'complete',
        getMetadata() {
          if (viewer.endsWith('failure')) throw new Error('Controlled render failure');
          return { 'http://purl.org/dc/terms/title': [{ v: viewer, o: 0 }] };
        },
        getTOC: () => [],
        addListener(type, listener) {
          if (type === 'done') listeners.add(listener);
        },
        removeListener(type, listener) { listeners.delete(listener); },
        showTOC(visible) {
          if (!visible) return;
          if (viewer.startsWith('hold-')) {
            void fetch('/holding?' + new URLSearchParams({ viewer }));
            return;
          }
          for (const listener of listeners) listener({ a: 'toc' });
        }
      };
    </script>`;
}
