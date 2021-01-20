import fs from 'fs';
import globby from 'globby';
import shelljs from 'shelljs';
import path from 'upath';
import { debug } from './util';

export async function exportWebbook({
  input,
  output,
}: {
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
    const files = await globby('**/*', {
      cwd: input,
      followSymbolicLinks: false,
      gitignore: true,
    });
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
  } catch (err) {
    shelljs.rm('-rf', output);
  } finally {
    shelljs.config.silent = silentMode;
  }
  return output;
}
