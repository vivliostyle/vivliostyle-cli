import fs from 'node:fs';

import Arborist from '@npmcli/arborist';
import upath from 'upath';

import type { ResolvedTaskConfig } from '../config/resolve.js';
import { DetailError, executeWithCleanupOnInterrupt } from '../util.js';

function getThemeInstallCacheDir(themesDir: string): string {
  // Layout follows Arborist's default cache location:
  // https://github.com/npm/cli/blob/arborist-v9.1.7/workspaces/arborist/lib/arborist/index.js#L104
  return upath.join(themesDir, '.npm', '_cacache');
}

function* iterateSymlinksInThemesNodeModules(
  themesDir: string,
): Generator<string> {
  if (!fs.existsSync(themesDir)) {
    return;
  }
  const nodeModulesDir = upath.join(themesDir, 'node_modules');
  if (!fs.existsSync(nodeModulesDir)) {
    return;
  }
  for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) {
      continue;
    }
    const linkPath = upath.join(nodeModulesDir, entry.name);
    const target = fs.readlinkSync(linkPath);
    yield upath.resolve(nodeModulesDir, target);
  }
}

/**
 * Check for broken symlinks in node_modules directory and remove the entire
 * themes directory if any are found. This is necessary because Arborist fails
 * when encountering symlinks pointing to non-existent directories
 * (e.g., when a local theme is moved or deleted).
 */
function removeThemesDirIfBrokenSymlinks(themesDir: string): void {
  for (const target of iterateSymlinksInThemesNodeModules(themesDir)) {
    if (!fs.existsSync(target)) {
      fs.rmSync(themesDir, { recursive: true });
      return;
    }
  }
}

export async function checkThemeInstallationNecessity({
  themesDir,
  themeIndexes,
}: Pick<ResolvedTaskConfig, 'themesDir' | 'themeIndexes'>): Promise<boolean> {
  removeThemesDirIfBrokenSymlinks(themesDir);
  if (!fs.existsSync(themesDir)) {
    return [...themeIndexes].some((theme) => theme.type === 'package');
  }

  const commonOpt = {
    path: themesDir,
    cache: getThemeInstallCacheDir(themesDir),
    lockfileVersion: 3,
    installLinks: true,
  };
  const arb = new Arborist(commonOpt);
  const tree = await arb.loadActual();
  const pkgs = new Set(Array.from(tree.children.keys()));
  return [...themeIndexes].some(
    (theme) => theme.type === 'package' && !pkgs.has(theme.name),
  );
}

export function getLocalThemePaths({
  themesDir,
}: Pick<ResolvedTaskConfig, 'themesDir'>): string[] {
  return [...iterateSymlinksInThemesNodeModules(themesDir)];
}

export async function installThemeDependencies({
  themesDir,
  themeIndexes,
  signal,
}: Pick<ResolvedTaskConfig, 'themesDir' | 'themeIndexes'> & {
  signal?: AbortSignal;
}): Promise<void> {
  signal?.throwIfAborted();
  fs.mkdirSync(themesDir, { recursive: true });
  removeThemesDirIfBrokenSymlinks(themesDir);

  try {
    const commonOpt = {
      path: themesDir,
      cache: getThemeInstallCacheDir(themesDir),
      lockfileVersion: 3,
      installLinks: true,
    };
    const tree = await new Arborist(commonOpt).buildIdealTree();
    signal?.throwIfAborted();
    const existing = Array.from(tree.children.keys());
    const add = [
      ...new Set(
        [...themeIndexes].flatMap((theme) =>
          theme.type === 'package' ? [theme.specifier] : [],
        ),
      ),
    ];
    const rm = existing.filter((v) => !add.includes(v));

    // Install dependencies
    const opt = { ...commonOpt, rm, add };
    const arb = new Arborist(opt);
    // Arborist handles the process signal and must finish rollback before
    // other cleanup removes directories that reify may still be using.
    const actualTree = await executeWithCleanupOnInterrupt(
      'Waiting for theme installation rollback',
      () => arb.reify(opt),
    );

    // Replace all local package directories with symlinks for hot reload support
    for (const child of actualTree.children.values()) {
      if (child.resolved?.startsWith('file:')) {
        const sourcePath = upath.resolve(themesDir, child.resolved.slice(5));
        if (fs.existsSync(child.path)) {
          fs.rmSync(child.path, { recursive: true });
        }
        const relPath = upath.relative(upath.dirname(child.path), sourcePath);
        fs.symlinkSync(relPath, child.path, 'junction');
      }
    }
    signal?.throwIfAborted();
  } catch (error) {
    signal?.throwIfAborted();
    const thrownError = error as Error;
    throw new DetailError(
      'An error occurred during the installation of the theme',
      thrownError.stack ?? thrownError.message,
    );
  }
}
