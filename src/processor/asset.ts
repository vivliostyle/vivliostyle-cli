import { copy } from 'fs-extra/esm';
import fs from 'node:fs';
import picomatch, { PicomatchOptions } from 'picomatch';
import { glob, GlobOptions } from 'tinyglobby';
import upath from 'upath';
import { ResolvedTaskConfig } from '../config/resolve.js';
import { Logger } from '../logger.js';
import { pathContains, pathEquals } from '../util.js';

export class GlobMatcher {
  #_matchers: picomatch.Matcher[];

  constructor(
    public matcherConfig: (Pick<PicomatchOptions, 'dot' | 'ignore'> & {
      patterns: string[];
      cwd: string;
    })[],
  ) {
    this.#_matchers = matcherConfig.map(({ patterns, ...options }) =>
      picomatch(patterns, options),
    );
  }

  match(test: string): boolean {
    return this.#_matchers.some((matcher) => matcher(test));
  }

  async glob(
    globOptions: Pick<GlobOptions, 'followSymbolicLinks'> = {},
  ): Promise<Set<string>> {
    return new Set(
      (
        await Promise.all(
          this.matcherConfig.map((config) =>
            glob({ ...config, ...globOptions }),
          ),
        )
      ).flat(),
    );
  }
}

function getIgnoreThemeDirectoryPatterns({
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

function getIgnoreAssetPatterns({
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

export function getWebPubResourceMatcher({
  outputs,
  themesDir,
  entries,
  cwd,
  manifestPath,
}: Pick<ResolvedTaskConfig, 'outputs' | 'themesDir' | 'entries'> & {
  cwd: string;
  manifestPath: string;
}) {
  return new GlobMatcher([
    {
      patterns: [
        `**/${upath.relative(cwd, manifestPath)}`,
        '**/*.{html,htm,xhtml,xht,css}',
      ],
      ignore: [
        ...getIgnoreAssetPatterns({
          cwd,
          outputs,
          entries,
        }),
        ...getIgnoreThemeDirectoryPatterns({
          cwd,
          themesDir,
        }),
        // Ignore node_modules in the root directory
        'node_modules/**',
        // only include dotfiles starting with `.vs-`
        '**/.!(vs-*)/**',
      ],
      dot: true,
      cwd,
    },
  ]);
}

export function getAssetMatcher({
  copyAsset: { fileExtensions, includes, excludes },
  outputs,
  themesDir,
  entries,
  cwd,
  ignore = [],
}: Pick<
  ResolvedTaskConfig,
  'copyAsset' | 'outputs' | 'themesDir' | 'entries'
> & {
  cwd: string;
  ignore?: string[];
}) {
  const ignorePatterns = [
    ...ignore,
    ...excludes,
    ...getIgnoreAssetPatterns({ outputs, entries, cwd }),
  ];
  return new GlobMatcher([
    // Step 1: Glob files with an extension in `fileExtension`
    // Ignore files in node_modules directory, theme example files and files matched `excludes`
    {
      patterns: fileExtensions.map((ext) => `**/*.${ext}`),
      ignore: [
        '**/node_modules/**',
        ...ignorePatterns,
        ...getIgnoreThemeDirectoryPatterns({ themesDir, cwd }),
      ],
      cwd,
    },
    // Step 2: Glob files matched with `includes`
    // Ignore only files matched `excludes`
    {
      patterns: includes,
      ignore: ignorePatterns,
      cwd,
    },
  ]);
}

export async function copyAssets({
  entryContextDir,
  workspaceDir,
  copyAsset,
  outputs,
  themesDir,
  entries,
}: ResolvedTaskConfig): Promise<void> {
  if (pathEquals(entryContextDir, workspaceDir)) {
    return;
  }
  const relWorkspaceDir = upath.relative(entryContextDir, workspaceDir);
  const assets = await getAssetMatcher({
    copyAsset,
    cwd: entryContextDir,
    outputs,
    themesDir,
    entries,
    ignore: [
      // don't copy workspace itself
      ...(relWorkspaceDir ? [upath.join(relWorkspaceDir, '**')] : []),
    ],
  }).glob({ followSymbolicLinks: true });
  Logger.debug('assets', assets);
  for (const asset of assets) {
    const target = upath.join(workspaceDir, asset);
    fs.mkdirSync(upath.dirname(target), { recursive: true });
    await copy(upath.resolve(entryContextDir, asset), target);
  }
}
