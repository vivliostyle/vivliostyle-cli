import net from 'node:net';

import {
  type ExecResult,
  GenericContainer,
  getContainerRuntimeClient,
  ImageName,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';

const IMAGE_ENV = 'VIVLIOSTYLE_CLI_IMAGE';

// The Docker contract suite verifies an already-built image rather than building
// one (testcontainers cannot pass `--allow security.insecure`, which the slim
// build needs). The image must therefore be named explicitly, like the original
// shell contract's `IMAGE=` variable -- there is deliberately no default, so a run
// can never silently target a stale published image.
export function imageRef(): string {
  const ref = process.env[IMAGE_ENV];
  if (!ref) {
    throw new Error(
      `${IMAGE_ENV} must name the image under test, e.g.\n` +
        `  ${IMAGE_ENV}=localhost:5000/vivliostyle/cli:latest pnpm test:docker`,
    );
  }
  return ref;
}

// The subset of the image's Config that the metadata checks inspect, named as in
// `docker inspect`. Returned in place of dockerode's ImageInspectInfo so this
// module's public surface does not depend on a transitive @types/dockerode (which
// `declaration: true` would otherwise force callers to be able to name).
export type ImageConfig = {
  Entrypoint: string[];
  User: string;
  WorkingDir: string;
  Env: string[];
};

// Docker reports Entrypoint as either a string or a string[] (dockerode types it
// as the union); normalize both -- and a missing value -- to an array.
function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

// Inspect the image config without running it -- the metadata checks are about
// the image as shipped, not a live container.
export async function inspectImageConfig(): Promise<ImageConfig> {
  const client = await getContainerRuntimeClient();
  const { Config } = await client.image.inspect(
    ImageName.fromString(imageRef()),
  );
  return {
    Entrypoint: toArray(Config.Entrypoint),
    User: Config.User ?? '',
    WorkingDir: Config.WorkingDir ?? '',
    Env: toArray(Config.Env),
  };
}

// The shipped image's ENTRYPOINT is `vivliostyle`, so a plain run exits as soon as
// the CLI finishes. The contract checks instead want a live container to `exec`
// into, mirroring the original shell contract's `docker run ... sh -c`. Overriding
// the entrypoint with a parked shell keeps the container up; the image's default
// user (vivliostyle) is preserved, so execs run unprivileged unless a check opts
// into `{ user: 'root' }`.
const READY = '__vivliostyle_contract_ready__';

// Returns the unstarted builder so a check can layer on bind mounts, a run user,
// etc. before `.start()`.
export function shellContainer(): GenericContainer {
  return new GenericContainer(imageRef())
    .withEntrypoint(['sh', '-c', `echo ${READY}; exec sleep infinity`])
    .withWaitStrategy(Wait.forLogMessage(READY));
}

// Run `sh -c <script>` inside a started container. Returns the full ExecResult
// ({ output, stdout, stderr, exitCode }) so checks assert on the exit code and
// inspect output, rather than throwing on a non-zero exit.
export function sh(
  container: StartedTestContainer,
  script: string,
  opts?: { user?: string },
): Promise<ExecResult> {
  return container.exec(
    ['sh', '-c', script],
    opts?.user === undefined ? undefined : { user: opts.user },
  );
}

// Start a parked container, hand it to `fn`, and always stop it afterwards. For
// checks that need their own container rather than the file's shared one.
export async function withShell<T>(
  fn: (container: StartedTestContainer) => Promise<T>,
): Promise<T> {
  const container = await shellContainer().start();
  try {
    return await fn(container);
  } finally {
    await container.stop();
  }
}

// Some checks genuinely need the network: they install @vivliostyle/cli from the
// npm registry, download a non-bundled browser, or apt-get inside the container.
// Mocking those would gut the contract (the point is that real installs/downloads
// work), so they run against the real network -- but a registry/mirror outage is
// an infrastructure failure, not a broken image. A check guards on reachability
// and skips (not fails) when the endpoint is down, keeping infra noise out of the
// verdict.

// Resolve true if a TCP connection to host:port completes within timeoutMs.
export function reachable(
  host: string,
  port: number,
  timeoutMs = 5000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const settle = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

// Skip the current test (via the vitest task context's `skip`) when `host:port`
// is unreachable, annotating it as an infra skip rather than a contract failure.
export async function skipUnlessReachable(
  ctx: { skip: (note?: string) => void },
  host: string,
  port = 443,
): Promise<void> {
  if (!(await reachable(host, port))) {
    ctx.skip(
      `network preflight failed: ${host}:${port} unreachable -- skipping (infrastructure, not a contract failure)`,
    );
  }
}
