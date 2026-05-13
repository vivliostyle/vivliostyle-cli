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
import { exec, isValidUri, pathEquals } from './util.js';

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

export function collectVolumeArgs(
  mountPoints: string[],
  pathTransformer?: (hostPath: string) => string,
): string[] {
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
    .map(
      (p) =>
        `${pathTransformer ? pathTransformer(p) : p}:${toContainerPath(p)}`,
    );
}

export async function runContainer({
  image,
  userVolumeArgs,
  commandArgs,
  entrypoint,
  env,
  workdir,
  hostGateway,
  extraRunArgs,
}: {
  image: string;
  userVolumeArgs: string[];
  commandArgs: string[];
  entrypoint?: string;
  env?: [string, string][];
  workdir?: string;
  hostGateway?: string;
  extraRunArgs?: readonly string[];
}) {
  const { default: commandExists } = await importNodeModule('command-exists');
  if (!(await commandExists('docker'))) {
    throw new Error(
      `Docker isn't be installed. To use this feature, you'll need to install Docker.`,
    );
  }
  const version = (
    await exec('docker', ['version', '--format', '{{.Server.Version}}'])
  ).stdout;
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
      // Docker Desktop (and Colima) auto-provide host.docker.internal; raw
      // Linux dockerd, including the dockerd that runs inside WSL, does not.
      // `host-gateway` resolves to the daemon's docker0 bridge by default; the
      // hostGateway override lets users point it at a different IP (e.g. the
      // WSL eth0 gateway when the daemon lives in WSL but Vite runs on Windows).
      '--add-host',
      `${CONTAINER_LOCAL_HOSTNAME}:${hostGateway ?? 'host-gateway'}`,
      ...(extraRunArgs ?? []),
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
      nodeOptions: {
        stdio: Logger.isInteractive ? 'inherit' : undefined,
      },
    });
    if (Logger.isInteractive) {
      await proc;
    } else {
      for await (const line of proc) {
        Logger.log(line);
      }
    }
  } catch (error) {
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

  // buildPDFWithContainer is only invoked for docker-mode targets (see build.ts)
  const renderMode =
    target.renderMode.mode === 'docker' ? target.renderMode : undefined;

  await runContainer({
    image: config.image,
    userVolumeArgs: collectVolumeArgs(
      [
        ...(typeof config.serverRootDir === 'string'
          ? [config.serverRootDir]
          : []),
        upath.dirname(target.path),
      ],
      renderMode?.pathTransformer,
    ),
    env: [['VS_CLI_BUILD_PDF_OPTIONS', JSON.stringify(bypassedOption)]],
    commandArgs: ['build'],
    workdir:
      typeof config.serverRootDir === 'string'
        ? toContainerPath(config.serverRootDir)
        : undefined,
    hostGateway: renderMode?.hostGateway,
    extraRunArgs: renderMode?.extraRunArgs,
  });

  return target.path;
}
