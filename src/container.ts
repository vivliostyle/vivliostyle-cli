import execa from 'execa';
import { promises as fs } from 'fs';
import isInteractive from 'is-interactive';
import process from 'process';
import path from 'upath';
import { cliVersion } from './const';
import { debug, startLogging, stopLogging } from './util';

export const CONTAINER_IMAGE = `ghcr.io/vivliostyle/cli:${cliVersion}`;
export const CONTAINER_ROOT_DIR = '/data';

export function toContainerPath(absPath: string): string {
  return path.posix.join(
    CONTAINER_ROOT_DIR,
    path.toUnix(absPath).replace(/^\w:/, ''),
  );
}

export function collectVolumeArgs(mountPoints: string[]): string[] {
  return mountPoints
    .filter((p, i, array) => {
      if (i !== array.indexOf(p)) {
        // duplicated path
        return false;
      }
      let parent = p;
      while (parent !== path.dirname(parent)) {
        parent = path.dirname(parent);
        if (array.includes(parent)) {
          // other mount point contains its directory
          return false;
        }
      }
      return true;
    })
    .map((p) => `${p}:${toContainerPath(p)}`);
}

export async function checkContainerEnvironment(): Promise<boolean> {
  try {
    return !!(await fs.stat('/opt/vivliostyle-cli/.vs-cli-version'));
  } catch {
    // not exist
    return false;
  }
}

export async function runContainer({
  image,
  userVolumeArgs,
  commandArgs,
  entrypoint,
}: {
  image: string;
  userVolumeArgs: string[];
  commandArgs: string[];
  entrypoint?: string;
}): Promise<execa.ExecaReturnValue> {
  stopLogging('Launching docker container', '📦');
  const args = [
    'run',
    ...(isInteractive() ? ['-it'] : []),
    '--rm',
    ...(entrypoint ? ['--entrypoint', entrypoint] : []),
    ...(process.env.DEBUG
      ? ['-e', `DEBUG=${process.env.DEBUG}`] // escape seems to work well
      : []),
    ...userVolumeArgs.flatMap((arg) => ['-v', arg]),
    image,
    ...commandArgs,
  ];
  debug(`docker ${args.join(' ')}`);
  const proc = execa('docker', args, {
    stdio: 'inherit',
  });
  proc.stdout?.pipe(process.stdout);
  proc.stderr?.pipe(process.stderr);
  const ret = await proc;
  startLogging();
  return ret;
}
