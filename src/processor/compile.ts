import jsdom, { JSDOM } from '@vivliostyle/jsdom';
import { copy, move } from 'fs-extra/esm';
import fs from 'node:fs';
import picomatch from 'picomatch';
import { glob } from 'tinyglobby';
import upath from 'upath';
import serializeToXml from 'w3c-xmlserializer';
import MIMEType from 'whatwg-mimetype';
import {
  ContentsEntry,
  CoverEntry,
  ManuscriptEntry,
  ParsedEntry,
  ParsedTheme,
  ResolvedTaskConfig,
  WebPublicationManifestConfig,
} from '../config/resolve.js';
import type { ArticleEntryConfig } from '../config/schema.js';
import { XML_DECLARATION } from '../const.js';
import { Logger } from '../logger.js';
import { writePublicationManifest } from '../output/webbook.js';
import {
  DetailError,
  pathContains,
  pathEquals,
  registerExitHandler,
  writeFileIfChanged,
} from '../util.js';
import {
  createVirtualConsole,
  generateDefaultCoverHtml,
  generateDefaultTocHtml,
  getJsdomFromString,
  getJsdomFromUrlOrFile,
  processCoverHtml,
  processManuscriptHtml,
  processTocHtml,
  ResourceLoader,
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
        'Please ensure this package satisfies a `vivliostyle.theme.style` property.',
      );
    }
    return upath.relative(from, upath.join(theme.location, maybeStyle));
  }
}

export async function cleanupWorkspace({
  entryContextDir,
  workspaceDir,
  themesDir,
  entries,
}: ResolvedTaskConfig) {
  if (
    pathEquals(workspaceDir, entryContextDir) ||
    pathContains(workspaceDir, entryContextDir) ||
    entries.some(
      (entry) =>
        entry.source?.type === 'file' &&
        pathContains(workspaceDir, entry.source.pathname),
    )
  ) {
    return;
  }
  // workspaceDir is placed on different directory; delete everything excepting theme files
  Logger.debug('cleanup workspace files', workspaceDir);
  let movedWorkspacePath: string | undefined;
  if (pathContains(workspaceDir, themesDir) && fs.existsSync(themesDir)) {
    movedWorkspacePath = upath.join(
      upath.dirname(workspaceDir),
      `.vs-${Date.now()}`,
    );
    const movedThemePath = upath.join(
      movedWorkspacePath,
      upath.relative(workspaceDir, themesDir),
    );
    fs.mkdirSync(upath.dirname(movedThemePath), { recursive: true });
    registerExitHandler(
      `Removing the moved workspace directory: ${movedWorkspacePath}`,
      () => {
        if (movedWorkspacePath && fs.existsSync(movedWorkspacePath)) {
          fs.rmSync(movedWorkspacePath, { recursive: true, force: true });
        }
      },
    );
    await move(themesDir, movedThemePath);
  }
  await fs.promises.rm(workspaceDir, { recursive: true, force: true });
  if (movedWorkspacePath) {
    await move(movedWorkspacePath, workspaceDir);
  }
}

