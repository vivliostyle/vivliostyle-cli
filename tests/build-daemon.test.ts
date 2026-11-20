import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import {
  createConnection,
  createServer,
  type AddressInfo,
  type Socket,
} from 'node:net';
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
import {
  buildProtocolVersion,
  type BuildReply,
} from '../src/build-daemon/protocol.js';
import { DEFAULT_BROWSER_VERSIONS } from '../src/constants.js';
import { detectBrowserPlatform } from '../src/util.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const supported = process.platform === 'linux' || process.platform === 'darwin';
const waiting = /Waiting for build daemon executor/v;
const waitOptions = { timeout: 20_000, interval: 50 };

describe.skipIf(!supported)('bundled build daemon', () => {
  let directory: string;
  let project: string;
  let workerSocket: string;
  let daemonSocket: string;
  let executablePath: string;
  let port: number;
  const children = new Set<ChildProcess>();
  const exits = new Set<Promise<unknown>>();
  const sockets = new Set<Socket>();
  const viewer = createHttpServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html>
      <script>
        window.coreViewer = {
          readyState: 'complete',
          getMetadata: () => ({}),
          getTOC: () => [],
          addListener() {},
          removeListener() {},
          showTOC() { console.log('Viewer waiting for cancellation'); }
        };
      </script>`);
  });

  function start(args: string[], cwd = project) {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env: {
        ...process.env,
        DEBUG: 'vs-cli,vs-cli:pdf-timing',
        TMPDIR: directory,
        VS_BUILD_DAEMON_TEST: args[0] === 'build-daemon' ? 'service' : 'client',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.add(child);
    let output = '';
    const collect = (chunk: string) => {
      output += chunk;
    };
    child.stdout.setEncoding('utf8').on('data', collect);
    child.stderr.setEncoding('utf8').on('data', collect);
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
        vi.waitFor(() => expect(output).toMatch(pattern), waitOptions),
    };
  }

  async function startServices() {
    const worker = start(['build-worker', '--socket', workerSocket]);
    await worker.waitFor(/Browser worker ready at /v);
    const daemon = start([
      'build-daemon',
      '--socket',
      daemonSocket,
      '--browser-worker',
      workerSocket,
    ]);
    await daemon.waitFor(/Build daemon ready at /v);
    return { worker, daemon };
  }

  function build(name: string, args: string[] = ['first.md'], cwd = project) {
    return start(
      ['build', '--build-daemon', daemonSocket, ...flags(name), ...args],
      cwd,
    );
  }

  function flags(name: string) {
    return [
      '--executable-browser',
      executablePath,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '-o',
      `${name}.pdf`,
    ];
  }

  async function hold(name: string) {
    const job = build(name, [
      'first.md',
      '--log-level',
      'verbose',
      '--viewer',
      `http://127.0.0.1:${(viewer.address() as AddressInfo).port}`,
    ]);
    await job.waitFor(/Viewer waiting for cancellation/v);
    return job;
  }

  async function shutdown(service: ReturnType<typeof start>) {
    service.child.kill('SIGTERM');
    expect(await service.exit).toMatchObject({ code: 143 });
  }

  async function succeeded(job: ReturnType<typeof start>) {
    const { code, output } = await job.exit;
    if (code !== 0) {
      throw new Error(output);
    }
    const executor = Number(
      /Build daemon executor pid=(\d+)/v.exec(output)?.[1],
    );
    const browser = Number(/PDF browser pid=(\d+)/v.exec(output)?.[1]);
    expect(executor).toBeGreaterThan(0);
    expect(browser).toBeGreaterThan(0);
    return { executor, browser, output };
  }

  function raw() {
    const socket = createConnection(daemonSocket);
    socket.on('error', () => {});
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
    return { socket, connection: new WorkerConnection<unknown>(socket) };
  }

  function request(args: string[]) {
    return { type: 'build', version: buildProtocolVersion, cwd: project, args };
  }

  async function readUntil(
    connection: WorkerConnection<unknown>,
    matches: (reply: BuildReply) => boolean,
  ) {
    for (;;) {
      const reply = (await connection.readMessage()) as BuildReply;
      if (matches(reply)) {
        return reply;
      }
      if (reply.type === 'result') {
        throw new Error(
          `Build finished before the expected reply: ${reply.error}`,
        );
      }
    }
  }

  async function file(name: string, content: string) {
    await fs.writeFile(path.join(project, name), content);
  }

  async function pdf(name: string) {
    return PDFDocument.load(
      await fs.readFile(path.join(project, `${name}.pdf`)),
    );
  }

  async function listenOnPort(requestedPort: number) {
    const server = createServer();
    server.listen(requestedPort, '127.0.0.1');
    await once(server, 'listening');
    return server;
  }

  async function assertResourcesReleased() {
    const probe = await listenOnPort(port);
    await new Promise<void>((resolve) => {
      probe.close(() => resolve());
    });
    expect(
      (await fs.readdir(project)).filter((name) => name.startsWith('.vs-')),
    ).toEqual([]);
  }

  beforeAll(async () => {
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
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vsd-'));
    project = path.join(directory, 'project');
    await fs.mkdir(project);
    workerSocket = path.join(directory, 'browser.sock');
    daemonSocket = path.join(directory, 'build.sock');
    await Promise.all([
      file('first.md', '# First title\n\nFirst content.\n'),
      file('second.md', '# Second title\n\nSecond content.\n'),
    ]);
    const probe = await listenOnPort(0);
    port = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => {
      probe.close(() => resolve());
    });
    viewer.listen(0, '127.0.0.1');
    await once(viewer, 'listening');
  });

  afterEach(async () => {
    for (const socket of sockets) {
      socket.destroy();
    }
    for (const child of children) {
      child.kill('SIGTERM');
    }
    const force = setTimeout(() => {
      for (const child of children) {
        child.kill('SIGKILL');
      }
    }, 15_000);
    try {
      await Promise.all(exits);
    } finally {
      clearTimeout(force);
      exits.clear();
      const closed = once(viewer, 'close');
      viewer.close();
      viewer.closeAllConnections();
      await closed;
      await fs.rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it('reuses Node and Chromium while reloading main configs and generating mixed outputs', async () => {
    const { daemon, worker } = await startServices();
    const first = await succeeded(
      build('first', ['first.md', '--title', 'First PDF', '--crop-marks']),
    );
    const firstPdf = await pdf('first');
    expect(firstPdf.getTitle()).toBe('First PDF');
    expect(firstPdf.getPage(0).getTrimBox()).not.toEqual(
      firstPdf.getPage(0).getMediaBox(),
    );

    await Promise.all([
      file('theme.css', 'p { color: black }'),
      file('index.html', '<!doctype html><title>Vite entry</title>'),
      fs.symlink('process-css.cjs', path.join(project, 'postcss.config.cjs')),
    ]);
    async function editConfig(edition: number, color: string) {
      await Promise.all([
        file(
          'book.config.mjs',
          `
          console.log('Config runtime', process.env.VS_BUILD_DAEMON_TEST, process.env.VS_TEST_LEAK);
          process.env.VS_TEST_LEAK = 'request-only';
          process.exitCode = 23;
          export default { entry: 'second.md', title: 'Edition ${edition}', theme: './theme.css' };
        `,
        ),
        file(
          'vite.config.mjs',
          `
          export default ({ command }) => {
            console.log('Vite config edition ${edition}', command);
            return { build: { write: false } };
          };
        `,
        ),
        file(
          'process-css.cjs',
          `
          console.log('PostCSS config edition ${edition}');
          module.exports = { plugins: [{
            postcssPlugin: 'edition-color',
            Root(root) { root.walkDecls('color', decl => { decl.value = '${color}'; }); }
          }] };
        `,
        ),
      ]);
    }
    for (const [edition, color] of [
      [1, 'red'],
      [2, 'blue'],
    ] as const) {
      await editConfig(edition, color);
      const name = `edition-${edition}`;
      const result = await succeeded(
        build(name, [
          '--config',
          'book.config.mjs',
          '-o',
          `${name}.epub`,
          '-o',
          `${name}-web`,
          '-f',
          'webpub',
        ]),
      );
      expect(result).toMatchObject({
        executor: first.executor,
        browser: first.browser,
      });
      expect(result.output).toContain('Config runtime service undefined');
      expect(result.output).toContain(`Vite config edition ${edition} build`);
      expect(result.output).toContain(`PostCSS config edition ${edition}`);
      expect((await pdf(name)).getTitle()).toBe(`Edition ${edition}`);
      await expect(
        fs.stat(path.join(project, `${name}.epub`)),
      ).resolves.toBeDefined();
      const web = path.join(project, `${name}-web`);
      await expect(
        fs.stat(path.join(web, 'publication.json')),
      ).resolves.toBeDefined();
      await expect(
        fs.readFile(path.join(web, 'theme.css'), 'utf8'),
      ).resolves.toContain(`color: ${color}`);
      await assertResourcesReleased();
    }

    await file(
      'failed.mjs',
      "process.chdir('..'); throw new Error('Controlled config failure');",
    );
    const failed = await build('failed', ['--config', 'failed.mjs']).exit;
    expect(failed).toMatchObject({
      code: 1,
      output: expect.stringContaining('Controlled config failure'),
    });
    await expect(
      fs.stat(path.join(project, 'failed.pdf')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    const last = await succeeded(
      build('after-failure', ['--config', 'book.config.mjs']),
    );
    expect(last).toMatchObject({
      executor: first.executor,
      browser: first.browser,
    });
    expect(last.output).toContain('Config runtime service undefined');
    await shutdown(daemon);
    expect(() => process.kill(first.executor, 0)).toThrow(/ESRCH/v);
    await expect(fs.stat(daemonSocket)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(process.kill(first.browser, 0)).toBe(true);
    await shutdown(worker);
  }, 90_000);

  it('serializes overlapping jobs and drains cancellation, disconnect, and shutdown', async () => {
    const { daemon, worker } = await startServices();
    const active = await hold('active');
    const cancelled = build('cancel-queued');
    await cancelled.waitFor(waiting);
    await file(
      'next.mjs',
      `
      import { appendFileSync } from 'node:fs';
      appendFileSync('order', 'next\\n');
      export default { entry: 'first.md' };
    `,
    );
    await file(
      'last.mjs',
      `
      import { appendFileSync } from 'node:fs';
      appendFileSync('order', 'last\\n');
      export default { entry: 'second.md' };
    `,
    );
    const next = build('next', ['--config', 'next.mjs']);
    await next.waitFor(waiting);
    const last = build('last', ['--config', 'last.mjs']);
    await last.waitFor(waiting);
    const disconnected = raw();
    disconnected.connection.send(
      request(flags('disconnected-queued').concat('first.md')),
    );
    await expect(disconnected.connection.readMessage()).resolves.toEqual({
      type: 'queued',
    });
    disconnected.socket.destroy();
    await expect(fs.stat(path.join(project, 'order'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    cancelled.child.kill('SIGINT');
    expect(await cancelled.exit).toMatchObject({ code: 130 });
    active.child.kill('SIGINT');
    expect(await active.exit).toMatchObject({ code: 130 });
    const pids = await succeeded(next);
    expect(await succeeded(last)).toMatchObject({
      executor: pids.executor,
      browser: pids.browser,
    });
    expect(await fs.readFile(path.join(project, 'order'), 'utf8')).toBe(
      'next\nlast\n',
    );

    const dropped = await hold('disconnected-active');
    const after = build('after-disconnect');
    await after.waitFor(waiting);
    dropped.child.kill('SIGKILL');
    expect(await dropped.exit).toMatchObject({ signal: 'SIGKILL' });
    expect(await succeeded(after)).toMatchObject({
      executor: pids.executor,
      browser: pids.browser,
    });
    await assertResourcesReleased();

    const stopping = await hold('shutdown-active');
    const queued = build('shutdown-queued');
    await queued.waitFor(waiting);
    await shutdown(daemon);
    for (const job of [stopping, queued]) {
      expect(await job.exit).toMatchObject({
        code: 1,
        output: expect.stringContaining('Build daemon is shutting down'),
      });
    }
    for (const name of [
      'active',
      'cancel-queued',
      'disconnected-queued',
      'disconnected-active',
      'shutdown-active',
      'shutdown-queued',
    ]) {
      await expect(
        fs.stat(path.join(project, `${name}.pdf`)),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    }
    expect(() => process.kill(pids.executor, 0)).toThrow(/ESRCH/v);
    expect(process.kill(pids.browser, 0)).toBe(true);
    await expect(fs.stat(daemonSocket)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await assertResourcesReleased();
    const independent = await start([
      'build',
      '--browser-worker',
      workerSocket,
      ...flags('after-shutdown'),
      'first.md',
    ]).exit;
    expect(independent).toMatchObject({
      code: 0,
      output: expect.stringContaining(`PDF browser pid=${pids.browser} `),
    });
    await shutdown(worker);
    await expect(fs.stat(workerSocket)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }, 90_000);

  it('recycles a stalled executor with descendants and recovers from a subsequent crash', async () => {
    await startServices();
    const first = await succeeded(build('before-stall'));
    await file(
      'descendant.mjs',
      `
      import { writeFileSync } from 'node:fs';
      writeFileSync('descendant.pid', String(process.pid));
      setInterval(() => {}, 1000);
    `,
    );
    await file(
      'stalled.mjs',
      `
      import { spawn } from 'node:child_process';
      import { appendFileSync } from 'node:fs';
      appendFileSync('attempts', 'stalled\\n');
      spawn(process.execPath, ['descendant.mjs']);
      await new Promise(() => {});
      export default { entry: 'first.md' };
    `,
    );
    const { connection } = raw();
    connection.send(
      request(flags('stalled').concat('--config', 'stalled.mjs')),
    );
    await expect(connection.readMessage()).resolves.toEqual({
      type: 'started',
      pid: first.executor,
    });
    const descendant = await vi.waitFor(
      () =>
        fs.readFile(path.join(project, 'descendant.pid'), 'utf8').then(Number),
      waitOptions,
    );
    const next = build('after-stall');
    await next.waitFor(waiting);
    connection.send({ type: 'cancel' });
    await expect(
      readUntil(connection, (reply) => reply.type === 'result'),
    ).resolves.toMatchObject({
      error: expect.stringContaining('exceeded its shutdown grace period'),
    });
    const replacement = await succeeded(next);
    expect(replacement.executor).not.toBe(first.executor);
    expect(replacement.browser).toBe(first.browser);
    const processes = execFileSync(
      '/bin/ps',
      ['-A', '-o', 'pid=', '-o', 'stat='],
      { encoding: 'utf8' },
    );
    expect(processes).not.toMatch(
      new RegExp(`^\\s*${descendant}\\s+[^Z\\s]`, 'mv'),
    );
    expect(await fs.readFile(path.join(project, 'attempts'), 'utf8')).toBe(
      'stalled\n',
    );
    await expect(
      fs.stat(path.join(project, 'stalled.pdf')),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    await file('crash.mjs', 'process.exit(17);');
    const crash = await build('crash', ['--config', 'crash.mjs']).exit;
    expect(crash).toMatchObject({
      code: 1,
      output: expect.stringContaining('executor exited (17)'),
    });
    const recovered = await succeeded(build('after-crash'));
    expect(recovered.executor).not.toBe(replacement.executor);
    expect(recovered.browser).toBe(first.browser);
    await assertResourcesReleased();
  }, 90_000);

  it('validates socket paths, project directory, protocol, and worker constraints', async () => {
    const workerArgs = ['--browser-worker', workerSocket];
    const daemonArgs = ['build-daemon', '--socket'];
    const relative = await start([
      ...daemonArgs,
      'relative.sock',
      ...workerArgs,
    ]).exit;
    expect(relative).toMatchObject({
      code: 1,
      output: expect.stringContaining('must be an absolute file path'),
    });
    const unsafeDirectory = path.join(directory, 'unsafe');
    await fs.mkdir(unsafeDirectory);
    await fs.chmod(unsafeDirectory, 0o755);
    const unsafe = await start([
      ...daemonArgs,
      path.join(unsafeDirectory, 'build.sock'),
      ...workerArgs,
    ]).exit;
    expect(unsafe).toMatchObject({
      code: 1,
      output: expect.stringContaining('accessible only to its owner'),
    });
    const unsafeClient = await start([
      'build',
      '--build-daemon',
      path.join(unsafeDirectory, 'build.sock'),
      'first.md',
    ]).exit;
    expect(unsafeClient).toMatchObject({
      code: 1,
      output: expect.stringContaining('accessible only to its owner'),
    });
    await fs.writeFile(daemonSocket, 'existing file');
    const existing = await start([...daemonArgs, daemonSocket, ...workerArgs])
      .exit;
    expect(existing).toMatchObject({
      code: 1,
      output: expect.stringContaining('socket path already exists'),
    });
    await expect(fs.readFile(daemonSocket, 'utf8')).resolves.toBe(
      'existing file',
    );
    await fs.unlink(daemonSocket);

    await startServices();
    expect((await fs.lstat(daemonSocket)).mode & 0o777).toBe(0o600);
    const wrongDirectory = await build(
      'wrong-directory',
      ['first.md'],
      directory,
    ).exit;
    expect(wrongDirectory).toMatchObject({
      code: 1,
      output: expect.stringContaining('must run from its project directory'),
    });
    const conflicting = await build('conflicting', [...workerArgs, 'first.md'])
      .exit;
    expect(conflicting).toMatchObject({
      code: 1,
      output: expect.stringContaining('mutually exclusive'),
    });
    const docker = await build('docker', [
      '--render-mode',
      'docker',
      'first.md',
    ]).exit;
    expect(docker).toMatchObject({
      code: 1,
      output: expect.stringContaining('cannot be used with Docker'),
    });
    const firefox = await build('firefox', ['--browser', 'firefox', 'first.md'])
      .exit;
    expect(firefox).toMatchObject({
      code: 1,
      output: expect.stringContaining('Firefox is unsupported'),
    });

    const incompatible = raw();
    incompatible.connection.send({ ...request([]), version: 0 });
    await expect(incompatible.connection.readMessage()).resolves.toMatchObject({
      type: 'result',
      error: expect.stringContaining('Incompatible build daemon protocol'),
    });
    const malformed = raw();
    malformed.connection.send({ ...request([]), args: [42] });
    await expect(malformed.connection.readMessage()).resolves.toMatchObject({
      type: 'result',
      error: expect.stringContaining('Expected string'),
    });
    const invalidFrame = raw();
    invalidFrame.socket.write(Buffer.alloc(4));
    await expect(invalidFrame.connection.readMessage()).resolves.toMatchObject({
      type: 'result',
      error: expect.stringContaining('invalid frame length'),
    });
    const invalidArguments = raw();
    invalidArguments.connection.send(request(['--unknown-build-option']));
    await expect(
      readUntil(
        invalidArguments.connection,
        (reply) => reply.type === 'result',
      ),
    ).resolves.toMatchObject({
      error: expect.stringContaining('unknown option'),
    });

    const alias = path.join(directory, 'project-alias');
    await fs.symlink(project, alias, 'dir');
    await succeeded(build('canonical-directory', ['first.md'], alias));
  }, 60_000);
});
