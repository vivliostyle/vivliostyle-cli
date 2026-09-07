import { isUtf8 } from 'node:buffer';
import fs from 'node:fs';

import { downloadTemplate } from '@bluwy/giget-core';
import { copy } from 'fs-extra/esm';
import { x } from 'tinyexec';
import upath from 'upath';
import { dim, green } from 'yoctocolors';

import { format } from './create-template.js';
import type { InteractiveLogger } from './interactive.js';
import { Logger } from './logger.js';
import { GlobMatcher } from './processor/asset.js';
import { executeWithCleanupOnInterrupt, type PackageManager } from './util.js';

export function resolveTemplateSource({
  template,
  cwd,
  presets,
  interactiveLogger,
}: {
  template: string;
  cwd: string;
  presets: readonly { value: string; template: string }[];
  interactiveLogger: InteractiveLogger;
}): { template: string; useLocalTemplate: boolean } {
  if (/^([\w.\-]+):/v.test(template)) {
    return { template, useLocalTemplate: false };
  }
  const absTemplatePath = upath.resolve(cwd, template);
  if (
    fs.existsSync(absTemplatePath) &&
    fs.statSync(absTemplatePath).isDirectory()
  ) {
    interactiveLogger.logInfo(
      `Using the specified local template directory\n${dim(upath.relative(cwd, absTemplatePath) || '.')}`,
    );
    return { template: absTemplatePath, useLocalTemplate: true };
  }
  const preset = presets.find((t) => t.value === template);
  if (preset) {
    return { template: preset.template, useLocalTemplate: false };
  }
  interactiveLogger.logWarn(
    `The specified template ${green(template)} was not found as a local directory. Proceeding to fetch it from GitHub repository.`,
  );
  return { template, useLocalTemplate: false };
}

export function assertDestinationEmpty({
  cwd,
  projectPath,
}: {
  cwd: string;
  projectPath: string;
}): void {
  const dist = upath.join(cwd, projectPath);
  if (
    (projectPath === '.' &&
      fs.readdirSync(dist).some((n) => !n.startsWith('.'))) ||
    (projectPath !== '.' && fs.existsSync(dist))
  ) {
    throw new Error(`Destination ${dist} is not empty.`);
  }
}

export async function setupTemplate({
  cwd,
  projectPath,
  template,
  templateVariables,
  useLocalTemplate,
  signal,
  writeDefaultFiles,
}: {
  cwd: string;
  projectPath: string;
  template: string;
  templateVariables: Record<string, unknown>;
  useLocalTemplate?: boolean;
  signal?: AbortSignal;
  writeDefaultFiles?: (projectDir: string) => void;
}): Promise<void> {
  signal?.throwIfAborted();
  if (useLocalTemplate) {
    const matcher = new GlobMatcher([
      {
        patterns: ['**'],
        ignore: ['**/node_modules/**', '**/.git/**'],
        dot: true,
        cwd: template,
      },
    ]);
    const files = await matcher.glob({ followSymbolicLinks: true });
    signal?.throwIfAborted();
    Logger.debug('setupTemplate > files from local template %O', files);
    for (const file of files) {
      signal?.throwIfAborted();
      const targetPath = upath.join(cwd, projectPath, file);
      fs.mkdirSync(upath.dirname(targetPath), { recursive: true });
      await copy(upath.join(template, file), targetPath);
      signal?.throwIfAborted();
    }
  } else {
    // `downloadTemplate` deletes the destination directory for rollback purposes
    // when template download fails. To prevent this behavior from deleting
    // the current directory, create a temporary directory and copy the template
    // to its final location.
    // https://github.com/bluwy/giget-core/blob/2247658f4cc3240e8dc3819c782355fe4b535214/src/utils.js#L195
    const tmpDownloadDir = upath.join(
      cwd,
      projectPath,
      `.vs-template-${Date.now()}`,
    );
    Logger.debug('setupTemplate > tmpDownloadDir %s', tmpDownloadDir);
    await executeWithCleanupOnInterrupt(
      `Removing the temporary directory: ${tmpDownloadDir}`,
      async () => {
        try {
          await downloadTemplate(template, { dir: tmpDownloadDir });
          signal?.throwIfAborted();
          for (const entry of fs.readdirSync(tmpDownloadDir)) {
            fs.renameSync(
              upath.join(tmpDownloadDir, entry),
              upath.join(cwd, projectPath, entry),
            );
            signal?.throwIfAborted();
          }
        } catch (error) {
          signal?.throwIfAborted();
          throw error;
        }
      },
      () => {
        fs.rmSync(tmpDownloadDir, { recursive: true, force: true });
      },
    );
  }

  writeDefaultFiles?.(upath.join(cwd, projectPath));

  const replaceTemplateVariable = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = upath.join(dir, entry.name);
      if (entry.isDirectory()) {
        replaceTemplateVariable(entryPath);
      } else {
        const buf = fs.readFileSync(entryPath);
        if (!isUtf8(buf)) {
          continue;
        }
        fs.writeFileSync(
          entryPath,
          format(buf.toString(), templateVariables),
          'utf8',
        );
      }
    }
  };
  replaceTemplateVariable(upath.join(cwd, projectPath));
}

export async function performInstallDependencies({
  pm,
  cwd,
  projectPath,
  signal,
}: {
  pm: PackageManager;
  cwd: string;
  projectPath: string;
  signal?: AbortSignal;
}): Promise<void> {
  signal?.throwIfAborted();
  const proc = x(pm, ['install'], {
    throwOnError: true,
    signal,
    nodeOptions: {
      cwd: upath.join(cwd, projectPath),
      stdio: Logger.isInteractive ? 'inherit' : undefined,
    },
  });
  await executeWithCleanupOnInterrupt(
    'Waiting for dependency installation to stop',
    async () => {
      try {
        if (Logger.isInteractive) {
          await proc;
        } else {
          for await (const line of proc) {
            Logger.log(line);
          }
        }
        signal?.throwIfAborted();
      } catch (error) {
        signal?.throwIfAborted();
        throw error;
      }
    },
  );
}
