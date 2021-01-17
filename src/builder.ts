import chalk from 'chalk';
import fs from 'fs';
import globby from 'globby';
import toHTML from 'hast-util-to-html';
import h from 'hastscript';
import { imageSize } from 'image-size';
import { lookup as mime } from 'mime-types';
import shelljs from 'shelljs';
import path from 'upath';
import { Entry, MergedConfig, ParsedEntry } from './config';
import { processMarkdown } from './markdown';
import { debug, log } from './util';

export interface ManifestOption {
  title?: string;
  author?: string;
  language?: string;
  modified: string;
  entries: Entry[];
  toc?: string;
  cover?: string;
}

export interface ManifestEntry {
  href: string;
  type: string;
  rel?: string;
  [index: string]: number | string | undefined;
}

export function cleanup(location: string) {
  debug('cleanup file', location);
  shelljs.rm('-rf', location);
}

// example: https://github.com/readium/webpub-manifest/blob/master/examples/MobyDick/manifest.json
export function generateManifest(
  outputPath: string,
  entryContextDir: string,
  options: ManifestOption,
) {
  const entries: ManifestEntry[] = options.entries.map((entry) => ({
    href: entry.path,
    type: 'text/html',
    title: entry.title,
  }));
  const links: ManifestEntry[] = [];
  const resources: ManifestEntry[] = [];

  if (options.toc) {
    entries.splice(0, 0, {
      href: options.toc,
      rel: 'contents',
      type: 'text/html',
      title: 'Table of Contents',
    });
  }

  if (options.cover) {
    const { width, height, type } = imageSize(
      path.resolve(entryContextDir, options.cover),
    );
    let mimeType: string | false = false;
    if (type) {
      mimeType = mime(type);
      if (mimeType) {
        links.push({
          rel: 'cover',
          href: options.cover,
          type: mimeType,
          width,
          height,
        });
      }
    }
    if (!type || !mimeType) {
      log(
        `\n${chalk.yellow('Cover image ')}${chalk.bold.yellow(
          `"${options.cover}"`,
        )}${chalk.yellow(
          ' was set in your configuration but couldn’t detect the image metadata. Please check a valid cover file is placed.',
        )}`,
      );
    }
  }

  const manifest = {
    '@context': 'https://readium.org/webpub-manifest/context.jsonld',
    metadata: {
      '@type': 'http://schema.org/Book',
      title: options.title,
      author: options.author,
      language: options.language,
      modified: options.modified,
    },
    links,
    readingOrder: entries,
    resources,
  };

  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
}

export function generateToC(entries: ParsedEntry[], distDir: string) {
  const items = entries.map((entry) =>
    h(
      'li',
      h(
        'a',
        { href: path.relative(distDir, entry.target) },
        entry.title || path.basename(entry.target, '.html'),
      ),
    ),
  );
  const toc = h(
    'html',
    h(
      'head',
      h('title', 'Table of Contents'),
      h('link', {
        href: 'manifest.json',
        rel: 'manifest',
        type: 'application/webpub+json',
      }),
    ),
    h('body', h('nav#toc', { role: 'doc-toc' }, h('ul', items))),
  );
  return toHTML(toc);
}

export async function compile(
  {
    entryContextDir,
    workspaceDir,
    manifestPath,
    projectTitle,
    themeIndexes,
    entries,
    projectAuthor,
    language,
    toc,
    cover,
  }: MergedConfig,
  { reload = false }: { reload?: boolean } = {},
): Promise<void> {
  debug('entries', entries);
  debug('themes', themeIndexes);

  if (
    !reload &&
    path.relative(workspaceDir, entryContextDir).startsWith('..')
  ) {
    // workspaceDir is placed on different directory
    cleanup(workspaceDir);
  }

  for (const entry of entries) {
    shelljs.mkdir('-p', path.dirname(entry.target));

    // calculate style path
    let style;
    switch (entry?.theme?.type) {
      case 'uri':
        style = entry.theme.location;
        break;
      case 'file':
        style = path.relative(
          path.dirname(entry.target),
          path.join(workspaceDir, 'themes', entry.theme.name),
        );
        break;
      case 'package':
        style = path.relative(
          path.dirname(entry.target),
          path.join(
            workspaceDir,
            'themes',
            'packages',
            entry.theme.name,
            entry.theme.style,
          ),
        );
    }
    if (entry.type === 'markdown') {
      // compile markdown
      const vfile = processMarkdown(entry.source, {
        style,
        title: entry.title,
      });
      const compiledEntry = String(vfile);
      fs.writeFileSync(entry.target, compiledEntry);
    } else {
      if (entry.source !== entry.target) {
        shelljs.cp(entry.source, entry.target);
      }
    }
  }

  // copy theme
  const themeRoot = path.join(workspaceDir, 'themes');
  for (const theme of themeIndexes) {
    switch (theme.type) {
      case 'file':
        shelljs.mkdir('-p', themeRoot);
        shelljs.cp(theme.location, themeRoot);
        break;
      case 'package':
        const target = path.join(themeRoot, 'packages', theme.name);
        shelljs.mkdir('-p', target);
        shelljs.cp('-r', path.join(theme.location, '*'), target);
    }
  }

  // generate toc
  let relativeTocPath: string | undefined;
  if (toc) {
    if (typeof toc === 'string') {
      relativeTocPath = path.relative(entryContextDir, toc);
      shelljs.cp(toc, path.join(workspaceDir, relativeTocPath));
    } else {
      relativeTocPath = 'toc.html';
      const tocString = generateToC(entries, workspaceDir);
      fs.writeFileSync(path.join(workspaceDir, relativeTocPath), tocString);
    }
  }

  // generate manifest
  generateManifest(manifestPath, entryContextDir, {
    title: projectTitle,
    author: projectAuthor,
    language,
    toc: relativeTocPath,
    cover: cover && path.relative(entryContextDir, cover),
    entries: entries.map((entry) => ({
      title: entry.title,
      path: path.relative(workspaceDir, entry.target),
    })),
    modified: new Date().toISOString(),
  });
}

export async function copyAssets({
  entryContextDir,
  workspaceDir,
  includeAssets,
}: MergedConfig): Promise<void> {
  if (entryContextDir === workspaceDir) {
    return;
  }
  const relWorkspaceDir = path.relative(entryContextDir, workspaceDir);
  const assets = await globby(includeAssets, {
    cwd: entryContextDir,
    ignore: relWorkspaceDir ? [path.join(relWorkspaceDir, '**/*')] : undefined,
    caseSensitiveMatch: false,
    followSymbolicLinks: false,
    gitignore: true,
  });
  debug('assets', assets);
  for (const asset of assets) {
    const target = path.join(workspaceDir, asset);
    shelljs.mkdir('-p', path.dirname(target));
    shelljs.cp(path.resolve(entryContextDir, asset), target);
  }
}

export function checkOverwriteViolation(
  { entryContextDir, workspaceDir }: MergedConfig,
  target: string,
  fileInformation: string,
) {
  if (!path.relative(target, entryContextDir).startsWith('..')) {
    throw new Error(
      `${target} is set as output destination of ${fileInformation}, however, this output path will overwrite the manuscript file(s). Please specify other paths.`,
    );
  }
  if (!path.relative(target, workspaceDir).startsWith('..')) {
    throw new Error(
      `${target} is set as output destination of ${fileInformation}, however, this output path will overwrite the working directory of Vivliostyle. Please specify other paths.`,
    );
  }
}
