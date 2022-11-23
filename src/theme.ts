import Arborist from '@npmcli/arborist';
import fs from 'fs';
import npa from 'npm-package-arg';
import shelljs from 'shelljs';
import path from 'upath';
import { MergedConfig } from './config';
import { beforeExitHandlers, DetailError } from './util';

// Rename `packages` directory into `node_modules` while Arborist works
const temporaryMovePackagesDirectrory = async <T = unknown>(
  themesDir: string,
  cb: () => Promise<T>,
) => {
  const exitHandler = () => {
    if (fs.existsSync(path.join(themesDir, 'node_modules'))) {
      shelljs.mv(
        '-f',
        path.join(themesDir, 'node_modules'),
        path.join(themesDir, 'packages'),
      );
    }
  };
  beforeExitHandlers.push(exitHandler);
  if (fs.existsSync(path.join(themesDir, 'packages'))) {
    shelljs.mv(
      '-f',
      path.join(themesDir, 'packages'),
      path.join(themesDir, 'node_modules'),
    );
  }
  try {
    return await cb();
  } finally {
    exitHandler();
  }
};

export async function checkThemeInstallationNecessity({
  workspaceDir,
  themeIndexes,
}: Pick<MergedConfig, 'workspaceDir' | 'themeIndexes'>): Promise<boolean> {
  const themesDir = path.join(workspaceDir, 'themes');
  if (!fs.existsSync(themesDir)) {
    return themeIndexes.some((theme) => theme.type === 'package');
  }

  return await temporaryMovePackagesDirectrory(themesDir, async () => {
    const commonOpt = {
      path: themesDir,
      lockfileVersion: 3,
    };
    const arb = new Arborist(commonOpt);
    const tree = await arb.loadActual();
    const children = Array.from(tree.children.values());
    return themeIndexes.some(
      (theme) =>
        theme.type === 'package' &&
        (children.length === 0 ||
          // https://github.com/npm/cli/blob/dc8e6bdd1d9e3416846c4f0624705cb42a7fb067/workspaces/arborist/lib/node.js#L1088
          !children.every((node) => (node as any).satisfies(theme.name))),
    );
  });
}

export async function installThemeDependencies({
  workspaceDir,
  themeIndexes,
}: Pick<MergedConfig, 'workspaceDir' | 'themeIndexes'>): Promise<void> {
  const themesDir = path.join(workspaceDir, 'themes');
  shelljs.mkdir('-p', themesDir);

  await temporaryMovePackagesDirectrory(themesDir, async () => {
    try {
      const commonOpt = {
        path: themesDir,
        lockfileVersion: 3,
      };
      const tree = await new Arborist(commonOpt).buildIdealTree();
      const existing = Array.from(tree.children.keys());
      const add = themeIndexes.flatMap((theme) =>
        theme.type === 'package' ? [theme.specifier] : [],
      );
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
  });
}

export function parsePackageName(
  specifier: string,
  cwd: string,
): npa.Result | null {
  try {
    return npa(specifier, cwd);
  } catch (error) {
    return null;
  }
}
