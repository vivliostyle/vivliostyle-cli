import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { parseTheme } from '../src/config/resolve.js';
import { installThemeDependencies } from '../src/processor/theme.js';

let tmpDir: string;

beforeEach(() => {
  // Arborist mixes real and symlinked paths when the themes directory is
  // reached through a symlink (e.g. /tmp on macOS), breaking local themes
  tmpDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'vivliostyle-theme-install-')),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writePackageWithLifecycleScripts({
  dir,
  name,
  markerFile,
  dependencies,
}: {
  dir: string;
  name: string;
  markerFile: string;
  dependencies?: Record<string, string>;
}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      main: 'theme.css',
      scripts: Object.fromEntries(
        ['preinstall', 'install', 'postinstall', 'prepare'].map((event) => [
          event,
          'node mark.js',
        ]),
      ),
      dependencies,
    }),
  );
  fs.writeFileSync(path.join(dir, 'theme.css'), '');
  fs.writeFileSync(
    path.join(dir, 'mark.js'),
    `require('fs').appendFileSync(${JSON.stringify(markerFile)}, ${JSON.stringify(name)} + ':' + process.env.npm_lifecycle_event + '\\n');\n`,
  );
}

it('does not run lifecycle scripts of a theme or its dependencies', async () => {
  const markerFile = path.join(tmpDir, 'lifecycle-scripts.log');
  fs.writeFileSync(markerFile, '');
  const themeDir = path.join(tmpDir, 'local-theme');
  const themesDir = path.join(tmpDir, 'workspace', 'themes');
  writePackageWithLifecycleScripts({
    dir: path.join(tmpDir, 'theme-dependency'),
    name: 'theme-dependency',
    markerFile,
  });
  writePackageWithLifecycleScripts({
    dir: themeDir,
    name: 'local-theme',
    markerFile,
    dependencies: { 'theme-dependency': 'file:../theme-dependency' },
  });
  const theme = parseTheme({
    theme: themeDir,
    context: tmpDir,
    workspaceDir: path.join(tmpDir, 'workspace'),
    themesDir,
  });

  await installThemeDependencies({
    themesDir,
    themeIndexes: new Set([theme]),
  });

  expect(
    fs.realpathSync(path.join(themesDir, 'node_modules', 'local-theme')),
  ).toBe(fs.realpathSync(themeDir));
  expect(
    fs.existsSync(path.join(themesDir, 'node_modules', 'theme-dependency')),
  ).toBe(true);
  expect(fs.readFileSync(markerFile, 'utf8')).toBe('');
});
