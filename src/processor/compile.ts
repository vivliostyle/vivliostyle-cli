import chalk from 'chalk';
import { lookup as mime } from 'mime-types';
import fs from 'node:fs';
import {
  ContentsEntry,
  CoverEntry,
  ManuscriptEntry,
  MergedConfig,
  ParsedTheme,
  WebPublicationManifestConfig,
} from '../input/config.js';
import type { ArticleEntryObject } from '../input/schema.js';
import type {
  PublicationLinks,
  PublicationManifest,
  URL as PublicationURL,
} from '../schema/publication.schema.js';
import {
  DetailError,
  assertPubManifestSchema,
  copy,
  debug,
  log,
  pathContains,
  pathEquals,
  remove,
  safeGlob,
  startLogging,
  upath,
  useTmpDirectory,
} from '../util.js';
import {
  generateDefaultCoverHtml,
  generateDefaultTocHtml,
  processCoverHtml,
  processManuscriptHtml,
  processTocHtml,
} from './html.js';
import { processMarkdown } from './markdown.js';
import {
  checkThemeInstallationNecessity,
  installThemeDependencies,
} from './theme.js';

function locateThemePath(theme: ParsedTheme, from: string): string | string[] {
  if (theme.type === 'uri') {
    return theme.location;
  }
  if (theme.type === 'file') {
    return upath.relative(from, theme.location);
  }
  if (theme.importPath) {
    return [theme.importPath].flat().map((locator) => {
      const resolvedPath = upath.resolve(theme.location, locator);
      if (
        !pathContains(theme.location, resolvedPath) ||
        !fs.existsSync(resolvedPath)
      ) {
        throw new Error(
          `Could not find a style path ${theme.importPath} for the theme: ${theme.name}.`,
        );
      }
      return upath.relative(from, resolvedPath);
    });
  } else {
    const pkgJsonPath = upath.join(theme.location, 'package.json');
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
    return upath.relative(from, upath.join(theme.location, maybeStyle));
  }
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
    await copy(themesDir, movedThemePath);
  }
  await remove(workspaceDir);
  if (movedThemePath) {
    fs.mkdirSync(upath.dirname(themesDir), { recursive: true });
    await copy(movedThemePath, themesDir);
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
      fs.mkdirSync(upath.dirname(theme.location), { recursive: true });
      await copy(theme.source, theme.location);
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
    language?: string;
    readingProgression?: 'ltr' | 'rtl';
    modified: string;
    entries: ArticleEntryObject[];
    cover?: {
      url: string;
      name: string;
    };
    links?: (PublicationURL | PublicationLinks)[];
    resources?: (PublicationURL | PublicationLinks)[];
  },
): PublicationManifest {
  const entries: PublicationLinks[] = options.entries.map((entry) => ({
    url: encodeURI(entry.path),
    ...(entry.title && { name: entry.title }),
    ...(entry.encodingFormat && { encodingFormat: entry.encodingFormat }),
    ...(entry.rel && { rel: entry.rel }),
    ...((entry.rel === 'contents' || entry.rel === 'cover') && {
      type: 'LinkedResource',
    }),
  }));
  const links: (PublicationURL | PublicationLinks)[] = [
    options.links || [],
  ].flat();
  const resources: (PublicationURL | PublicationLinks)[] = [
    options.resources || [],
  ].flat();

  if (options.cover) {
    const mimeType = mime(options.cover.url);
    if (mimeType) {
      resources.push({
        rel: 'cover',
        url: encodeURI(options.cover.url),
        name: options.cover.name,
        encodingFormat: mimeType,
      });
    } else {
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
    ...(options.title && { name: options.title }),
    ...(options.author && { author: options.author }),
    ...(options.language && { inLanguage: options.language }),
    ...(options.readingProgression && {
      readingProgression: options.readingProgression,
    }),
    dateModified: options.modified,
    readingOrder: entries,
    resources,
    links,
  };

  try {
    assertPubManifestSchema(publication);
  } catch (error) {
    const thrownError = error as Error | string;
    throw new DetailError(
      `Validation of pubManifest failed. Please check the schema: ${outputPath}`,
      typeof thrownError === 'string'
        ? thrownError
        : (thrownError.stack ?? thrownError.message),
    );
  }
  const publicationJson = JSON.stringify(publication, null, 2);
  fs.writeFileSync(outputPath, publicationJson);
  return publication;
}

export async function compile({
  entryContextDir,
  workspaceDir,
  manifestPath,
  needToGenerateManifest,
  title,
  author,
  entries,
  language,
  readingProgression,
  cover,
  vfmOptions,
}: MergedConfig & WebPublicationManifestConfig): Promise<void> {
  const manuscriptEntries = entries.filter(
    (e): e is ManuscriptEntry => 'source' in e,
  );
  const processedTocEntries: { entry: ContentsEntry; content: string }[] = [];
  const processedCoverEntries: { entry: CoverEntry; content: string }[] = [];

  for (const entry of entries) {
    const { source, type } =
      entry.rel === 'contents' || entry.rel === 'cover'
        ? (entry as ContentsEntry | CoverEntry).template || {}
        : (entry as ManuscriptEntry);
    let content: string;

    // calculate style path
    const style = entry.themes.flatMap((theme) =>
      locateThemePath(theme, upath.dirname(entry.target)),
    );

    if (source && type) {
      if (type === 'text/markdown') {
        // compile markdown
        const vfile = processMarkdown(source, {
          ...vfmOptions,
          style,
          title: entry.title,
          language: language ?? undefined,
        });
        content = String(vfile);
      } else if (type === 'text/html' || type === 'application/xhtml+xml') {
        content = fs.readFileSync(source, 'utf8');
        content = processManuscriptHtml(content, {
          style,
          title: entry.title,
          contentType: type,
          language,
        });
      } else {
        if (!pathEquals(source, entry.target)) {
          await copy(source, entry.target);
        }
        continue;
      }
    } else if (entry.rel === 'contents') {
      content = generateDefaultTocHtml({
        language,
        title,
      });
      content = processManuscriptHtml(content, {
        style,
        title,
        contentType: 'text/html',
        language,
      });
    } else if (entry.rel === 'cover') {
      content = generateDefaultCoverHtml({ language, title: entry.title });
      content = processManuscriptHtml(content, {
        style,
        title: entry.title,
        contentType: 'text/html',
        language,
      });
    } else {
      continue;
    }

    if (entry.rel === 'contents') {
      processedTocEntries.push({
        entry: entry as ContentsEntry,
        content,
      });
      continue;
    } else if (entry.rel === 'cover') {
      processedCoverEntries.push({
        entry: entry as CoverEntry,
        content,
      });
      continue;
    }

    if (!source || !pathEquals(source, entry.target)) {
      fs.mkdirSync(upath.dirname(entry.target), { recursive: true });
      fs.writeFileSync(entry.target, content);
    }
  }

  for (const { entry, content } of processedTocEntries) {
    const transformedContent = await processTocHtml(content, {
      entries: manuscriptEntries,
      manifestPath,
      distDir: upath.dirname(entry.target),
      tocTitle: entry.tocTitle,
      sectionDepth: entry.sectionDepth,
      styleOptions: entry,
      transform: entry.transform,
    });
    fs.mkdirSync(upath.dirname(entry.target), { recursive: true });
    fs.writeFileSync(entry.target, transformedContent);
  }

  for (const { entry, content } of processedCoverEntries) {
    const transformedContent = await processCoverHtml(content, {
      imageSrc: upath.relative(
        upath.join(
          entryContextDir,
          upath.relative(workspaceDir, entry.target),
          '..',
        ),
        entry.coverImageSrc,
      ),
      imageAlt: entry.coverImageAlt,
      styleOptions: entry,
    });
    fs.mkdirSync(upath.dirname(entry.target), { recursive: true });
    fs.writeFileSync(entry.target, transformedContent);
  }

  // generate manifest
  if (needToGenerateManifest) {
    const manifestEntries: ArticleEntryObject[] = entries.map((entry) => ({
      title:
        (entry.rel === 'contents' && (entry as ContentsEntry).tocTitle) ||
        entry.title,
      path: upath.relative(workspaceDir, entry.target),
      encodingFormat:
        !('type' in entry) ||
        entry.type === 'text/markdown' ||
        entry.type === 'text/html'
          ? undefined
          : entry.type,
      rel: entry.rel,
    }));
    generateManifest(manifestPath, entryContextDir, {
      title,
      author,
      language,
      readingProgression,
      cover: cover && {
        url: upath.relative(entryContextDir, cover.src),
        name: cover.name,
      },
      entries: manifestEntries,
      modified: new Date().toISOString(),
    });
  }
}

export function getDefaultIgnorePatterns({
  themesDir,
  cwd,
}: Pick<MergedConfig, 'themesDir'> & {
  cwd: string;
}): string[] {
  const ignorePatterns = [
    // ignore node_modules directory
    '**/node_modules',
  ];
  if (pathContains(cwd, themesDir)) {
    // ignore example files of theme packages
    ignorePatterns.push(
      `${upath.relative(cwd, themesDir)}/packages/*/example`,
      `${upath.relative(cwd, themesDir)}/packages/*/*/example`,
    );
  }
  return ignorePatterns;
}

export function getAutoGeneratedAssetPatterns({
  outputs,
  cwd,
}: Pick<MergedConfig, 'outputs'> & {
  cwd: string;
}): string[] {
  return outputs.flatMap(({ format, path: p }) =>
    !pathContains(cwd, p)
      ? []
      : format === 'webpub'
        ? upath.join(upath.relative(cwd, p), '**')
        : upath.relative(cwd, p),
  );
}

export async function globAssetFiles({
  copyAsset: { fileExtensions, includes, excludes },
  outputs,
  themesDir,
  cwd,
  ignore = [],
}: Pick<MergedConfig, 'copyAsset' | 'outputs' | 'themesDir'> & {
  cwd: string;
  ignore?: string[];
}): Promise<Set<string>> {
  const ignorePatterns = [
    ...ignore,
    ...excludes,
    ...getAutoGeneratedAssetPatterns({ outputs, cwd }),
  ];
  const weakIgnorePatterns = getDefaultIgnorePatterns({ themesDir, cwd });
  debug('globAssetFiles > ignorePatterns', ignorePatterns);
  debug('globAssetFiles > weakIgnorePatterns', weakIgnorePatterns);

  const assets = new Set([
    // Step 1: Glob files with an extension in `fileExtension`
    // Ignore files in node_modules directory, theme example files and files matched `excludes`
    ...(await safeGlob(
      fileExtensions.map((ext) => `**/*.${ext}`),
      {
        cwd,
        ignore: [...ignorePatterns, ...weakIgnorePatterns],
        followSymbolicLinks: true,
        gitignore: false,
      },
    )),
    // Step 2: Glob files matched with `includes`
    // Ignore only files matched `excludes`
    ...(await safeGlob(includes, {
      cwd,
      ignore: ignorePatterns,
      followSymbolicLinks: true,
      gitignore: false,
    })),
  ]);
  return assets;
}

export async function copyAssets({
  entryContextDir,
  workspaceDir,
  copyAsset,
  outputs,
  themesDir,
}: MergedConfig): Promise<void> {
  if (pathEquals(entryContextDir, workspaceDir)) {
    return;
  }
  const relWorkspaceDir = upath.relative(entryContextDir, workspaceDir);
  const assets = await globAssetFiles({
    copyAsset,
    cwd: entryContextDir,
    outputs,
    themesDir,
    ignore: [
      // don't copy workspace itself
      ...(relWorkspaceDir ? [upath.join(relWorkspaceDir, '**')] : []),
    ],
  });
  debug('assets', assets);
  for (const asset of assets) {
    const target = upath.join(workspaceDir, asset);
    fs.mkdirSync(upath.dirname(target), { recursive: true });
    await copy(upath.resolve(entryContextDir, asset), target);
  }
}

export function checkOverwriteViolation(
  { entryContextDir, workspaceDir }: MergedConfig,
  target: string,
  fileInformation: string,
) {
  if (
    pathContains(target, entryContextDir) ||
    pathEquals(target, entryContextDir)
  ) {
    throw new Error(
      `${target} is set as output destination of ${fileInformation}, however, this output path will overwrite the manuscript file(s). Please specify other paths.`,
    );
  }
  if (pathContains(target, workspaceDir) || pathEquals(target, workspaceDir)) {
    throw new Error(
      `${target} is set as output destination of ${fileInformation}, however, this output path will overwrite the working directory of Vivliostyle. Please specify other paths.`,
    );
  }
}
