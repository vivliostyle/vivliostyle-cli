import { isUtf8 } from 'node:buffer';
import fs from 'node:fs';

import { downloadTemplate } from '@bluwy/giget-core';
import { copy } from 'fs-extra/esm';
import { satisfies as semverSatisfies } from 'semver';
import { x } from 'tinyexec';
import upath from 'upath';
import * as v from 'valibot';
import { cyan, dim, green } from 'yoctocolors';

import { VivliostyleTemplateManifest } from './config/schema.js';
import {
  DEFAULT_THEME_TEMPLATE,
  TEMPLATE_MANIFEST_FILENAME,
  TEMPLATE_SETTINGS,
} from './constants.js';
import { format } from './create-template.js';
import type { InteractiveLogger } from './interactive.js';
import { Logger } from './logger.js';
import { GlobMatcher } from './processor/asset.js';
import {
  cliVersion,
  DetailError,
  executeWithCleanupOnInterrupt,
  type PackageManager,
  prettifySchemaError,
  toError,
} from './util.js';

const BUILTIN_TEMPLATES: ReadonlySet<string> = new Set([
  ...TEMPLATE_SETTINGS.map((t) => t.template),
  DEFAULT_THEME_TEMPLATE,
]);

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

function readTemplateManifest(
  templateDir: string,
): VivliostyleTemplateManifest | undefined {
  const manifestPath = upath.join(templateDir, TEMPLATE_MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    return;
  }
  const raw = fs.readFileSync(manifestPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse the template manifest ${manifestPath}: ${toError(error).message}`,
      { cause: error },
    );
  }
  const result = v.safeParse(VivliostyleTemplateManifest, parsed);
  if (!result.success) {
    throw new DetailError(
      `Validation of the template manifest failed: ${manifestPath}`,
      prettifySchemaError(raw, result.issues),
    );
  }
  return result.output;
}

export function assertTemplateCompatibility({
  templateDir,
  templateSource,
  currentVersion = cliVersion,
}: {
  templateDir: string;
  templateSource: string;
  currentVersion?: string;
}): void {
  const selfPackageName = '@vivliostyle/cli';
  const range = readTemplateManifest(templateDir)?.engines?.[selfPackageName];
  if (
    !range ||
    semverSatisfies(currentVersion, range, { includePrerelease: true })
  ) {
    return;
  }
  const lines = [
    `The template requires ${selfPackageName} "${range}", but the current version is ${currentVersion}.`,
    `Update ${selfPackageName} to a version that satisfies the requirement, or use a template that supports the current version.`,
  ];
  if (BUILTIN_TEMPLATES.has(templateSource)) {
    lines.push(
      `To use this template without updating ${selfPackageName}, specify the release tag that matches the current version: ${cyan(`--template ${templateSource}#v${currentVersion}`)}`,
    );
  }
  throw new Error(lines.join('\n'));
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
    assertTemplateCompatibility({
      templateDir: template,
      templateSource: template,
    });
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
      if (file === TEMPLATE_MANIFEST_FILENAME) {
        continue;
      }
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
          assertTemplateCompatibility({
            templateDir: tmpDownloadDir,
            templateSource: template,
          });
          for (const entry of fs.readdirSync(tmpDownloadDir)) {
            if (entry === TEMPLATE_MANIFEST_FILENAME) {
              continue;
            }
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
