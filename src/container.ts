import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { x } from 'tinyexec';
import upath from 'upath';

import type { PdfOutput, ResolvedTaskConfig } from './config/resolve.js';
import type { ParsedVivliostyleInlineConfig } from './config/schema.js';
import { CONTAINER_LOCAL_HOSTNAME, CONTAINER_ROOT_DIR } from './constants.js';
import { Logger } from './logger.js';
import { importNodeModule } from './node-modules.js';
import { getSourceUrl } from './server.js';
import {
  exec,
  executeWithCleanupOnInterrupt,
  isValidUri,
  pathEquals,
} from './util.js';

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
  env,
  workdir,
  signal,
}: {
  image: string;
  userVolumeArgs: string[];
  commandArgs: string[];
  entrypoint?: string;
  env?: [string, string][];
  workdir?: string;
  signal?: AbortSignal;
}) {
  signal?.throwIfAborted();
  const { default: commandExists } = await importNodeModule('command-exists');
  const dockerExists = await commandExists('docker');
  signal?.throwIfAborted();
  if (!dockerExists) {
    throw new Error(
      `Docker isn't be installed. To use this feature, you'll need to install Docker.`,
    );
  }
  let version: string;
  try {
    version = (
      await exec('docker', ['version', '--format', '{{.Server.Version}}'], {
        signal,
      })
    ).stdout;
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  }
  signal?.throwIfAborted();
  const [major, minor] = version.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 10)) {
    throw new Error(
      `Docker version ${version} is not supported. Please upgrade to Docker 20.10.0 or later.`,
    );
  }

  try {
    using _ = Logger.suspendLogging('Launching docker container');
    const args = [
      'run',
      ...(Logger.isInteractive ? ['-it'] : []),
      '--rm',
      ...(entrypoint ? ['--entrypoint', entrypoint] : []),
      ...(env ? env.flatMap(([k, v]) => ['-e', `${k}=${v}`]) : []),
      ...(process.env.DEBUG
        ? ['-e', `DEBUG=${process.env.DEBUG}`] // escape seems to work well
        : []),
      ...userVolumeArgs.flatMap((arg) => ['-v', arg]),
      ...(workdir ? ['-w', workdir] : []),
      image,
      ...commandArgs,
    ];
    Logger.debug(`docker ${args.join(' ')}`);
    const proc = x('docker', args, {
      throwOnError: true,
      signal,
      nodeOptions: {
        stdio: Logger.isInteractive ? 'inherit' : undefined,
      },
    });
    await executeWithCleanupOnInterrupt(
      'Waiting for Docker process to stop',
      async () => {
        if (Logger.isInteractive) {
          await proc;
        } else {
          for await (const line of proc) {
            Logger.log(line);
          }
        }
      },
    );
    signal?.throwIfAborted();
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(
      'An error occurred on the running container. Please see logs above.',
      { cause: error },
    );
  }
}

export async function buildPDFWithContainer({
  target,
  config,
  inlineConfig,
}: {
  target: PdfOutput;
  config: ResolvedTaskConfig;
  inlineConfig: ParsedVivliostyleInlineConfig;
}): Promise<string | null> {
  const sourceUrl = new URL(await getSourceUrl(config));
  if (sourceUrl.origin === config.rootUrl) {
    sourceUrl.hostname = CONTAINER_LOCAL_HOSTNAME;
  }
  const bypassedOption = {
    ...inlineConfig,
    input: {
      format: 'webbook',
      entry: sourceUrl.href,
    },
    output: [
      {
        ...target,
        path: toContainerPath(target.path),
      },
    ],
    host: CONTAINER_LOCAL_HOSTNAME,
  } satisfies ParsedVivliostyleInlineConfig;

  await runContainer({
    image: config.image,
    userVolumeArgs: collectVolumeArgs([
      ...(typeof config.serverRootDir === 'string'
        ? [config.serverRootDir]
        : []),
      upath.dirname(target.path),
    ]),
    env: [['VS_CLI_BUILD_PDF_OPTIONS', JSON.stringify(bypassedOption)]],
    commandArgs: ['build'],
    signal: inlineConfig.signal,
    workdir:
      typeof config.serverRootDir === 'string'
        ? toContainerPath(config.serverRootDir)
        : undefined,
  });

  return target.path;
}
