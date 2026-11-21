import {
  execFileSync,
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
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

  function start(
    args: string[],
    cwd = project,
    inspection?: {
      env: NodeJS.ProcessEnv;
      substitute?: ChildProcessWithoutNullStreams;
    },
  ) {
    const substitute = inspection?.substitute;
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env: {
        ...process.env,
        DEBUG: 'vs-cli,vs-cli:pdf-timing',
        TMPDIR: directory,
        VS_BUILD_DAEMON_TEST: args[0] === 'build-daemon' ? 'service' : 'client',
        ...inspection?.env,
      },
      stdio: [
        'ignore',
        'pipe',
        'pipe',
        ...(substitute
          ? [substitute.stdin, substitute.stdout, substitute.stderr]
          : []),
      ],
    });
    children.add(child);
    let output = '';
    const collect = (chunk: string) => {
      output += chunk;
    };
    child.stdout?.setEncoding('utf8').on('data', collect);
    child.stderr?.setEncoding('utf8').on('data', collect);
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

  async function startServices(
    inspection?: Awaited<ReturnType<typeof mockProcessInspection>>,
  ) {
    const worker = start(['build-worker', '--socket', workerSocket]);
    await worker.waitFor(/Browser worker ready at /v);
    const daemon = start(
      [
        'build-daemon',
        '--socket',
        daemonSocket,
        '--browser-worker',
        workerSocket,
      ],
      project,
      inspection,
    );
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

  async function executorDirectories() {
    return (await fs.readdir(directory))
      .filter((name) => name.startsWith('vivliostyle-executor-'))
      .map((name) => path.join(directory, name));
  }

  async function mockProcessInspection(mode: 'recover' | 'retain' | 'startup') {
    const preload = path.join(project, 'inspect.cjs');
    await fs.writeFile(
      preload,
      String.raw`
      const children = require('node:child_process');
      const { appendFileSync, existsSync } = require('node:fs');
      const { syncBuiltinESMExports } = require('node:module');
      const { Socket } = require('node:net');
      const executor = process.argv[1]?.endsWith('/build-daemon/internal-executor.js');
      const supervisor = process.argv[2] === 'build-daemon';
      const mode = process.env.VS_TEST_INSPECTION_MODE;
      const armed = () => existsSync('fail-inspection');
      const inspect = children.execFile;
      let failures = 0;
      children.execFile = (file, args, options, callback) => {
        if (args.includes('pgid=') && (executor || supervisor)) {
          appendFileSync('inspection.log', executor ? 'executor ps\n' : 'supervisor ps\n');
          if (supervisor && (mode === 'startup' || (mode === 'retain' && armed()))) {
            // The test owns the substitute so it can wait for its exit. The daemon
            // holds duplicates of the three actual stdio pipe endpoints.
            const stdin = new Socket({ fd: 3, readable: false, writable: true });
            const stdout = new Socket({ fd: 4, readable: true, writable: false });
            const stderr = new Socket({ fd: 5, readable: true, writable: false });
            stdout.resume();
            stderr.resume();
            return {
              stdin, stdout, stderr,
              kill(signal) {
                appendFileSync('inspection.log', 'substitute ' + signal + '\n');
                throw new Error('Simulated signalling failure');
              },
              unref() {
                const closed = [stdin, stdout, stderr].every((stream) => stream.destroyed);
                appendFileSync('inspection.log', 'substitute unref, stdio closed: ' + closed + '\n');
              },
            };
          }
          if (executor && armed()) {
            // Exercise retry handling first, then let a hung inspection consume
            // the balance of the current deadline.
            const script = ++failures <= 2 ? 'process.exit(1)' : 'setInterval(() => {}, 1000)';
            return inspect(process.execPath, ['-e', script], options, callback);
          }
        }
        return inspect(file, args, options, callback);
      };
      syncBuiltinESMExports();
      const kill = process.kill;
      process.kill = (pid, signal) => {
        if (supervisor && pid < 0 && armed()) {
          if (signal === 'SIGKILL') {
            appendFileSync('inspection.log', 'supervisor kill\n');
          } else if (signal === 0) {
            // Force the supervisor down the ps verification path on systems
            // that reap every member and make kill(0) return ESRCH immediately.
            return true;
          }
        }
        return kill(pid, signal);
      };
      `,
    );
    const substitute =
      mode === 'recover'
        ? undefined
        : spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    if (substitute) {
      children.add(substitute);
      exits.add(
        once(substitute, 'exit').then(() => {
          children.delete(substitute);
          substitute.stdin.destroy();
          substitute.stdout.destroy();
          substitute.stderr.destroy();
        }),
      );
    }
    return {
      env: {
        NODE_OPTIONS: `--require=${JSON.stringify(preload)}`,
        VS_TEST_INSPECTION_MODE: mode,
      },
      substitute,
    };
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
    if (process.env.BROWSER_PATH) {
      executablePath = process.env.BROWSER_PATH;
      return;
    }
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
      child.kill('SIGCONT');
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

  it('describes an isolated standalone session, reuses it, and cleans up on shutdown', async () => {
    await file(
      'vivliostyle.config.cjs',
      'throw new Error("wrong working directory");',
    );
    const daemon = start([
      'build-daemon',
      '--standalone',
      '--socket',
      daemonSocket,
    ]);
    await daemon.waitFor(/Build daemon ready at /v);
    expect((await fs.stat(daemonSocket)).mode & 0o777).toBe(0o600);

    const { connection } = raw();
    connection.send({ type: 'describe', version: buildProtocolVersion });
    const session = (await connection.readMessage()) as Extract<
      BuildReply,
      { type: 'session' }
    >;
    expect(session).toMatchObject({
      type: 'session',
      version: buildProtocolVersion,
      cliPath: await fs.realpath(cli),
    });
    expect(path.dirname(session.cwd)).toBe(await fs.realpath(directory));
    expect(session.cwd).not.toBe(await fs.realpath(project));

    const { connection: incompatible } = raw();
    incompatible.send({ type: 'describe', version: buildProtocolVersion + 1 });
    await expect(incompatible.readMessage()).resolves.toMatchObject({
      type: 'result',
      error: expect.stringContaining('Incompatible build daemon protocol'),
    });
    const source = path.join(project, 'first.md');
    const mismatch = await build('mismatch', [source]).exit;
    expect(mismatch.output).toContain(
      'Build daemon clients must run from its project directory',
    );

    const first = await succeeded(build('first', [source], session.cwd));
    const second = await succeeded(
      build('second', [path.join(project, 'second.md')], session.cwd),
    );
    expect(first.executor).toBe(second.executor);
    expect(first.browser).toBe(second.browser);
    for (const name of ['first', 'second']) {
      const rendered = await PDFDocument.load(
        await fs.readFile(path.join(session.cwd, `${name}.pdf`)),
      );
      expect(rendered.getPageCount()).toBeGreaterThan(0);
    }

    await shutdown(daemon);
    await expect(fs.stat(daemonSocket)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(fs.stat(session.cwd)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(() => process.kill(first.executor, 0)).toThrow(/ESRCH/v);
    expect(() => process.kill(first.browser, 0)).toThrow(/ESRCH/v);
  }, 30_000);

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
    expect(await executorDirectories()).toEqual([]);
    await expect(fs.stat(daemonSocket)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(process.kill(first.browser, 0)).toBe(true);
    await shutdown(worker);
  }, 90_000);

  it('reuses CommonJS loaders registered by cached plugins', async () => {
    await startServices();
    await file(
      'register-loader.cjs',
      `
      const { readFileSync } = require('node:fs');
      console.log('Registering book data loader');
      require.extensions['.book-data'] = (target, filename) => {
        target.exports = readFileSync(filename, 'utf8');
      };
      `,
    );
    async function buildWithTitle(name: string, title: string) {
      await file(`${name}.book-data`, title);
      await file(
        'book.config.mjs',
        `
        import { createRequire } from 'node:module';
        const require = createRequire(process.cwd() + '/book.config.mjs');
        require('./register-loader.cjs');
        export default { entry: 'first.md', title: require('./${name}.book-data') };
        `,
      );
      const result = await succeeded(
        build(name, ['--config', 'book.config.mjs']),
      );
      expect((await pdf(name)).getTitle()).toBe(title);
      return result;
    }
    const first = await buildWithTitle('first', 'First book title');
    const second = await buildWithTitle('second', 'Second book title');
    expect(first.output).toContain('Registering book data loader');
    expect(second.output).not.toContain('Registering book data loader');
    expect(second).toMatchObject({
      executor: first.executor,
      browser: first.browser,
    });
  }, 60_000);

  it('replaces the executor after a Vite config failure changes its CommonJS loaders', async () => {
    await startServices();
    const first = await succeeded(build('before-vite-failure'));
    const [temporary] = await executorDirectories();
    await file('vite.config.cjs', "throw new Error('Broken CommonJS config');");
    const failed = await build('vite-broken').exit;
    expect(failed).toMatchObject({
      code: 1,
      output: expect.stringContaining('Broken CommonJS config'),
    });
    expect(failed.output).toContain(
      `Build daemon executor pid=${first.executor}`,
    );
    await file('index.html', '<!doctype html><title>Vite entry</title>');
    await file(
      'vite.config.cjs',
      "module.exports = { marker: 'repaired', build: { write: false } };",
    );
    await file(
      'probe.mjs',
      `
      import { createRequire } from 'node:module';
      const require = createRequire(process.cwd() + '/probe.mjs');
      console.log('CommonJS config:', require('./vite.config.cjs').marker);
      export default { entry: 'first.md' };
    `,
    );
    const recovered = await succeeded(
      build('vite-repaired', ['--config', 'probe.mjs']),
    );
    expect(recovered.executor).not.toBe(first.executor);
    expect(recovered.browser).toBe(first.browser);
    expect(recovered.output).toContain('CommonJS config: repaired');
    expect(() => process.kill(first.executor, 0)).toThrow(/ESRCH/v);
    expect(await executorDirectories()).not.toContain(temporary);
  }, 60_000);

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
      'stalled-vite.mjs',
      `
      import { spawn } from 'node:child_process';
      import { appendFileSync } from 'node:fs';
      appendFileSync('attempts', 'stalled\\n');
      spawn(process.execPath, ['descendant.mjs']);
      await new Promise(() => {});
      export default {};
    `,
    );
    const { connection } = raw();
    connection.send(
      request(
        flags('stalled').concat(
          'https://example.invalid/document.html',
          '--vite-config-file',
          'stalled-vite.mjs',
        ),
      ),
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
    const [temporary] = await executorDirectories();
    expect((await fs.stat(temporary)).mode & 0o777).toBe(0o700);
    expect(await fs.readdir(temporary)).toEqual([
      expect.stringMatching(/^tmp-/v),
    ]);
    await file(
      'after-stall.mjs',
      `
      import { existsSync } from 'node:fs';
      console.log('Old temporary directory exists:', existsSync(${JSON.stringify(temporary)}));
      export default { entry: 'first.md' };
    `,
    );
    const next = build('after-stall', ['--config', 'after-stall.mjs']);
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
    expect(replacement.output).toContain(
      'Old temporary directory exists: false',
    );
    const [crashTemporary] = await executorDirectories();
    expect(crashTemporary).not.toBe(temporary);
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
    expect(await executorDirectories()).not.toContain(crashTemporary);
    await assertResourcesReleased();
  }, 90_000);

  it('bounds client cancellation when the daemon is paused', async () => {
    const { daemon } = await startServices();
    const active = await hold('paused');
    daemon.child.kill('SIGSTOP');
    try {
      const startTime = performance.now();
      active.child.kill('SIGINT');
      expect(await active.exit).toMatchObject({ code: 130 });
      const elapsed = performance.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(11_500);
      expect(elapsed).toBeLessThan(14_000);
    } finally {
      daemon.child.kill('SIGCONT');
    }
    await succeeded(build('after-resume'));
    await assertResourcesReleased();
  }, 60_000);

  it('rotates after 100 dispatches while preserving the Chromium worker', async () => {
    await startServices();
    const first = await succeeded(build('before-rotation'));
    const [originalTemporary] = await executorDirectories();

    const cancelled = await hold('rotation-cancelled');
    cancelled.child.kill('SIGINT');
    expect(await cancelled.exit).toMatchObject({
      code: 130,
      output: expect.stringContaining(
        `Build daemon executor pid=${first.executor}`,
      ),
    });
    for (let count = 3; count < 100; count++) {
      const { connection } = raw();
      connection.send(request(['--unknown-build-option']));
      await expect(connection.readMessage()).resolves.toEqual({
        type: 'started',
        pid: first.executor,
      });
      await expect(
        readUntil(connection, (reply) => reply.type === 'result'),
      ).resolves.toMatchObject({
        type: 'result',
        error: expect.stringContaining('unknown option'),
      });
    }

    expect(await succeeded(build('build-100'))).toMatchObject({
      executor: first.executor,
      browser: first.browser,
    });
    await vi.waitFor(async () => {
      expect(await executorDirectories()).toEqual([]);
      expect(() => process.kill(first.executor, 0)).toThrow(/ESRCH/v);
    }, waitOptions);
    const replacement = await succeeded(build('build-101'));
    expect(replacement.executor).not.toBe(first.executor);
    expect(replacement.browser).toBe(first.browser);
    expect(await executorDirectories()).not.toContain(originalTemporary);
    expect((await pdf('build-100')).getPageCount()).toBeGreaterThan(0);
    expect((await pdf('build-101')).getPageCount()).toBeGreaterThan(0);
  }, 90_000);

  async function assertInspectionSubstituteAlive(
    substitute: ChildProcess | undefined,
  ) {
    expect(substitute?.pid).toBeGreaterThan(0);
    expect(process.kill(Number(substitute?.pid), 0)).toBe(true);
    expect(substitute).toMatchObject({ exitCode: null, signalCode: null });
    const trace = await fs.readFile(
      path.join(project, 'inspection.log'),
      'utf8',
    );
    expect(trace).toContain(
      'substitute SIGKILL\nsubstitute unref, stdio closed: true\n',
    );
  }

  it('reports a startup inspection timeout and exits while the substitute ps is alive', async () => {
    const inspection = await mockProcessInspection('startup');
    const daemon = start(
      [
        'build-daemon',
        '--socket',
        daemonSocket,
        '--browser-worker',
        workerSocket,
      ],
      project,
      inspection,
    );
    await vi.waitFor(() => expect(daemon.child.exitCode).toBe(1), {
      timeout: 10_000,
      interval: 50,
    });
    const result = await daemon.exit;
    expect(result).toMatchObject({
      code: 1,
      output: expect.stringContaining(
        'requires ps with process-group inspection',
      ),
    });
    await assertInspectionSubstituteAlive(inspection.substitute);
    expect(result.output).not.toContain('Build daemon ready');
    expect(await executorDirectories()).toEqual([]);
    await expect(fs.stat(daemonSocket)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }, 20_000);

  async function queueDuringInspectionFailures(mode: 'recover' | 'retain') {
    const inspection = await mockProcessInspection(mode);
    const services = await startServices(inspection);
    const [temporary] = await executorDirectories();
    await fs.writeFile(path.join(temporary, 'scratch'), 'unfinished build');
    await file('fail-inspection', '');
    const job = raw();
    const startedAt = performance.now();
    job.connection.send(request(['--unknown-build-option']));
    const started = await job.connection.readMessage();
    expect(started).toMatchObject({ type: 'started', pid: expect.any(Number) });

    const { connection: next } = raw();
    next.send(request(['--unknown-build-option']));
    await expect(next.readMessage()).resolves.toEqual({ type: 'queued' });
    await expect(
      readUntil(job.connection, (reply) => reply.type === 'result'),
    ).resolves.toMatchObject({
      type: 'result',
      error: expect.stringContaining(
        'shutdown grace period while cleaning up descendants',
      ),
    });
    expect(performance.now() - startedAt).toBeLessThan(11_500);
    return {
      ...services,
      temporary,
      next,
      started,
      substitute: inspection.substitute,
    };
  }

  async function assertInspectionRetries() {
    const trace = await fs.readFile(
      path.join(project, 'inspection.log'),
      'utf8',
    );
    expect(trace.match(/executor ps/gv)?.length).toBeGreaterThan(2);
    expect(trace).toMatch(/supervisor kill\nsupervisor ps/v);
  }

  it('recovers from an inspection timeout after verifying the executor group stopped', async () => {
    const { temporary, next, started } =
      await queueDuringInspectionFailures('recover');
    const replacement = await next.readMessage();
    expect(replacement).toMatchObject({
      type: 'started',
      pid: expect.any(Number),
    });
    expect(replacement).not.toEqual(started);
    expect(await executorDirectories()).not.toContain(temporary);
    await fs.unlink(path.join(project, 'fail-inspection'));
    await expect(
      readUntil(next, (reply) => reply.type === 'result'),
    ).resolves.toMatchObject({
      type: 'result',
      error: expect.stringContaining('unknown option'),
    });
    await assertInspectionRetries();
    await succeeded(build('after-inspection-failure'));
  }, 35_000);

  it('stops the daemon and retains temporary files if verification after SIGKILL fails', async () => {
    const { daemon, worker, temporary, next, substitute } =
      await queueDuringInspectionFailures('retain');
    const diagnostic = 'Could not verify that build daemon executor group';
    const verifyingAt = performance.now();
    await expect(next.readMessage()).resolves.toMatchObject({
      type: 'result',
      error: expect.stringContaining(diagnostic),
    });
    expect(performance.now() - verifyingAt).toBeLessThan(2000);
    await vi.waitFor(() => expect(daemon.child.exitCode).toBe(1), {
      timeout: 3000,
      interval: 50,
    });
    expect(await daemon.exit).toMatchObject({
      code: 1,
      output: expect.stringContaining(diagnostic),
    });
    await assertInspectionSubstituteAlive(substitute);
    expect(await executorDirectories()).toEqual([temporary]);
    await expect(
      fs.readFile(path.join(temporary, 'scratch'), 'utf8'),
    ).resolves.toBe('unfinished build');
    await expect(fs.stat(daemonSocket)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(worker.child.exitCode).toBeNull();
    await assertInspectionRetries();
  }, 35_000);

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
