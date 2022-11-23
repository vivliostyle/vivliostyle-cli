import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import betterAjvErrors from 'better-ajv-errors';
import chalk from 'chalk';
import fs from 'fs';
import globby from 'globby';
import { imageSize } from 'image-size';
import { lookup as mime } from 'mime-types';
import shelljs from 'shelljs';
import path from 'upath';
import {
  ManuscriptEntry,
  MergedConfig,
  ParsedTheme,
  WebPublicationManifestConfig,
} from './config';
import { TOC_TITLE } from './const';
import { generateTocHtml, isTocHtml, processManuscriptHtml } from './html';
import { processMarkdown } from './markdown';
import type {
  PublicationLinks,
  PublicationManifest,
} from './schema/publication.schema';
import { publicationSchema, publicationSchemas } from './schema/pubManifest';
import type { ArticleEntryObject } from './schema/vivliostyleConfig.schema';
import {
  checkThemeInstallationNecessity,
  installThemeDependencies,
} from './theme';
import {
  debug,
  DetailError,
  filterRelevantAjvErrors,
  log,
  pathContains,
  pathEquals,
  startLogging,
  useTmpDirectory,
} from './util';

function locateThemePath(theme: ParsedTheme, from: string): string {
  if (theme.type === 'uri') {
    return theme.location;
  }
  if (theme.type === 'file') {
    return path.relative(from, theme.location);
  }
  const pkgJsonPath = path.join(theme.location, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const maybeStyle =
    packageJson?.vivliostyle?.theme?.style ??
    packageJson.style ??
    packageJson.main;
  if (!maybeStyle) {
    throw new DetailError(
      `Could not find a style file for the theme: ${theme.name}.`,
      'Please ensure this package satisfies a `vivliostyle.theme.style` propertiy.',
    );
  }
  return path.relative(from, path.join(theme.location, maybeStyle));
}

export async function cleanupWorkspace({
  entryContextDir,
  workspaceDir,
  themesDir,
}: MergedConfig) {
  if (
    pathEquals(workspaceDir, entryContextDir) ||
    pathContains(workspaceDir, entryContextDir)
  ) {
    return;
  }
  // workspaceDir is placed on different directory; delete everything excepting theme files
  debug('cleanup workspace files', workspaceDir);
  let movedThemePath: string | undefined;
  if (pathContains(workspaceDir, themesDir) && fs.existsSync(themesDir)) {
    [movedThemePath] = await useTmpDirectory();
    shelljs.mv(themesDir, movedThemePath);
  }
  shelljs.rm('-rf', workspaceDir);
  if (movedThemePath) {
    shelljs.mkdir('-p', workspaceDir);
    shelljs.mv(
      path.join(movedThemePath, path.basename(themesDir)),
      workspaceDir,
    );
  }
}

export async function prepareThemeDirectory({
  themesDir,
  themeIndexes,
}: MergedConfig) {
  // install theme packages
  if (await checkThemeInstallationNecessity({ themesDir, themeIndexes })) {
    startLogging('Installing theme files');
    await installThemeDependencies({ themesDir, themeIndexes });
  }

  // copy theme files
  for (const theme of themeIndexes) {
    if (theme.type === 'file' && !pathEquals(theme.source, theme.location)) {
      shelljs.mkdir('-p', path.dirname(theme.location));
      shelljs.cp(theme.source, theme.location);
    }
  }
}

// https://www.w3.org/TR/pub-manifest/
export function generateManifest(
  outputPath: string,
  entryContextDir: string,
  options: {
    title?: string;
    author?: string;
    language?: string | null;
    readingProgression?: 'ltr' | 'rtl';
    modified: string;
    entries: ArticleEntryObject[];
    cover?: string;
  },
) {
  const entries: PublicationLinks[] = options.entries.map((entry) => ({
    url: encodeURI(entry.path),
    name: entry.title,
    ...(entry.encodingFormat && { encodingFormat: entry.encodingFormat }),
    ...(entry.rel && { rel: entry.rel }),
    ...(entry.rel === 'contents' && { type: 'LinkedResource' }),
  }));
  const links: PublicationLinks[] = [];
  const resources: PublicationLinks[] = [];

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
          url: encodeURI(options.cover),
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
    ...(options.language && { inLanguage: options.language }),
    ...(options.readingProgression && {
      readingProgression: options.readingProgression,
    }),
    dateModified: options.modified,
    name: options.title,
    readingOrder: entries,
    resources,
    links,
  };

  const publicationJson = JSON.stringify(publication, null, 2);
  fs.writeFileSync(outputPath, publicationJson);
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  ajv.addSchema(publicationSchemas);
  const validate = ajv.compile(publicationSchema);
  const valid = validate(publication);
  if (!valid) {
    const message = `Validation of pubManifest failed. Please check the schema: ${outputPath}`;
    const detailMessage =
      validate.errors &&
      betterAjvErrors(
        publicationSchemas,
        publication,
        filterRelevantAjvErrors(validate.errors),
        {
          json: publicationJson,
        },
      );
    throw detailMessage
      ? new DetailError(message, detailMessage)
      : new Error(message);
  }
}

