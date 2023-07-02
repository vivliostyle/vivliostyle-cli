import fs from 'node:fs';
import shelljs from 'shelljs';
import path from 'upath';
import { MergedConfig } from './config.js';
import type {
  PublicationLinks,
  PublicationManifest,
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
    const files = await safeGlob('**', {
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
        // copy files included on exportAlias in last
        ...relExportAliases.map(({ source }) => source),
        // including node_modules possibly occurs cyclic reference of symlink
        '**/node_modules',
      ],
      // follow symbolic links to copy local theme packages
      followSymbolicLinks: true,
      gitignore: false,
    });

    debug('webbook files', files);
    for (const file of files) {
      const target = path.join(outputDir, file);
      const stderr =
        shelljs.mkdir('-p', path.dirname(target)).stderr ||
        shelljs.cp('-r', path.join(input, file), target).stderr;
      if (stderr) {
        throw new Error(stderr);
      }
    }
    debug('webbook files (alias)', relExportAliases);
    let actualManifestPath = manifestPath;
    for (const entry of relExportAliases) {
      const target = path.join(outputDir, entry.target);
      const stderr =
        shelljs.mkdir('-p', path.dirname(target)).stderr ||
        shelljs.cp('-r', path.join(input, entry.source), target).stderr;
      if (stderr) {
        throw new Error(stderr);
      }
      if (pathEquals(path.join(input, entry.source), manifestPath)) {
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
