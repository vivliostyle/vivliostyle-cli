import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfOutput, ResolvedTaskConfig } from '../src/config/resolve.js';
import type { ParsedVivliostyleInlineConfig } from '../src/config/schema.js';
import {
  CONTAINER_LOCAL_HOSTNAME,
  CONTAINER_ROOT_DIR,
} from '../src/constants.js';

const tinyexecMock = vi.hoisted(() => {
  const x = vi.fn(async function* docker() {
    // no output; tinyexec proc is async-iterable
  });
  return { x };
});
vi.mock('tinyexec', () => tinyexecMock);

const commandExistsMock = vi.hoisted(() => ({
  default: vi.fn().mockResolvedValue(true),
}));
vi.mock('command-exists', () => commandExistsMock);

const utilExecMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ stdout: '24.0.0', stderr: '' }),
);
vi.mock('../src/util.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/util.js')>();
  return { ...actual, exec: utilExecMock };
});

const { buildPDFWithContainer } = await import('../src/container.js');

const fabricateConfig = (
  overrides: Partial<ResolvedTaskConfig> = {},
): ResolvedTaskConfig =>
  ({
    rootUrl: 'http://localhost:13000',
    base: '/vivliostyle/',
    workspaceDir: '/workspace',
    serverRootDir: '/workspace',
    image: 'ghcr.io/vivliostyle/cli:test',
    viewerInput: {
      type: 'webbook',
      webbookEntryUrl: 'http://localhost:13000/vivliostyle/index.html',
      webbookPath: undefined,
    },
    ...overrides,
  }) as unknown as ResolvedTaskConfig;

const fabricateTarget = (overrides: Partial<PdfOutput> = {}): PdfOutput => ({
  format: 'pdf',
  path: '/workspace/out/test.pdf',
  renderMode: {
    mode: 'docker',
    hostGateway: undefined,
    pathTransformer: undefined,
    extraRunArgs: undefined,
  },
  preflight: undefined,
  preflightOption: [],
  cmyk: false,
  replaceImage: [],
  ...overrides,
});

const lastDockerArgs = (): string[] => {
  const calls = tinyexecMock.x.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const lastCall = calls[calls.length - 1] as unknown as [string, string[]];
  expect(lastCall[0]).toBe('docker');
  return lastCall[1];
};

const envFromArgs = (args: string[]): Record<string, string> => {
  const env: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-e' && i + 1 < args.length) {
      const [k, ...rest] = args[i + 1].split('=');
      env[k] = rest.join('=');
    }
  }
  return env;
};

const volumesFromArgs = (
  args: string[],
): { host: string; container: string }[] => {
  const mounts: { host: string; container: string }[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-v' && i + 1 < args.length) {
      const [host, container] = args[i + 1].split(':');
      mounts.push({ host, container });
    }
  }
  return mounts;
};

beforeEach(() => {
  tinyexecMock.x.mockClear();
  utilExecMock.mockClear();
  commandExistsMock.default.mockClear();
});