export async function prepareThemeDirectory({
  themesDir,
  themeIndexes,
}: ResolvedTaskConfig) {
  // Backward compatibility: v8 to v9
  if (
    fs.existsSync(upath.join(themesDir, 'packages')) &&
    !fs.existsSync(upath.join(themesDir, 'node_modules'))
  ) {
    fs.renameSync(
      upath.join(themesDir, 'packages'),
      upath.join(themesDir, 'node_modules'),
    );
  }

  // install theme packages
  if (await checkThemeInstallationNecessity({ themesDir, themeIndexes })) {
    Logger.startLogging('Installing theme files');
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

export async function transformManuscript(
  entry: ParsedEntry,
  {
    entryContextDir,
    workspaceDir,
    viewerInput: { manifestPath },
    title,
    entries,
    language,
    documentProcessorFactory,
    vfmOptions,
    rootUrl,
  }: ResolvedTaskConfig & { viewerInput: WebPublicationManifestConfig },
): Promise<string | undefined> {
  const source =
    entry.rel === 'contents' || entry.rel === 'cover'
      ? (entry as ContentsEntry | CoverEntry).template
      : (entry as ManuscriptEntry).source;
  let content: JSDOM | undefined;
  let resourceLoader: ResourceLoader | undefined;
  let resourceUrl: string | undefined;

  // calculate style path
  const style = entry.themes.flatMap((theme) =>
    locateThemePath(theme, upath.dirname(entry.target)),
  );

  if (source?.type === 'file') {
    if (source.contentType === 'text/markdown') {
      // compile markdown
      const vfile = await processMarkdown(
        documentProcessorFactory,
        source.pathname,
        {
          ...vfmOptions,
          style,
          title: entry.title,
          language: language ?? undefined,
        },
      );
      content = getJsdomFromString({ html: String(vfile) });
    } else if (
      source.contentType === 'text/html' ||
      source.contentType === 'application/xhtml+xml'
    ) {
      content = await getJsdomFromUrlOrFile({ src: source.pathname });
      content = await processManuscriptHtml(content, {
        style,
        title: entry.title,
        contentType: source.contentType,
        language,
      });
    } else {
      if (!pathEquals(source.pathname, entry.target)) {
        await copy(source.pathname, entry.target);
      }
    }
  } else if (source?.type === 'uri') {
    resourceUrl = /^https?:/.test(source.href)
      ? source.href
      : `${rootUrl}${source.href}`;
    resourceLoader = new ResourceLoader();
    try {
      await getJsdomFromUrlOrFile({
        src: resourceUrl,
        resourceLoader,
        virtualConsole: createVirtualConsole((error) => {
          Logger.logError(`Failed to fetch resources: ${error.detail}`);
        }),
      });
    } catch (error: any) {
      throw new DetailError(
        `Failed to fetch the content from ${resourceUrl}`,
        error.stack ?? error.message,
      );
    }

    const contentFetcher = resourceLoader.fetcherMap.get(resourceUrl);
    if (contentFetcher) {
      const buffer = await contentFetcher;
      const contentType = contentFetcher.response?.headers['content-type'];
      if (!contentType || new MIMEType(contentType).essence !== 'text/html') {
        throw new Error(`The content is not an HTML document: ${resourceUrl}`);
      }
      content = getJsdomFromString({ html: buffer.toString('utf8') });
      content = await processManuscriptHtml(content, {
        style,
        title: entry.title,
        contentType: 'text/html',
        language,
      });
    }
  } else if (entry.rel === 'contents') {
    content = getJsdomFromString({
      html: generateDefaultTocHtml({
        language,
        title,
      }),
    });
    content = await processManuscriptHtml(content, {
      style,
      title,
      contentType: 'text/html',
      language,
    });
  } else if (entry.rel === 'cover') {
    content = getJsdomFromString({
      html: generateDefaultCoverHtml({ language, title: entry.title }),
    });
    content = await processManuscriptHtml(content, {
      style,
      title: entry.title,
      contentType: 'text/html',
      language,
    });
  }

  if (!content) {
    return;
  }

  if (entry.rel === 'contents') {
    const contentsEntry = entry as ContentsEntry;
    const manuscriptEntries = entries.filter(
      (e): e is ManuscriptEntry => 'source' in e,
    );
    content = await processTocHtml(content, {
      entries: manuscriptEntries,
      manifestPath,
      distDir: upath.dirname(contentsEntry.target),
      tocTitle: contentsEntry.tocTitle,
      sectionDepth: contentsEntry.sectionDepth,
      styleOptions: contentsEntry,
      transform: contentsEntry.transform,
    });
  }

  if (entry.rel === 'cover') {
    const coverEntry = entry as CoverEntry;
    content = await processCoverHtml(content, {
      imageSrc: upath.relative(
        upath.join(
          entryContextDir,
          upath.relative(workspaceDir, coverEntry.target),
          '..',
        ),
        coverEntry.coverImageSrc,
      ),
      imageAlt: coverEntry.coverImageAlt,
      styleOptions: coverEntry,
    });
  }

  let html;
  if (content.window.document.contentType === 'application/xhtml+xml') {
    html = `${XML_DECLARATION}\n${serializeToXml(content.window.document)}`;
  } else {
    html = content.serialize();
  }
  const htmlBuffer = Buffer.from(html, 'utf8');
  if (
    !source ||
    (source.type === 'file' && !pathEquals(source.pathname, entry.target))
  ) {
    writeFileIfChanged(entry.target, htmlBuffer);
  }

  if (source?.type === 'uri' && resourceLoader && resourceUrl) {
    const { response } = resourceLoader.fetcherMap.get(resourceUrl)!;
    const contentFetcher = Promise.resolve(
      htmlBuffer,
    ) as jsdom.AbortablePromise<Buffer>;
    contentFetcher.abort = () => {};
    contentFetcher.response = response;
    resourceLoader.fetcherMap.set(resourceUrl, contentFetcher);

    await ResourceLoader.saveFetchedResources({
      fetcherMap: resourceLoader.fetcherMap,
      rootUrl: resourceUrl,
      outputDir: source.rootDir,
    });
  }

  return html;
}

export async function generateManifest({
  entryContextDir,
  workspaceDir,
  viewerInput: { manifestPath },
  title,
  author,
  entries,
  language,
  readingProgression,
  cover,
}: ResolvedTaskConfig & { viewerInput: WebPublicationManifestConfig }) {
  const manifestEntries: ArticleEntryConfig[] = entries.map((entry) => ({
    title:
      (entry.rel === 'contents' && (entry as ContentsEntry).tocTitle) ||
      entry.title,
    path: upath.relative(workspaceDir, entry.target),
    encodingFormat:
      !('contentType' in entry) ||
      entry.contentType === 'text/markdown' ||
      entry.contentType === 'text/html'
        ? undefined
        : entry.contentType,
    rel: entry.rel,
  }));
  writePublicationManifest(manifestPath, {
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

export async function compile(
  config: ResolvedTaskConfig & { viewerInput: WebPublicationManifestConfig },
): Promise<void> {
  const tocEntries: ParsedEntry[] = [];
  for (const entry of config.entries) {
    if (entry.rel === 'contents') {
      // To transpile the table of contents, all dependent entries must be transpiled in advance
      tocEntries.push(entry);
      continue;
    }
    await transformManuscript(entry, config);
  }
  for (const entry of tocEntries) {
    await transformManuscript(entry, config);
  }

  // generate manifest
  if (config.viewerInput.needToGenerateManifest) {
    await generateManifest(config);
  }
}

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
  cwd,
  ignore = [],
}: Pick<
  ResolvedTaskConfig,
  'copyAsset' | 'outputs' | 'themesDir' | 'entries'
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
      patterns: includes,
      ignore: ignorePatterns,
    },
  ];
}

export function getAssetMatcher(
  arg: Parameters<typeof getAssetMatcherSettings>[0],
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
