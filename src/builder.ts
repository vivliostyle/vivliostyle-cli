import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import shelljs from 'shelljs';
import { JSDOM } from 'jsdom';
import h from 'hastscript';
import toHTML from 'hast-util-to-html';
import vfile, { VFile } from 'vfile';
import { StringifyMarkdownOptions, VFM } from '@vivliostyle/vfm';

import { debug } from './util';
import { Entry, ctxPath, ParsedTheme, parseTheme } from './config';

export interface VSFile extends VFile {
  data: {
    title?: string;
    theme?: string;
  };
}

export interface ParsedEntry {
  type: 'markdown' | 'html';
  title?: string;
  theme?: ParsedTheme;
  source: { path: string; dir: string };
  target: { path: string; dir: string };
}

export interface ManifestOption {
  title?: string;
  author?: string;
  language?: string;
  modified: string;
  entries: Entry[];
  toc?: boolean | string;
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

export function processMarkdown(
  filepath: string,
  options: StringifyMarkdownOptions = {},
): VSFile {
  const vfm = VFM(options);
  const processed = vfm.processSync(
    vfile({ path: filepath, contents: fs.readFileSync(filepath, 'utf8') }),
  ) as VSFile;
  return processed;
}

export function buildArtifacts({
  contextDir,
  artifactDir,
  projectTitle,
  themeIndex,
  rawEntries,
  distDir,
  projectAuthor,
  language,
  toc,
}: {
  contextDir: string;
  artifactDir: string;
  projectTitle: any;
  themeIndex: ParsedTheme[];
  rawEntries: (string | Entry)[];
  distDir: string;
  projectAuthor: any;
  language: string;
  toc: string | boolean;
}) {
  function normalizeEnry(e: string | Entry): Entry {
    if (typeof e === 'object') {
      return e;
    }
    return { path: e };
  }

  function parseMetadata(type: string, sourcePath: string) {
    let title: string | undefined;
    let theme: ParsedTheme | undefined;
    if (type === 'markdown') {
      const file = processMarkdown(sourcePath);
      title = file.data.title;
      theme = parseTheme(file.data.theme);
    } else {
      const {
        window: { document },
      } = new JSDOM(fs.readFileSync(sourcePath));
      title = document.querySelector('title')?.textContent || undefined;
      const link = document.querySelector<HTMLLinkElement>(
        'link[rel="stylesheet"]',
      );
      theme = parseTheme(link?.href);
    }
    return { title, theme };
  }

  function parseEntry(entry: Entry): ParsedEntry {
    const sourcePath = path.resolve(contextDir, entry.path); // abs
    const sourceDir = path.dirname(sourcePath); // abs
    const contextEntryPath = path.relative(contextDir, sourcePath); // rel
    const targetPath = path
      .resolve(artifactDir, contextEntryPath)
      .replace(/\.md$/, '.html');
    const targetDir = path.dirname(targetPath);
    const type = sourcePath.endsWith('.html') ? 'html' : 'markdown';

    const metadata = parseMetadata(type, sourcePath);

    const title = entry.title || metadata.title || projectTitle;
    const theme = parseTheme(entry.theme) || metadata.theme || themeIndex[0];

    if (theme && themeIndex.every((t) => t.name !== theme.name)) {
      themeIndex.push(theme);
    }

    return {
      type,
      source: { path: sourcePath, dir: sourceDir },
      target: { path: targetPath, dir: targetDir },
      title,
      theme,
    };
  }

  // parse entry items
  const entries: ParsedEntry[] = rawEntries.map(normalizeEnry).map(parseEntry);

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

  // cleanup dist
  shelljs.rm('-rf', distDir);
  shelljs.mkdir('-p', artifactDir);

  // populate entries
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
      const file = processMarkdown(entry.source.path, { stylesheet });
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
      shelljs.cp(ctxPath(contextDir, toc)!, distTocPath);
    } else {
      const tocString = generateToC(entries, distDir);
      fs.writeFileSync(distTocPath, tocString);
    }
  }
  return manifestPath;
}