describe('buildPDFWithContainer: HTTP source URL (server-startup path)', () => {
  it('passes --add-host=host.docker.internal:host-gateway so the alias resolves on raw Linux dockerd (incl. WSL)', async () => {
    await buildPDFWithContainer({
      target: fabricateTarget(),
      config: fabricateConfig(),
      inlineConfig: {} as ParsedVivliostyleInlineConfig,
    });

    const args = lastDockerArgs();
    const idx = args.indexOf('--add-host');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe(`${CONTAINER_LOCAL_HOSTNAME}:host-gateway`);
  });

  it('overrides --add-host gateway when renderMode.hostGateway is set', async () => {
    await buildPDFWithContainer({
      target: fabricateTarget({
        renderMode: {
          mode: 'docker',
          hostGateway: '172.21.112.1',
          pathTransformer: undefined,
          extraRunArgs: undefined,
        },
      }),
      config: fabricateConfig(),
      inlineConfig: {} as ParsedVivliostyleInlineConfig,
    });

    const args = lastDockerArgs();
    const idx = args.indexOf('--add-host');
    expect(args[idx + 1]).toBe(`${CONTAINER_LOCAL_HOSTNAME}:172.21.112.1`);
  });

  it('passes renderMode.extraRunArgs through verbatim before the image', async () => {
    await buildPDFWithContainer({
      target: fabricateTarget({
        renderMode: {
          mode: 'docker',
          hostGateway: '127.0.0.1',
          pathTransformer: undefined,
          extraRunArgs: ['--network=host', '--gpus=all'],
        },
      }),
      config: fabricateConfig(),
      inlineConfig: {} as ParsedVivliostyleInlineConfig,
    });

    const args = lastDockerArgs();
    const networkIdx = args.indexOf('--network=host');
    const gpusIdx = args.indexOf('--gpus=all');
    const imageIdx = args.indexOf('ghcr.io/vivliostyle/cli:test');
    expect(networkIdx).toBeGreaterThan(-1);
    expect(gpusIdx).toBe(networkIdx + 1);
    expect(imageIdx).toBeGreaterThan(gpusIdx);
  });

  it('applies renderMode.pathTransformer to the host side of -v bind mounts only', async () => {
    await buildPDFWithContainer({
      target: fabricateTarget({
        path: '/workspace/out/test.pdf',
        renderMode: {
          mode: 'docker',
          hostGateway: undefined,
          pathTransformer: (p) =>
            p.startsWith('/workspace') ? `/mnt/c${p}` : p,
          extraRunArgs: undefined,
        },
      }),
      config: fabricateConfig({ serverRootDir: '/workspace' }),
      inlineConfig: {} as ParsedVivliostyleInlineConfig,
    });

    const args = lastDockerArgs();
    const mounts = volumesFromArgs(args);
    expect(mounts.map((m) => m.host)).toEqual(
      expect.arrayContaining(['/mnt/c/workspace']),
    );
    // container side is unchanged
    const workspaceMount = mounts.find((m) => m.host === '/mnt/c/workspace');
    expect(workspaceMount?.container).toBe(`${CONTAINER_ROOT_DIR}/workspace`);
  });

  // Smoke test for the WSL+Win hybrid wiring: a single renderMode object
  // form should produce both --add-host pointing at the Windows host (not
  // the docker0 gateway, which here is the WSL VM) and -v paths translated
  // to /mnt/<drive>/.
  it('produces WSL+Win hybrid-ready args when renderMode.hostGateway and pathTransformer are both set', async () => {
    const { createWslPathTransformer } = await import('../src/wsl.js');
    await buildPDFWithContainer({
      target: fabricateTarget({
        path: 'C:/Users/me/work/out/test.pdf',
        renderMode: {
          mode: 'docker',
          hostGateway: '172.21.112.1',
          pathTransformer: createWslPathTransformer(),
          extraRunArgs: undefined,
        },
      }),
      config: fabricateConfig({ serverRootDir: 'C:/Users/me/work' }),
      inlineConfig: {} as ParsedVivliostyleInlineConfig,
    });

    const args = lastDockerArgs();

    // host.docker.internal must point at the Windows host IP, not host-gateway
    const idx = args.indexOf('--add-host');
    expect(args[idx + 1]).toBe(`${CONTAINER_LOCAL_HOSTNAME}:172.21.112.1`);

    // -v host paths must be /mnt/c/... (parsable by upstream dockerd in WSL),
    // while container paths stay in CONTAINER_ROOT_DIR namespace.
    // The output dir (work/out) is de-duplicated under serverRootDir (work)
    // by collectVolumeArgs, so a single mount covers both.
    const mounts = volumesFromArgs(args);
    expect(mounts).toEqual([
      {
        host: '/mnt/c/Users/me/work',
        container: `${CONTAINER_ROOT_DIR}/Users/me/work`,
      },
    ]);
  });

  it('rewrites the entry hostname to host.docker.internal so the in-container CLI can reach the host Vite', async () => {
    const config = fabricateConfig({
      viewerInput: {
        type: 'webbook',
        webbookEntryUrl: 'http://localhost:13000/vivliostyle/index.html',
        webbookPath: undefined,
      },
    });
    await buildPDFWithContainer({
      target: fabricateTarget(),
      config,
      inlineConfig: {} as ParsedVivliostyleInlineConfig,
    });

    const args = lastDockerArgs();
    const bypassed = JSON.parse(envFromArgs(args).VS_CLI_BUILD_PDF_OPTIONS);
    expect(bypassed.input).toEqual({
      format: 'webbook',
      entry: `http://${CONTAINER_LOCAL_HOSTNAME}:13000/vivliostyle/index.html`,
    });
    expect(bypassed.host).toBe(CONTAINER_LOCAL_HOSTNAME);
  });

  it('translates the output PDF path to the container path and mounts the output directory', async () => {
    const config = fabricateConfig();
    await buildPDFWithContainer({
      target: fabricateTarget({ path: '/elsewhere/dist/out.pdf' }),
      config,
      inlineConfig: {} as ParsedVivliostyleInlineConfig,
    });

    const args = lastDockerArgs();
    const bypassed = JSON.parse(envFromArgs(args).VS_CLI_BUILD_PDF_OPTIONS);
    expect(bypassed.output).toEqual([
      expect.objectContaining({
        path: `${CONTAINER_ROOT_DIR}/elsewhere/dist/out.pdf`,
      }),
    ]);
    expect(volumesFromArgs(args)).toEqual(
      expect.arrayContaining([
        {
          host: '/workspace',
          container: `${CONTAINER_ROOT_DIR}/workspace`,
        },
        {
          host: '/elsewhere/dist',
          container: `${CONTAINER_ROOT_DIR}/elsewhere/dist`,
        },
      ]),
    );
  });

  it('passes through external (non-host-Vite) HTTPS entries without hostname rewriting', async () => {
    const config = fabricateConfig({
      viewerInput: {
        type: 'webbook',
        webbookEntryUrl: 'https://example.com/book/index.html',
        webbookPath: undefined,
      },
    });
    await buildPDFWithContainer({
      target: fabricateTarget(),
      config,
      inlineConfig: {} as ParsedVivliostyleInlineConfig,
    });

    const args = lastDockerArgs();
    const bypassed = JSON.parse(envFromArgs(args).VS_CLI_BUILD_PDF_OPTIONS);
    expect(bypassed.input.entry).toBe('https://example.com/book/index.html');
  });
});

