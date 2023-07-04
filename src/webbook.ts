import fs from 'node:fs';
import shelljs from 'shelljs';
import path from 'upath';
import { MergedConfig } from './config.js';
import type {
  PublicationLinks,
  PublicationManifest,
  ResourceCategorization,
} from './schema/publication.schema.js';
import { debug, pathContains, pathEquals, safeGlob } from './util.js';

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
}) {
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
  } catch (err) {
    throw err;
  } finally {
    shelljs.config.silent = silentMode;
  }
}

export async function exportWebPublication(
  params: Parameters<typeof copyWebPublicationAssets>[0],
): Promise<string> {
  const { outputDir } = params;
  if (fs.existsSync(outputDir)) {
    debug('going to remove existing webpub', outputDir);
    shelljs.rm('-rf', outputDir);
  }
  try {
    await copyWebPublicationAssets(params);
  } catch (err) {
    shelljs.rm('-rf', outputDir);
    throw err;
  }
  return outputDir;
}
