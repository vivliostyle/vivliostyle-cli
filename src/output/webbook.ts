import fs from 'node:fs';
import shelljs from 'shelljs';
import path from 'upath';
import MIMEType from 'whatwg-mimetype';
import { MANIFEST_FILENAME } from '../const.js';
import { MergedConfig, WebbookEntryConfig } from '../input/config.js';
import { generateManifest } from '../processor/compile.js';
import {
  ResourceLoader,
  fetchLinkedPublicationManifest,
  getJsdomFromUrlOrFile,
} from '../processor/html.js';
import type {
  PublicationLinks,
  PublicationManifest,
  ResourceCategorization,
} from '../schema/publication.schema.js';
import {
  debug,
  logError,
  logUpdate,
  pathContains,
  pathEquals,
  safeGlob,
} from '../util.js';

export function prepareWebPublicationDirectory({
  outputDir,
}: {
  outputDir: string;
}) {
  if (fs.existsSync(outputDir)) {
    debug('going to remove existing webpub', outputDir);
    shelljs.rm('-rf', outputDir);
  }
  fs.mkdirSync(outputDir, { recursive: true });
}

export async function retrieveWebbookEntry({
  webbookEntryPath,
  outputDir,
}: WebbookEntryConfig & {
  outputDir: string;
}): Promise<{
  entryHtmlFile: string;
  manifest: PublicationManifest | null;
}> {
  if (/^https?:\/\//.test(webbookEntryPath)) {
    logUpdate('Fetching remote contents');
  }
  const resourceLoader = new ResourceLoader();
  const { dom, baseUrl } = await getJsdomFromUrlOrFile(
    webbookEntryPath,
    resourceLoader,
  );
  const manifest = await fetchLinkedPublicationManifest({
    dom,
    resourceLoader,
    baseUrl,
  });
  const rootUrl = /^https?:\/\//.test(baseUrl)
    ? new URL('/', baseUrl).href
    : new URL('.', baseUrl).href;
  const pathContains = (url: string) =>
    !path.posix.relative(rootUrl, url).startsWith('..');
  const retriever = new Map(resourceLoader.fetcherMap);

  if (manifest) {
    [manifest.resources || []].flat().forEach((v) => {
      const url = typeof v === 'string' ? v : v.url;
      const fullUrl = new URL(url, baseUrl).href;
      if (!pathContains(fullUrl) || retriever.has(fullUrl)) {
        return;
      }
      const fetchPromise = resourceLoader.fetch(fullUrl);
      if (fetchPromise && !retriever.has(fullUrl)) {
        retriever.set(fullUrl, fetchPromise);
      }
    });
    for (const v of [manifest.readingOrder || []].flat()) {
      const url = typeof v === 'string' ? v : v.url;
      if (
        !/\.html?$/.test(url) &&
        !(typeof v === 'string' || v.encodingFormat === 'text/html')
      ) {
        continue;
      }
      const fullUrl = new URL(url, baseUrl).href;
      if (!pathContains(fullUrl) || fullUrl === baseUrl) {
        continue;
      }
      const subpathResourceLoader = new ResourceLoader();
      await getJsdomFromUrlOrFile(fullUrl, subpathResourceLoader);
      subpathResourceLoader.fetcherMap.forEach(
        (v, k) => !retriever.has(k) && retriever.set(k, v),
      );
    }
  }

  const normalizeToLocalPath = (urlString: string, mimeType?: string) => {
    const url = new URL(urlString);
    url.hash = '';
    let relTarget = path.posix.relative(rootUrl, url.href);
    if (!relTarget || (mimeType === 'text/html' && !path.extname(relTarget))) {
      relTarget = path.join(relTarget, 'index.html');
    }
    return relTarget;
  };
  const fetchedResources: { url: string; encodingFormat?: string }[] = [];
  await Promise.allSettled(
    Array.from(retriever.entries()).flatMap(([url, fetcher]) => {
      if (!pathContains(url)) {
        return [];
      }
      return fetcher
        .then(async (buffer) => {
          let encodingFormat: string | undefined;
          try {
            const contentType = fetcher.response?.headers['content-type'];
            if (contentType) {
              encodingFormat = new MIMEType(contentType).essence;
            }
          } catch (e) {
            /* NOOP */
          }
          const relTarget = normalizeToLocalPath(url, encodingFormat);
          const target = path.join(outputDir, relTarget);
          fetchedResources.push({ url: relTarget, encodingFormat });
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          await fs.promises.writeFile(target, buffer);
        })
        .catch(() => {
          logError(`Failed to fetch webbook resources: ${url}`);
        });
    }),
  );

  if (manifest) {
    const referencedContents = [
      ...[manifest.readingOrder || []].flat(),
      ...[manifest.resources || []].flat(),
    ].map((v) => (typeof v === 'string' ? v : v.url));
    manifest.resources = [
      ...[manifest.resources || []].flat(),
      ...fetchedResources.filter(
        ({ url }) => !referencedContents.includes(url),
      ),
    ];
  }

  debug(
    'Saved webbook resources',
    fetchedResources.map((v) => v.url),
  );
  debug(
    'Publication manifest from webbook',
    manifest && JSON.stringify(manifest, null, 2),
  );

  return {
    entryHtmlFile: path.join(
      outputDir,
      normalizeToLocalPath(baseUrl, 'text/html'),
    ),
    manifest,
  };
}

