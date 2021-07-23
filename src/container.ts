import execa from 'execa';
import { promises as fs } from 'fs';
import process from 'process';
import path from 'upath';

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
  userVolumeArgs,
  commandArgs,
}: {
  userVolumeArgs: string[];
  commandArgs: string[];
}): Promise<execa.ExecaReturnValue> {
  execa;
  const proc = execa('docker', [
    'run',
    '--rm',
    ...(process.env.DEBUG
      ? ['-e', `DEBUG=${process.env.DEBUG}`] // escape seems to work well
      : []),
    '-u',
    'node',
    ...userVolumeArgs.flatMap((arg) => ['-v', arg]),
    'test',
    'vivliostyle',
    ...commandArgs,
  ]);
  proc.stdout?.pipe(process.stdout);
  proc.stderr?.pipe(process.stderr);
  return await proc;
}
