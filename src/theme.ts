import Arborist from '@npmcli/arborist';
import fs from 'node:fs';
import npa from 'npm-package-arg';
import shelljs from 'shelljs';
import path from 'upath';
import { MergedConfig } from './config.js';
import { beforeExitHandlers, DetailError } from './util.js';

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
  themesDir,
  themeIndexes,
}: Pick<MergedConfig, 'themesDir' | 'themeIndexes'>): Promise<boolean> {
  if (!fs.existsSync(themesDir)) {
    return [...themeIndexes].some((theme) => theme.type === 'package');
  }

  return await temporaryMovePackagesDirectrory(themesDir, async () => {
    const commonOpt = {
      path: themesDir,
      lockfileVersion: 3,
    };
    const arb = new Arborist(commonOpt);
    const tree = await arb.loadActual();
    const pkgs = Array.from(tree.children.keys());
    return [...themeIndexes].some(
      (theme) => theme.type === 'package' && !pkgs.includes(theme.name),
    );
  });
}

export async function installThemeDependencies({
  themesDir,
  themeIndexes,
}: Pick<MergedConfig, 'themesDir' | 'themeIndexes'>): Promise<void> {
  shelljs.mkdir('-p', themesDir);

  await temporaryMovePackagesDirectrory(themesDir, async () => {
    try {
      const commonOpt = {
        path: themesDir,
        lockfileVersion: 3,
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
  });
}

export function parsePackageName(
  specifier: string,
  cwd: string,
): npa.Result | null {
  try {
    let result = npa(specifier, cwd);
    // #373: Relative path specifiers may be assumed as shorthand of hosted git
    // (ex: foo/bar -> github:foo/bar)
    if (result.type === 'git' && result.saveSpec?.startsWith('github:')) {
      result = npa(`file:${specifier}`, cwd);
    }
    return result;
  } catch (error) {
    return null;
  }
}
