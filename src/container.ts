import chalk from 'chalk';
import commandExists from 'command-exists';
import execa from 'execa';
import isInteractive from 'is-interactive';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import upath from 'upath';
import { cliVersion } from './const.js';
import { debug, isValidUri, log, pathEquals, suspendLogging } from './util.js';

export const CONTAINER_IMAGE = `ghcr.io/vivliostyle/cli:${cliVersion}`;
export const CONTAINER_ROOT_DIR = '/data';

export function toContainerPath(urlOrAbsPath: string): string {
  if (isValidUri(urlOrAbsPath)) {
    if (urlOrAbsPath.toLowerCase().startsWith('file')) {
      return pathToFileURL(
        upath.posix.join(
          CONTAINER_ROOT_DIR,
          upath.toUnix(fileURLToPath(urlOrAbsPath)).replace(/^\w:/, ''),
        ),
      ).href;
    } else {
      return urlOrAbsPath;
    }
  }
  return upath.posix.join(
    CONTAINER_ROOT_DIR,
    upath.toUnix(urlOrAbsPath).replace(/^\w:/, ''),
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
      while (!pathEquals(parent, upath.dirname(parent))) {
        parent = upath.dirname(parent);
        if (array.includes(parent)) {
          // other mount point contains its directory
          return false;
        }
      }
      return true;
    })
    .map((p) => `${p}:${toContainerPath(p)}`);
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
  if (!(await commandExists('docker'))) {
    throw new Error(
      `Docker isn't be installed. To use this feature, you'll need to install Docker.`,
    );
  }

  const restartLogging = suspendLogging('Launching docker container', '📦');
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
  try {
    const proc = execa('docker', args, {
      stdio: 'inherit',
    });
    proc.stdout?.pipe(process.stdout);
    proc.stderr?.pipe(process.stderr);
    const ret = await proc;
    restartLogging();
    return ret;
  } catch (error) {
    log(
      `\n${chalk.red.bold(
        'Error:',
      )} An error occurred on the running container. Please see logs above.`,
    );
    process.exit(1);
  }
}
