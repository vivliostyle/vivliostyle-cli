import { execFileSync } from 'node:child_process';
import path from 'node:path';
import upath from 'upath';

/**
 * Helpers for the case where vivliostyle-cli runs on Windows-native Node.js
 * but the docker daemon is upstream moby inside a WSL distro (for example,
 * apt-installed Docker Engine on Ubuntu, bridged to Windows by WinSocat).
 *
 * Plain `renderMode: 'docker'` does not work in that setup for two reasons:
 *
 *   1. `host.docker.internal:host-gateway` resolves to the WSL VM's docker0,
 *      not the Windows host where Vite is running. Override
 *      `renderMode.hostGateway` with an IP that reaches the Windows host.
 *   2. The bind-mount sources are absolute Windows paths (`C:\Users\...`),
 *      which upstream dockerd cannot parse. Translate them to drvfs
 *      automount form (`/mnt/c/Users/...`) via `renderMode.pathTransformer`.
 *
 * `wslNatRenderMode()` and `wslMirroredRenderMode()` return the settings
 * that work for each WSL networking mode. Spread the result into a
 * `renderMode` literal at the use site:
 *
 * ```ts
 * import { wslNatRenderMode } from '@vivliostyle/cli';
 * export default {
 *   output: [{
 *     path: 'output.pdf',
 *     renderMode: process.platform === 'win32'
 *       ? { mode: 'docker', ...wslNatRenderMode() }
 *       : 'docker',
 *   }],
 * };
 * ```
 *
 * You also need to open the host-side firewall once. The commands below
 * persist across reboots (`New-NetFirewallRule` writes to `PersistentStore`
 * by default; `Set-NetFirewallHyperVVMSetting` updates both
 * `PersistentStore` and `ActiveStore`). Pass `-PolicyStore ActiveStore`
 * to limit the change to the current session.
 *
 * --- NAT mode (`networkingMode=nat`, the WSL default) ---
 * Use `wslNatRenderMode()`. The WSL VM has its own subnet; its eth0 default
 * gateway points at the Windows host, and `getWslHostIp()` resolves that IP
 * at config-evaluation time.
 *
 * Allow inbound on the `vEthernet (WSL)` interface from an elevated
 * PowerShell:
 *
 * ```powershell
 * New-NetFirewallRule -DisplayName "Vivliostyle dev server (WSL)" `
 *   -Direction Inbound `
 *   -InterfaceAlias "vEthernet (WSL (Hyper-V firewall))" `
 *   -Protocol TCP -Action Allow
 * ```
 *
 * The exact interface alias varies by Windows build; check it with
 * `Get-NetIPAddress -AddressFamily IPv4`.
 *
 * --- Mirrored mode (`networkingMode=mirrored`) ---
 * Use `wslMirroredRenderMode()`. The WSL VM shares Windows network
 * interfaces, so the WSL TCP stack intercepts the shared IPs and a
 * default-bridged container has no IP it can use to reach Windows. The
 * preset works around this by putting the container in the WSL VM netns
 * via `--network=host` and reaching Windows over the localhost forwarder.
 *
 * Mirrored Windows-to-WSL traffic goes through the Hyper-V firewall, which
 * blocks inbound by default. From an elevated PowerShell:
 *
 * ```powershell
 * Set-NetFirewallHyperVVMSetting `
 *   -Name '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' `
 *   -DefaultInboundAction Allow
 * ```
 *
 * `{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}` is the WSL VM identifier
 * (`c_wslFirewallVmCreatorId` in microsoft/WSL).
 */

/**
 * Translate a Windows drive-letter absolute path to its WSL drvfs automount
 * counterpart (`/mnt/<drive>/...`). Useful as `renderMode.pathTransformer`
 * when the docker daemon is upstream moby running inside a WSL distro.
 *
 * Operating contract:
 *   The input is expected to be an absolute path produced by `upath.resolve()`
 *   (the canonical resolver used in `src/config/resolve.ts` for `workspaceDir`,
 *   `target.path`, etc.). Under that contract the input is one of:
 *     - POSIX absolute (`/foo/bar`) on Linux/macOS hosts: passed through
 *     - Drive-letter + forward slash (`C:/Users/foo`) on Windows hosts: translated
 *
 *   Drive-letter + backslash (`C:\Users\foo`) is handled defensively for paths
 *   that bypass `upath`. Anything else (relative paths, UNC `\\server\share\...`,
 *   empty input) violates the contract and throws.
 */
export function wslPathTransformer(hostPath: string): string {
  const { root } = path.win32.parse(hostPath);

  if (root === '/') return hostPath;

  if (root.length === 3 && root[1] === ':') {
    return `/mnt/${root[0].toLowerCase()}/${upath.toUnix(hostPath.slice(root.length))}`;
  }

  throw new Error(
    `wslPathTransformer: expected absolute path from upath.resolve(), ` +
      `got ${JSON.stringify(hostPath)} (parsed root: ${JSON.stringify(root)}). ` +
      `UNC, relative, and non-standard paths are out of scope; supply a custom ` +
      `\`renderMode.pathTransformer\` to handle them.`,
  );
}

/**
 * Returns the IP at which the Windows host is reachable from inside WSL
 * (the default gateway of WSL's eth0). Useful as `renderMode.hostGateway`
 * for the NAT networking mode (the WSL default).
 *
 * Windows host only. Caller is responsible for gating on `process.platform`.
 */
export function getWslHostIp(): string {
  const out = execFileSync('wsl', ['--', 'ip', 'route', 'show', 'default'], {
    encoding: 'utf8',
  });
  const m = /default via (\S+)/.exec(out);
  if (!m) {
    throw new Error(
      `getWslHostIp: failed to parse WSL default gateway from: ${out.trim()}`,
    );
  }
  return m[1];
}

/**
 * `renderMode` fields (without `mode`) for the WSL hybrid + NAT networking
 * case. Spread into a `renderMode` literal:
 *
 * ```ts
 * renderMode: { mode: 'docker', ...wslNatRenderMode() }
 * ```
 *
 * It's a function so `getWslHostIp()` runs at the call site; the WSL default
 * gateway can change across VM restarts.
 */
export function wslNatRenderMode() {
  return {
    hostGateway: getWslHostIp(),
    pathTransformer: wslPathTransformer,
  };
}

/**
 * `renderMode` fields (without `mode`) for the WSL hybrid + mirrored
 * networking case. Spread into a `renderMode` literal:
 *
 * ```ts
 * renderMode: { mode: 'docker', ...wslMirroredRenderMode() }
 * ```
 *
 * The values are static; this is a function only to mirror
 * `wslNatRenderMode`'s shape.
 */
export function wslMirroredRenderMode() {
  return {
    hostGateway: '127.0.0.1' as const,
    pathTransformer: wslPathTransformer,
    extraRunArgs: ['--network=host'] as const,
  };
}
