import Ajv from 'ajv';
import chalk from 'chalk';
import fs from 'fs';
import globby from 'globby';
import { imageSize } from 'image-size';
import { lookup as mime } from 'mime-types';
import shelljs from 'shelljs';
import path from 'upath';
import {
  MergedConfig,
  ParsedTheme,
  WebPublicationManifestConfig,
} from './config';
import { generateTocHtml, processManuscriptHtml } from './html';
import { processMarkdown } from './markdown';
import type {
  PublicationLinks,
  PublicationManifest,
} from './schema/pubManifest';
import {
  publicationSchemaId,
  publicationSchemas,
} from './schema/pubManifest.schema';
import type { EntryObject } from './schema/vivliostyle.config';
import { debug, log } from './util';

export interface ManifestOption {
  title?: string;
  author?: string;
  language?: string;
  modified: string;
  entries: EntryObject[];
  toc?: string;
  cover?: string;
}

export function cleanup(location: string) {
  debug('cleanup file', location);
  shelljs.rm('-rf', location);
}

// https://www.w3.org/TR/pub-manifest/
export function generateManifest(
  outputPath: string,
  entryContextDir: string,
  options: ManifestOption,
) {
  const entries: PublicationLinks[] = options.entries.map((entry) => ({
    url: entry.path,
    ...(entry.encodingFormat && { encodingFormat: entry.encodingFormat }),
    title: entry.title,
  }));
  const links: PublicationLinks[] = [];
  const resources: PublicationLinks[] = [];

  if (options.toc) {
    entries.splice(0, 0, {
      url: options.toc,
      rel: 'contents',
      encodingFormat: 'text/html',
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
          url: options.cover,
          encodingFormat: mimeType,
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

  const publication: PublicationManifest = {
    '@context': ['https://schema.org', 'https://www.w3.org/ns/pub-context'],
    type: 'Book',
    conformsTo: 'https://github.com/vivliostyle/vivliostyle-cli',
    author: options.author,
    inLanguage: options.language,
    dateModified: options.modified,
    name: options.title,
    readingOrder: entries,
    resources,
    links,
  };

  fs.writeFileSync(outputPath, JSON.stringify(publication, null, 2));
  const ajv = Ajv();
  ajv.addSchema(publicationSchemas);
  const valid = ajv.validate(publicationSchemaId, publication);
  if (!valid) {
    throw new Error(
      `Validation of pubManifest failed. Please check the schema: ${outputPath}`,
    );
  }
}

export async function compile(
  {
    entryContextDir,
    workspaceDir,
    manifestPath,
    manifestAutoGenerate,
    themeIndexes,
    entries,
    language,
    toc,
    cover,
    input,
  }: MergedConfig & WebPublicationManifestConfig,
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

  const locateThemePath = (
    from: string,
    theme?: ParsedTheme,
  ): string | undefined => {
    switch (theme?.type) {
      case 'uri':
        return theme.location;
      case 'file':
        return path.relative(
          from,
          path.join(workspaceDir, 'themes', theme.name),
        );
      case 'package':
        return path.relative(
          from,
          path.join(
            workspaceDir,
            'themes',
            'packages',
            theme.name,
            theme.style,
          ),
        );
    }
  };

  for (const entry of entries) {
    shelljs.mkdir('-p', path.dirname(entry.target));

    // calculate style path
    const style = locateThemePath(path.dirname(entry.target), entry.theme);
    if (entry.type === 'text/markdown') {
      // compile markdown
      const vfile = processMarkdown(entry.source, {
        style,
        title: entry.title,
      });
      const compiledEntry = String(vfile);
      fs.writeFileSync(entry.target, compiledEntry);
    } else if (
      entry.type === 'text/html' ||
      entry.type === 'application/xhtml+xml'
    ) {
      if (entry.source !== entry.target) {
        const html = processManuscriptHtml(entry.source, {
          style,
          title: entry.title,
          contentType: entry.type,
        });
        fs.writeFileSync(entry.target, html);
      }
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
      const rootTheme = themeIndexes[0];
      const style = locateThemePath(workspaceDir, rootTheme);
      relativeTocPath = 'toc.html';
      const tocString = generateTocHtml({
        entries,
        distDir: workspaceDir,
        style,
      });
      fs.writeFileSync(path.join(workspaceDir, relativeTocPath), tocString);
    }
  }

  // generate manifest
  if (manifestAutoGenerate) {
    generateManifest(manifestPath, entryContextDir, {
      ...manifestAutoGenerate,
      language,
      toc: relativeTocPath,
      cover: cover && path.relative(entryContextDir, cover),
      entries: entries.map((entry) => ({
        title: entry.title,
        path: path.relative(workspaceDir, entry.target),
        encodingFormat:
          entry.type === 'text/markdown' || entry.type === 'text/html'
            ? undefined
            : entry.type,
      })),
      modified: new Date().toISOString(),
    });
  }
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