// These tests document the *current* behavior of the file:// + Docker
// combination. They are intentionally written to lock in observations rather
// than to assert that the path is correct; see notes.md for the design
// discussion. If/when the design changes (e.g. "render-mode docker requires
// HTTP serve" is made an explicit requirement), these tests should be updated
// or replaced with an explicit error-path assertion.
describe('buildPDFWithContainer: file:// source URL (disableServerStartup path)', () => {
  it('passes file:// entry URLs through unchanged, without toContainerPath translation', async () => {
    const config = fabricateConfig({
      viewerInput: {
        type: 'webbook',
        webbookEntryUrl: 'file:///abs/manuscript/index.html',
        webbookPath: '/abs/manuscript/index.html',
      },
    });
    await buildPDFWithContainer({
      target: fabricateTarget(),
      config,
      inlineConfig: {
        disableServerStartup: true,
      } as ParsedVivliostyleInlineConfig,
    });

    const args = lastDockerArgs();
    const bypassed = JSON.parse(envFromArgs(args).VS_CLI_BUILD_PDF_OPTIONS);
    // The host-side path leaks into the container as-is. Inside the container
    // the file is served at /data/abs/manuscript/index.html (toContainerPath
    // mapping), so this URL will not resolve unless the in-container CLI
    // happens to translate it, which it currently does not.
    expect(bypassed.input).toEqual({
      format: 'webbook',
      entry: 'file:///abs/manuscript/index.html',
    });
  });

  it('does not auto-mount the directory containing a file:// entry; only serverRootDir and the output dir are mounted', async () => {
    const config = fabricateConfig({
      serverRootDir: '/workspace',
      viewerInput: {
        type: 'webbook',
        webbookEntryUrl: 'file:///elsewhere/manuscript/index.html',
        webbookPath: '/elsewhere/manuscript/index.html',
      },
    });
    await buildPDFWithContainer({
      target: fabricateTarget({ path: '/workspace/out/test.pdf' }),
      config,
      inlineConfig: {
        disableServerStartup: true,
      } as ParsedVivliostyleInlineConfig,
    });

    const args = lastDockerArgs();
    const mounts = volumesFromArgs(args);
    // /workspace/out is de-duplicated because /workspace already covers it
    // (collectVolumeArgs drops paths whose parent is also a mount).
    expect(mounts.map((m) => m.host)).toEqual(['/workspace']);
    // The manuscript's directory is NOT mounted; even if the in-container
    // CLI translated the file:// URL to its container path, the file would
    // not exist there.
    expect(
      mounts.find((m) => m.host === '/elsewhere/manuscript'),
    ).toBeUndefined();
  });
});
