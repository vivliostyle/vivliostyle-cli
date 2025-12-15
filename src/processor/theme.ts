import Arborist from '@npmcli/arborist';
import fs from 'node:fs';
import type { ResolvedTaskConfig } from '../config/resolve.js';
import { DetailError } from '../util.js';

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
  return [...themeIndexes].some(
    (theme) => theme.type === 'package' && !pkgs.includes(theme.name),
  );
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
