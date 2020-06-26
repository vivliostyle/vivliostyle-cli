import chalk from 'chalk';
import fs from 'fs';
import toHTML from 'hast-util-to-html';
import h from 'hastscript';
import path from 'path';
import shelljs from 'shelljs';
import { contextResolve, Entry, MergedConfig, ParsedEntry } from './config';
import { processMarkdown } from './markdown';
import { debug } from './util';

export interface ManifestOption {
  title?: string;
  author?: string;
  language?: string;
  modified: string;
  entries: Entry[];
  toc?: boolean | string;
}

export function cleanup(location: string) {
  shelljs.rm('-rf', location);
}

// example: https://github.com/readium/webpub-manifest/blob/master/examples/MobyDick/manifest.json
export function generateManifest(outputPath: string, options: ManifestOption) {
  const resources = [];
  if (options.toc) {
    resources.push({
      href: 'toc.html',
      rel: 'contents',
      type: 'text/html',
      title: 'Table of Contents',
    });
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
    links: [],
    readingOrder: options.entries.map((entry) => ({
      href: entry.path,
      type: 'text/html',
      title: entry.title,
    })),
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
        { href: path.relative(distDir, entry.target.path) },
        entry.title || path.basename(entry.target.path, '.html'),
      ),
    ),
  );
  const toc = h(
    'html',
    h('body', h('nav#toc', { role: 'doc-toc' }, h('ul', items))),
  );
  return toHTML(toc);
}

export function buildArtifacts({
  entryContextDir,
  artifactDir,
  projectTitle,
  themeIndex,
  entries,
  distDir,
  projectAuthor,
  language,
  toc,
}: MergedConfig) {
  if (entries.length === 0) {
    throw new Error(
      `Missing entry.
Run ${chalk.green.bold('vivliostyle init')} to create ${chalk.bold(
        'vivliostyle.config.js',
      )}`,
    );
  }

  debug(entries);
  debug(themeIndex);

  // populate entries
  shelljs.mkdir('-p', artifactDir);
  for (const entry of entries) {
    shelljs.mkdir('-p', entry.target.dir);

    if (entry.type === 'html') {
      // copy html files
      shelljs.cp(entry.source.path, entry.target.path);
    } else {
      // compile markdown
      const stylesheet = entry.theme
        ? entry.theme.type === 'path'
          ? path.relative(
              entry.target.dir,
              path.join(distDir, entry.theme.name),
            )
          : entry.theme.location
        : undefined;
      const file = processMarkdown(entry.source.path, {
        stylesheet,
        title: entry.title,
      });
      fs.writeFileSync(entry.target.path, String(file));
    }
  }

  // copy theme
  for (const theme of themeIndex) {
    if (theme.type === 'path') {
      shelljs.cp(theme.location, path.join(distDir, theme.name));
    }
  }

  // generate manifest
  const manifestPath = path.join(distDir, 'manifest.json');
  generateManifest(manifestPath, {
    title: projectTitle,
    author: projectAuthor,
    language,
    toc,
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
