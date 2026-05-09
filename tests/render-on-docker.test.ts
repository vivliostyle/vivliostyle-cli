import { execFileSync } from 'node:child_process';
import { fileTypeFromFile } from 'file-type';
import { describe, expect, it } from 'vitest';
import { resolveFixture, runCommand } from './command-util.js';

const probe = (cmd: string, args: string[]): boolean => {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

const dockerAvailable = probe('docker', ['version']);

// Only one image is consulted: VIVLIOSTYLE_TEST_IMAGE if set, otherwise the
// latest published image. The image must already exist locally; we do not
// pull on demand, so CI without a pre-pulled image skips this suite.
const candidateImage =
  process.env.VIVLIOSTYLE_TEST_IMAGE || 'ghcr.io/vivliostyle/cli:latest';

const image =
  dockerAvailable && probe('docker', ['image', 'inspect', candidateImage])
    ? candidateImage
    : undefined;

// On the WSL+Win hybrid (CLI on Windows, dockerd in WSL), the default docker
// invocation can't work: Windows paths are unparseable by upstream dockerd,
// and host.docker.internal lands on the WSL VM rather than the Windows host.
// The basic test is expected to fail there, so we run it under `it.fails`.
// The two hybrid tests below cover the working configurations.
const enableHybridNat = process.env.VIVLIOSTYLE_TEST_WSL_HYBRID_NAT === '1';
const enableHybridMirrored =
  process.env.VIVLIOSTYLE_TEST_WSL_HYBRID_MIRRORED === '1';
const enableAnyHybrid = enableHybridNat || enableHybridMirrored;
const itBasic = enableAnyHybrid ? it.fails : it;

describe.skipIf(!image)(
  'render-mode docker (mirrors examples/render-on-docker/)',
  () => {
    itBasic(
      'produces a valid PDF for a markdown manuscript via docker render',
      async () => {
        await runCommand(
          [
            'build',
            '--render-mode',
            'docker',
            '--image',
            image!,
            '-o',
            '.vs-pdf/out.pdf',
            'manuscript.md',
          ],
          { cwd: resolveFixture('render-on-docker'), port: 23100 },
        );

        const type = await fileTypeFromFile(
          resolveFixture('render-on-docker/.vs-pdf/out.pdf'),
        );
        expect(type?.mime).toEqual('application/pdf');
      },
      240000,
    );
  },
);

// Win + WSL hybrid, NAT mode (the WSL default). The container reaches the
// Windows host through the WSL eth0 default gateway. Opt-in via env var; the
// host also needs a Defender Firewall rule allowing inbound on the
// vEthernet (WSL) interface.
describe.skipIf(!image || !enableHybridNat)(
  'render-mode docker (Win + WSL hybrid, networkingMode=nat)',
  () => {
    it('renders via { mode: "docker", ...wslNatRenderMode() }', async () => {
      const { wslNatRenderMode } = await import('../src/wsl.js');
      await runCommand(
        [
          'build',
          '--image',
          image!,
          '-o',
          '.vs-pdf/out-wsl-nat.pdf',
          'manuscript.md',
        ],
        {
          cwd: resolveFixture('render-on-docker'),
          port: 23101,
          config: {
            entry: 'manuscript.md',
            output: [
              {
                path: '.vs-pdf/out-wsl-nat.pdf',
                renderMode: { mode: 'docker', ...wslNatRenderMode() },
              },
            ],
          },
        },
      );

      const type = await fileTypeFromFile(
        resolveFixture('render-on-docker/.vs-pdf/out-wsl-nat.pdf'),
      );
      expect(type?.mime).toEqual('application/pdf');
    }, 240000);
  },
);

// Win + WSL hybrid, mirrored mode. The WSL VM shares Windows network
// interfaces, so the WSL TCP stack intercepts the shared IPs and a
// default-bridged container has no IP it can use to reach Windows. The fix
// is to put the container in the WSL VM netns (`--network=host`) and reach
// Windows over the localhost forwarder. Opt-in via env var; the host also
// needs the Hyper-V firewall set to allow inbound for the WSL VM.
describe.skipIf(!image || !enableHybridMirrored)(
  'render-mode docker (Win + WSL hybrid, networkingMode=mirrored)',
  () => {
    it('renders via { mode: "docker", ...wslMirroredRenderMode() }', async () => {
      const { wslMirroredRenderMode } = await import('../src/wsl.js');
      await runCommand(
        [
          'build',
          '--image',
          image!,
          '-o',
          '.vs-pdf/out-wsl-mirrored.pdf',
          'manuscript.md',
        ],
        {
          cwd: resolveFixture('render-on-docker'),
          port: 23102,
          config: {
            entry: 'manuscript.md',
            output: [
              {
                path: '.vs-pdf/out-wsl-mirrored.pdf',
                renderMode: { mode: 'docker', ...wslMirroredRenderMode() },
              },
            ],
          },
        },
      );

      const type = await fileTypeFromFile(
        resolveFixture('render-on-docker/.vs-pdf/out-wsl-mirrored.pdf'),
      );
      expect(type?.mime).toEqual('application/pdf');
    }, 240000);
  },
);