export async function supplyWebPublicationManifestForWebbook({
  entryHtmlFile,
  outputDir,
  ...config
}: Pick<
  MergedConfig,
  'language' | 'title' | 'author' | 'readingProgression'
> & {
  entryHtmlFile: string;
  outputDir: string;
}): Promise<PublicationManifest> {
  debug(`Generating publication manifest from HTML: ${entryHtmlFile}`);
  const { dom } = await getJsdomFromUrlOrFile(entryHtmlFile);
  const { document } = dom.window;
  const language =
    config.language || document.documentElement.lang || undefined;
  const title = config.title || document.title || '';
  const author =
    config.author ||
    document.querySelector('meta[name="author"]')?.getAttribute('content') ||
    '';

  const entry = path.relative(outputDir, entryHtmlFile);
  const allFiles = await safeGlob('**', {
    cwd: outputDir,
    gitignore: false,
  });

  const manifest = generateManifest(
    path.join(outputDir, MANIFEST_FILENAME),
    outputDir,
    {
      title,
      author,
      language,
      readingProgression: config.readingProgression,
      modified: new Date().toISOString(),
      entries: [{ path: entry }],
      resources: allFiles.filter((f) => f !== entry),
    },
  );
  const link = document.createElement('link');
  link.setAttribute('rel', 'publication');
  link.setAttribute('type', 'application/ld+json');
  link.setAttribute('href', MANIFEST_FILENAME);
  document.head.appendChild(link);
  await fs.promises.writeFile(entryHtmlFile, dom.serialize(), 'utf8');

  debug(
    'Generated publication manifest from HTML',
    JSON.stringify(manifest, null, 2),
  );
  return manifest;
}

export async function copyWebPublicationAssets({
  exportAliases,
  outputs,
  manifestPath,
  input,
  outputDir,
}: Pick<MergedConfig, 'exportAliases' | 'outputs'> & {
  input: string;
  outputDir: string;
  manifestPath: string;
}): Promise<PublicationManifest> {
  const silentMode = shelljs.config.silent;
  shelljs.config.silent = true;
  try {
    const relExportAliases = exportAliases
      .map(({ source, target }) => ({
        source: path.relative(input, source),
        target: path.relative(input, target),
      }))
      .filter(({ source }) => !source.startsWith('..'));
    const allFiles = await safeGlob('**', {
      cwd: input,
      ignore: [
        // don't copy auto-generated assets
        ...outputs.flatMap(({ format, path: p }) =>
          !pathContains(input, p)
            ? []
            : format === 'webpub'
            ? path.join(path.relative(input, p), '**')
            : path.relative(input, p),
        ),
        // including node_modules possibly occurs cyclic reference of symlink
        '**/node_modules',
        // only include dotfiles starting with `.vs-`
        '**/.!(vs-*)',
      ],
      // follow symbolic links to copy local theme packages
      followSymbolicLinks: true,
      gitignore: false,
      dot: true,
    });

    debug(
      'webbook files',
      allFiles.map((file) => {
        const alias = relExportAliases.find(({ source }) => source === file);
        return alias ? `${file} (alias: ${alias.target})` : file;
      }),
    );
    const resources: string[] = [];
    let actualManifestPath = path.join(
      outputDir,
      path.relative(input, manifestPath),
    );
    for (const file of allFiles) {
      const alias = relExportAliases.find(({ source }) => source === file);
      const relTarget = alias?.target || file;
      resources.push(relTarget);
      const target = path.join(outputDir, relTarget);
      const stderr =
        shelljs.mkdir('-p', path.dirname(target)).stderr ||
        shelljs.cp('-r', path.join(input, file), target).stderr;
      if (stderr) {
        throw new Error(stderr);
      }
      if (alias && pathEquals(path.join(input, alias.source), manifestPath)) {
        actualManifestPath = target;
      }
    }

    debug('webbook publication.json', actualManifestPath);
    // Overwrite copied publication.json
    const manifest = JSON.parse(
      fs.readFileSync(actualManifestPath, 'utf8'),
    ) as PublicationManifest;
    for (const entry of relExportAliases) {
      const rewriteAliasPath = (e: PublicationLinks | string) => {
        if (typeof e === 'string') {
          return pathEquals(e, entry.source) ? entry.source : e;
        }
        if (pathEquals(e.url, entry.source)) {
          e.url = entry.target;
        }
        return e;
      };
      if (manifest.links) {
        manifest.links = Array.isArray(manifest.links)
          ? manifest.links.map(rewriteAliasPath)
          : rewriteAliasPath(manifest.links);
      }
      if (manifest.readingOrder) {
        manifest.readingOrder = Array.isArray(manifest.readingOrder)
          ? manifest.readingOrder.map(rewriteAliasPath)
          : rewriteAliasPath(manifest.readingOrder);
      }
      if (manifest.resources) {
        manifest.resources = Array.isArray(manifest.resources)
          ? manifest.resources.map(rewriteAliasPath)
          : rewriteAliasPath(manifest.resources);
      }
    }

    // List copied files to resources field
    const normalizeToUrl = (val?: ResourceCategorization) =>
      [val || []].flat().map((e) => (typeof e === 'string' ? e : e.url));
    const preDefinedResources = [
      ...normalizeToUrl(manifest.links),
      ...normalizeToUrl(manifest.readingOrder),
      ...normalizeToUrl(manifest.resources),
    ];
    manifest.resources = [
      ...[manifest.resources || []].flat(),
      ...resources.flatMap((file) => {
        if (preDefinedResources.includes(file)) {
          return [];
        }
        return file;
      }),
    ];
    fs.writeFileSync(actualManifestPath, JSON.stringify(manifest, null, 2));
    return manifest;
  } catch (err) {
    throw err;
  } finally {
    shelljs.config.silent = silentMode;
  }
}
