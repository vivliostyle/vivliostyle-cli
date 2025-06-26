import { copy } from 'fs-extra/esm';
import fs from 'node:fs';
import picomatch from 'picomatch';
import { glob } from 'tinyglobby';
import upath from 'upath';
import { ResolvedTaskConfig } from '../config/resolve.js';
import { Logger } from '../logger.js';
import { pathContains, pathEquals } from '../util.js';

export function getIgnoreThemeExamplePatterns({
  themesDir,
  cwd,
}: Pick<ResolvedTaskConfig, 'themesDir'> & {
  cwd: string;
}): string[] {
  return pathContains(cwd, themesDir)
    ? [
        `${upath.relative(cwd, themesDir)}/node_modules/*/example`,
        `${upath.relative(cwd, themesDir)}/node_modules/*/*/example`,
      ]
    : [];
}

export function getIgnoreAssetPatterns({
  outputs,
  entries,
  cwd,
}: Pick<ResolvedTaskConfig, 'outputs' | 'entries'> & {
  cwd: string;
}): string[] {
  return [
    ...outputs.flatMap(({ format, path: p }) =>
      !pathContains(cwd, p)
        ? []
        : format === 'webpub'
          ? upath.join(upath.relative(cwd, p), '**')
          : upath.relative(cwd, p),
    ),
    ...entries.flatMap(({ template }) => {
      return template?.type === 'file' && pathContains(cwd, template.pathname)
        ? upath.relative(cwd, template.pathname)
        : [];
    }),
  ];
}

function getAssetMatcherSettings({
  copyAsset: { fileExtensions, includes, excludes },
  outputs,
  themesDir,
  entries,
  customStyle,
  customUserStyle,
  cwd,
  ignore = [],
}: Pick<
  ResolvedTaskConfig,
  | 'copyAsset'
  | 'outputs'
  | 'themesDir'
  | 'entries'
  | 'customStyle'
  | 'customUserStyle'
> & {
  cwd: string;
  ignore?: string[];
}): { patterns: string[]; ignore: string[] }[] {
  const ignorePatterns = [
    ...ignore,
    ...excludes,
    ...getIgnoreAssetPatterns({ outputs, entries, cwd }),
  ];
  Logger.debug('globAssetFiles > ignorePatterns', ignorePatterns);

  return [
    // Step 1: Glob files with an extension in `fileExtension`
    // Ignore files in node_modules directory, theme example files and files matched `excludes`
    {
      patterns: fileExtensions.map((ext) => `**/*.${ext}`),
      ignore: [
        '**/node_modules/**',
        ...ignorePatterns,
        ...getIgnoreThemeExamplePatterns({ themesDir, cwd }),
      ],
    },
    // Step 2: Glob files matched with `includes`
    // Ignore only files matched `excludes`
    {
      patterns: [
        ...includes,
        // Copy custom (user) style if specified
        customStyle,
        customUserStyle,
      ].filter((s): s is string => Boolean(s)),
      ignore: ignorePatterns,
    },
  ];
}

export function getAssetMatcher(
  arg: Parameters<typeof getAssetMatcherSettings>[0] &
    Pick<ResolvedTaskConfig, 'customStyle' | 'customUserStyle'>,
) {
  const matchers = getAssetMatcherSettings(arg).map(({ patterns, ignore }) =>
    picomatch(patterns, { ignore }),
  );
  return (test: string) => matchers.some((matcher) => matcher(test));
}

export async function globAssetFiles(
  arg: Parameters<typeof getAssetMatcherSettings>[0],
): Promise<Set<string>> {
  const settings = getAssetMatcherSettings(arg);
  return new Set(
    (
      await Promise.all(
        settings.map(({ patterns, ignore }) =>
          glob(patterns, {
            cwd: arg.cwd,
            ignore,
            followSymbolicLinks: true,
          }),
        ),
      )
    ).flat(),
  );
}

export async function copyAssets({
  entryContextDir,
  workspaceDir,
  copyAsset,
  outputs,
  themesDir,
  entries,
  customStyle,
  customUserStyle,
}: ResolvedTaskConfig): Promise<void> {
  if (pathEquals(entryContextDir, workspaceDir)) {
    return;
  }
  const relWorkspaceDir = upath.relative(entryContextDir, workspaceDir);
  const assets = await globAssetFiles({
    copyAsset,
    cwd: entryContextDir,
    outputs,
    themesDir,
    entries,
    customStyle,
    customUserStyle,
    ignore: [
      // don't copy workspace itself
      ...(relWorkspaceDir ? [upath.join(relWorkspaceDir, '**')] : []),
    ],
  });
  Logger.debug('assets', assets);
  for (const asset of assets) {
    const target = upath.join(workspaceDir, asset);
    fs.mkdirSync(upath.dirname(target), { recursive: true });
    await copy(upath.resolve(entryContextDir, asset), target);
  }
}