export async function compile({
  entryContextDir,
  workspaceDir,
  manifestPath,
  manifestAutoGenerate,
  entries,
  language,
  readingProgression,
  cover,
  vfmOptions,
}: MergedConfig & WebPublicationManifestConfig): Promise<void> {
  const generativeContentsEntry = entries.find(
    (e) => !('source' in e) && e.rel === 'contents',
  );
  if (
    generativeContentsEntry &&
    fs.existsSync(generativeContentsEntry.target) &&
    !isTocHtml(generativeContentsEntry.target)
  ) {
    throw new Error(
      `${generativeContentsEntry.target} is set as a destination to create a ToC HTML file, but there is already a document other than the ToC file in this location. Please move this file, or set a 'toc' option in vivliostyle.config.js to specify another destination for the ToC file.`,
    );
  }

  const contentEntries = entries.filter(
    (e): e is ManuscriptEntry => 'source' in e,
  );
  for (const entry of contentEntries) {
    shelljs.mkdir('-p', path.dirname(entry.target));

    // calculate style path
    const style =
      entry.theme && locateThemePath(entry.theme, path.dirname(entry.target));
    if (entry.type === 'text/markdown') {
      // compile markdown
      const vfile = processMarkdown(entry.source, {
        ...vfmOptions,
        style,
        title: entry.title,
        language: language ?? undefined,
      });
      const compiledEntry = String(vfile);
      fs.writeFileSync(entry.target, compiledEntry);
    } else if (
      entry.type === 'text/html' ||
      entry.type === 'application/xhtml+xml'
    ) {
      if (!pathEquals(entry.source, entry.target)) {
        const html = processManuscriptHtml(entry.source, {
          style,
          title: entry.title,
          contentType: entry.type,
          language,
        });
        fs.writeFileSync(entry.target, html);
      }
    } else {
      if (!pathEquals(entry.source, entry.target)) {
        shelljs.cp(entry.source, entry.target);
      }
    }
  }

  // generate toc
  if (generativeContentsEntry) {
    const style =
      generativeContentsEntry.theme &&
      locateThemePath(generativeContentsEntry.theme, workspaceDir);
    const tocString = generateTocHtml({
      entries: contentEntries,
      manifestPath,
      distDir: path.dirname(generativeContentsEntry.target),
      title: manifestAutoGenerate?.title,
      tocTitle: generativeContentsEntry.title ?? TOC_TITLE,
      style,
    });
    fs.writeFileSync(generativeContentsEntry.target, tocString);
  }

  // generate manifest
  if (manifestAutoGenerate) {
    generateManifest(manifestPath, entryContextDir, {
      ...manifestAutoGenerate,
      language,
      readingProgression,
      cover: cover && path.relative(entryContextDir, cover),
      entries: entries.map((entry) => ({
        title: entry.title,
        path: path.relative(workspaceDir, entry.target),
        encodingFormat:
          !('type' in entry) ||
          entry.type === 'text/markdown' ||
          entry.type === 'text/html'
            ? undefined
            : entry.type,
        rel: entry.rel,
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
  if (pathEquals(entryContextDir, workspaceDir)) {
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
  if (pathContains(target, entryContextDir)) {
    throw new Error(
      `${target} is set as output destination of ${fileInformation}, however, this output path will overwrite the manuscript file(s). Please specify other paths.`,
    );
  }
  if (pathContains(target, workspaceDir)) {
    throw new Error(
      `${target} is set as output destination of ${fileInformation}, however, this output path will overwrite the working directory of Vivliostyle. Please specify other paths.`,
    );
  }
}
