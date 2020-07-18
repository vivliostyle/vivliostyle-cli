import chalk from 'chalk';
import fs from 'fs';
import globby from 'globby';
import path from 'path';
import shelljs from 'shelljs';
import { contextResolve, MergedConfig } from './config';
import { generateToC, processHTML } from './html';
import { generateManifest } from './manifest';
import { processMarkdown } from './markdown';
import { debug } from './util';

export async function buildArtifacts({
  entryContextDir,
  artifactDir,
  projectTitle,
  themeIndexes,
  entries,
  distDir,
  projectAuthor,
  language,
  toc,
  cover,
}: MergedConfig) {
  if (entries.length === 0) {
    throw new Error(
      `Missing entry.
Run ${chalk.green.bold('vivliostyle init')} to create ${chalk.bold(
        'vivliostyle.config.js',
      )}`,
    );
  }

  // populate entries
  shelljs.mkdir('-p', artifactDir);
  for (const entry of entries) {
    shelljs.mkdir('-p', entry.target.dir);

    // calculate style path
    let style;
    switch (entry?.theme?.type) {
      case 'uri':
        style = entry.theme.location;
        break;
      case 'file':
        style = path.relative(
          entry.target.dir,
          path.join(distDir, 'themes', entry.theme.name),
        );
        break;
      case 'package':
        style = path.relative(
          entry.target.dir,
          path.join(
            distDir,
            'themes',
            'packages',
            entry.theme.name,
            entry.theme.style,
          ),
        );
    }

    const compiledEntry =
      entry.type === 'html'
        ? processHTML(entry, style).toString()
        : processMarkdown(entry.source.path, {
            title: entry.title,
            style,
          }).toString();
    console.log(compiledEntry);

    fs.writeFileSync(entry.target.path, compiledEntry);
  }

  // copy theme
  const themeRoot = path.join(distDir, 'themes');
  shelljs.mkdir('-p', path.join(themeRoot, 'packages'));
  for (const theme of themeIndexes) {
    switch (theme.type) {
      case 'file':
        shelljs.cp(theme.location, themeRoot);
        break;
      case 'package':
        const target = path.join(themeRoot, 'packages', theme.name);
        const targetDir = path.dirname(target);
        shelljs.mkdir('-p', targetDir);
        shelljs.cp('-r', theme.location, target);
    }
  }

  // copy image assets
  const assets = await globby(entryContextDir, {
    caseSensitiveMatch: false,
    followSymbolicLinks: false,
    gitignore: true,
    expandDirectories: {
      extensions: ['png', 'jpg', 'jpeg', 'svg', 'gif'],
    },
  });
  debug('images %O', assets);
  for (const asset of assets) {
    const target = path.join(
      artifactDir,
      path.relative(entryContextDir, asset),
    );
    shelljs.mkdir('-p', path.dirname(target));
    shelljs.cp(asset, target);
  }

  // copy cover
  if (cover) {
    const { ext } = path.parse(cover);
    shelljs.cp(cover, path.join(distDir, `cover${ext}`));
  }

  // generate manifest
  const manifestPath = path.join(distDir, 'manifest.json');
  generateManifest(manifestPath, {
    title: projectTitle,
    author: projectAuthor,
    language,
    toc,
    cover,
    entries: entries.map((entry) => ({
      title: entry.title,
      path: path.relative(distDir, entry.target.path),
    })),
    modified: new Date().toISOString(),
  });

  // generate toc
  if (toc) {
    const distTocPath = path.join(distDir, 'toc.html');
    if (typeof toc === 'string') {
      shelljs.cp(contextResolve(entryContextDir, toc)!, distTocPath);
    } else {
      const tocString = generateToC(entries, distDir);
      fs.writeFileSync(distTocPath, tocString);
    }
  }
  return { manifestPath };
}

export function cleanup(location: string) {
  shelljs.rm('-rf', location);
}
