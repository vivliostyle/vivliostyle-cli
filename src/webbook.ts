import fs from 'fs';
import globby from 'globby';
import shelljs from 'shelljs';
import path from 'upath';
import { MergedConfig } from './config';
import type {
  PublicationLinks,
  PublicationManifest,
} from './schema/pubManifest';
import { debug } from './util';

export async function exportWebPublication({
  exportAliases,
  manifestPath,
  input,
  output,
}: Pick<MergedConfig, 'exportAliases'> & {
  input: string;
  output: string;
  manifestPath: string;
}): Promise<string> {
  if (fs.existsSync(output)) {
    debug('going to remove existing webpub', output);
    shelljs.rm('-rf', output);
  }
  const silentMode = shelljs.config.silent;
  shelljs.config.silent = true;
  try {
    const relExportAliases = exportAliases
      .map(({ source, target }) => ({
        source: path.relative(input, source),
        target: path.relative(input, target),
      }))
      .filter(({ source }) => !source.startsWith('..'));
    const files = [
      ...(await globby('**/*', {
        cwd: input,
        // copy files included on exportAlias in last
        ignore: relExportAliases.map(({ source }) => source),
        followSymbolicLinks: false,
        gitignore: true,
      })),
    ];

    debug('webbook files', files);
    for (const file of files) {
      const target = path.join(output, file);
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
      const target = path.join(output, entry.target);
      const stderr =
        shelljs.mkdir('-p', path.dirname(target)).stderr ||
        shelljs.cp('-r', path.join(input, entry.source), target).stderr;
      if (stderr) {
        throw new Error(stderr);
      }
      if (path.join(input, entry.source) === manifestPath) {
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
          return e === entry.source ? entry.source : e;
        }
        if (e.url === entry.source) {
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
    shelljs.rm('-rf', output);
    throw err;
  } finally {
    shelljs.config.silent = silentMode;
  }
  return output;
}
