import fs from 'fs';
import globby from 'globby';
import shelljs from 'shelljs';
import path from 'upath';
import { ManifestEntry, ManifestJsonScheme } from './builder';
import { MergedConfig } from './config';
import { debug } from './util';

export async function exportWebbook({
  exportAliases,
  manifestPath,
  input,
  output,
}: Pick<MergedConfig, 'exportAliases' | 'manifestPath'> & {
  input: string;
  output: string;
}): Promise<string> {
  if (fs.existsSync(output)) {
    debug('going to remove existing webbook', output);
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

    debug('webbook manifest.json', actualManifestPath);
    // Overwrite copied manifest.json
    const manifest = JSON.parse(
      fs.readFileSync(actualManifestPath, 'utf8'),
    ) as ManifestJsonScheme;
    for (const entry of relExportAliases) {
      const rewriteAliasPath = (entries: ManifestEntry[]) =>
        entries.map<ManifestEntry>((e) => {
          if (e.href === entry.source) {
            e.href = entry.target;
          }
          return e;
        });
      manifest.links = rewriteAliasPath(manifest.links);
      manifest.readingOrder = rewriteAliasPath(manifest.readingOrder);
      manifest.resources = rewriteAliasPath(manifest.resources);
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
