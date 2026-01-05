import Arborist from '@npmcli/arborist';
import fs from 'node:fs';
import upath from 'upath';
import type { ResolvedTaskConfig } from '../config/resolve.js';
import { DetailError } from '../util.js';

function getAllFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = upath.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function checkLocalThemeNeedsUpdate(
  sourceDir: string,
  targetDir: string,
): boolean {
  if (!fs.existsSync(targetDir)) {
    return true;
  }

  const sourceFiles = getAllFiles(sourceDir).map((f) =>
    upath.relative(sourceDir, f),
  );
  const targetFiles = getAllFiles(targetDir).map((f) =>
    upath.relative(targetDir, f),
  );

  // Check for added or removed files
  const sourceSet = new Set(sourceFiles);
  const targetSet = new Set(targetFiles);
  for (const file of sourceFiles) {
    if (!targetSet.has(file)) {
      return true; // File added
    }
  }
  for (const file of targetFiles) {
    if (!sourceSet.has(file)) {
      return true; // File removed
    }
  }

  // Check for modified files
  for (const relPath of sourceFiles) {
    const sourcePath = upath.join(sourceDir, relPath);
    const targetPath = upath.join(targetDir, relPath);
    const sourceContent = fs.readFileSync(sourcePath);
    const targetContent = fs.readFileSync(targetPath);
    if (!sourceContent.equals(targetContent)) {
      return true; // File modified
    }
  }

  return false;
}

export async function checkThemeInstallationNecessity({
  themesDir,
  themeIndexes,
}: Pick<ResolvedTaskConfig, 'themesDir' | 'themeIndexes'>): Promise<boolean> {
  if (!fs.existsSync(themesDir)) {
    return [...themeIndexes].some((theme) => theme.type === 'package');
  }

  const commonOpt = {
    path: themesDir,
    lockfileVersion: 3,
    installLinks: true,
  };
  const arb = new Arborist(commonOpt);
  const tree = await arb.loadActual();
  const pkgs = Array.from(tree.children.keys());

  for (const theme of themeIndexes) {
    if (theme.type !== 'package') {
      continue;
    }
    // Check if package is not installed
    if (!pkgs.includes(theme.name)) {
      return true;
    }
    // For local directory themes, check if files have changed
    if (!theme.registry) {
      if (checkLocalThemeNeedsUpdate(theme.specifier, theme.location)) {
        return true;
      }
    }
  }

  return false;
}

export async function installThemeDependencies({
  themesDir,
  themeIndexes,
}: Pick<ResolvedTaskConfig, 'themesDir' | 'themeIndexes'>): Promise<void> {
  fs.mkdirSync(themesDir, { recursive: true });

  try {
    const commonOpt = {
      path: themesDir,
      lockfileVersion: 3,
      installLinks: true,
    };
    const tree = await new Arborist(commonOpt).buildIdealTree();
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
    await arb.reify(opt);

    return;
  } catch (error) {
    const thrownError = error as Error;
    throw new DetailError(
      'An error occurred during the installation of the theme',
      thrownError.stack ?? thrownError.message,
    );
  }
}
