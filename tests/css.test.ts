import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import upath from 'upath';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type ParsedTheme,
  UseTemporaryServerRoot,
} from '../src/config/resolve.js';
import {
  clearPostcssConfigCache,
  collectCssPackageImports,
  loadPostcssConfig,
  parseBareImportSpecifier,
  resolveLocalStyleFile,
  resolvePackageCssEntry,
  resolvePackageCssSubpath,
  resolvePostcssConfig,
  scanCssDependencies,
  ThemeCssResolver,
  transformCssImports,
  validateThemeCssDependencies,
} from '../src/processor/css.js';

let projectDir: string;

beforeEach(async () => {
  projectDir = upath.normalize(await mkdtemp(join(tmpdir(), 'vs-css-test-')));
});

afterEach(async () => {
  clearPostcssConfigCache();
  await rm(projectDir, { recursive: true, force: true });
});

function writeFiles(files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const file = upath.join(projectDir, rel);
    fs.mkdirSync(upath.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

function abs(rel: string): string {
  return upath.join(projectDir, rel);
}

function createResolver(): ThemeCssResolver {
  return new ThemeCssResolver({
    workspaceDir: abs('.vivliostyle'),
    themesDir: abs('.vivliostyle/themes'),
  });
}

describe('parseBareImportSpecifier', () => {
  it('parses bare specifiers', () => {
    expect(parseBareImportSpecifier('foo')).toEqual({
      pkgName: 'foo',
      subpath: '',
    });
    expect(parseBareImportSpecifier('foo/theme.css')).toEqual({
      pkgName: 'foo',
      subpath: 'theme.css',
    });
    expect(parseBareImportSpecifier('@scope/pkg')).toEqual({
      pkgName: '@scope/pkg',
      subpath: '',
    });
    expect(parseBareImportSpecifier('@scope/pkg/css/partial/foo.css')).toEqual({
      pkgName: '@scope/pkg',
      subpath: 'css/partial/foo.css',
    });
  });

  it('parses version specifiers', () => {
    expect(parseBareImportSpecifier('foo@^1.0.0')).toEqual({
      pkgName: 'foo',
      version: '^1.0.0',
      subpath: '',
    });
    expect(parseBareImportSpecifier('foo@1.2.3/theme.css')).toEqual({
      pkgName: 'foo',
      version: '1.2.3',
      subpath: 'theme.css',
    });
    expect(
      parseBareImportSpecifier('@vivliostyle/theme-base@^3.0.0/theme-all.css'),
    ).toEqual({
      pkgName: '@vivliostyle/theme-base',
      version: '^3.0.0',
      subpath: 'theme-all.css',
    });
    expect(parseBareImportSpecifier('@scope/pkg@latest')).toEqual({
      pkgName: '@scope/pkg',
      version: 'latest',
      subpath: '',
    });
    expect(parseBareImportSpecifier('foo@')).toBeUndefined();
  });

  it('keeps the CSS URL semantics for relative and absolute specifiers', () => {
    expect(parseBareImportSpecifier('./local.css')).toBeUndefined();
    expect(parseBareImportSpecifier('../local.css')).toBeUndefined();
    expect(parseBareImportSpecifier('/abs.css')).toBeUndefined();
    expect(
      parseBareImportSpecifier('https://example.com/a.css'),
    ).toBeUndefined();
    expect(parseBareImportSpecifier('data:text/css,body{}')).toBeUndefined();
    expect(parseBareImportSpecifier('@scope')).toBeUndefined();
    expect(parseBareImportSpecifier('')).toBeUndefined();
  });
});

describe('resolveLocalStyleFile', () => {
  it('resolves only existing .css files', () => {
    writeFiles({
      'a.css': '',
      'b.txt': '',
      'dir.css/inner.css': '',
    });
    expect(resolveLocalStyleFile('a.css', projectDir)).toBe(abs('a.css'));
    expect(resolveLocalStyleFile('./a.css', projectDir)).toBe(abs('a.css'));
    expect(resolveLocalStyleFile('b.txt', projectDir)).toBeUndefined();
    expect(resolveLocalStyleFile('missing.css', projectDir)).toBeUndefined();
    expect(resolveLocalStyleFile('dir.css', projectDir)).toBeUndefined();
  });
});

describe('resolvePackageCssEntry', () => {
  it('prefers vivliostyle.theme.style over other fields', () => {
    writeFiles({
      'pkg/package.json': JSON.stringify({
        name: 'pkg',
        main: 'index.js',
        style: 'style.css',
        exports: { '.': './exported.css' },
        vivliostyle: { theme: { style: 'theme.css' } },
      }),
      'pkg/theme.css': '',
      'pkg/style.css': '',
      'pkg/exported.css': '',
      'pkg/index.js': '',
    });
    expect(resolvePackageCssEntry(abs('pkg'))).toBe(abs('pkg/theme.css'));
  });

  it('prefers the style field over the exports field', () => {
    writeFiles({
      'pkg/package.json': JSON.stringify({
        name: 'pkg',
        style: 'style.css',
        exports: { '.': './exported.css' },
      }),
      'pkg/style.css': '',
      'pkg/exported.css': '',
    });
    expect(resolvePackageCssEntry(abs('pkg'))).toBe(abs('pkg/style.css'));
  });

  it('resolves the root subpath of the exports field with the style condition', () => {
    writeFiles({
      'pkg/package.json': JSON.stringify({
        name: 'pkg',
        exports: {
          '.': { style: './dist/theme.css', default: './dist/index.js' },
        },
      }),
      'pkg/dist/theme.css': '',
      'pkg/dist/index.js': '',
    });
    expect(resolvePackageCssEntry(abs('pkg'))).toBe(abs('pkg/dist/theme.css'));
  });

  it('resolves a string form exports field', () => {
    writeFiles({
      'pkg/package.json': JSON.stringify({
        name: 'pkg',
        exports: './theme.css',
      }),
      'pkg/theme.css': '',
    });
    expect(resolvePackageCssEntry(abs('pkg'))).toBe(abs('pkg/theme.css'));
  });

  it('ignores non-stylesheet exports results and falls back to the main field', () => {
    writeFiles({
      'pkg/package.json': JSON.stringify({
        name: 'pkg',
        main: 'theme.css',
        exports: { '.': './index.js' },
      }),
      'pkg/theme.css': '',
      'pkg/index.js': '',
    });
    expect(resolvePackageCssEntry(abs('pkg'))).toBe(abs('pkg/theme.css'));
  });

  it('rejects a package without any style entry', () => {
    writeFiles({
      'pkg/package.json': JSON.stringify({ name: 'invalid-pkg' }),
    });
    expect(() => resolvePackageCssEntry(abs('pkg'))).toThrow(
      'Could not find a style file for the theme: invalid-pkg',
    );
  });
});

describe('resolvePackageCssSubpath', () => {
  it('resolves a plain file path when the exports field is not declared', () => {
    writeFiles({
      'pkg/package.json': JSON.stringify({ name: 'pkg', main: 'theme.css' }),
      'pkg/theme.css': '',
      'pkg/css/partial/foo.css': '',
    });
    expect(resolvePackageCssSubpath(abs('pkg'), 'css/partial/foo.css')).toBe(
      abs('pkg/css/partial/foo.css'),
    );
  });

  it('resolves subpath patterns through the exports field', () => {
    writeFiles({
      'pkg/package.json': JSON.stringify({
        name: 'pkg',
        exports: {
          '.': { style: './dist/theme.css' },
          './partials/*.css': './dist/partials/*.css',
        },
      }),
      'pkg/dist/theme.css': '',
      'pkg/dist/partials/foo.css': '',
    });
    expect(resolvePackageCssSubpath(abs('pkg'), 'partials/foo.css')).toBe(
      abs('pkg/dist/partials/foo.css'),
    );
  });

  it('rejects subpaths not exported from the package', () => {
    writeFiles({
      'pkg/package.json': JSON.stringify({
        name: 'pkg',
        exports: { '.': { style: './dist/theme.css' } },
      }),
      'pkg/dist/theme.css': '',
    });
    expect(() =>
      resolvePackageCssSubpath(abs('pkg'), 'dist/theme.css'),
    ).toThrow('not exported from the package: pkg');
  });

  it('rejects subpaths escaping the package directory', () => {
    writeFiles({
      'pkg/package.json': JSON.stringify({ name: 'pkg' }),
      'secret.css': '',
    });
    expect(() => resolvePackageCssSubpath(abs('pkg'), '../secret.css')).toThrow(
      'escapes the package directory',
    );
  });
});

describe('transformCssImports', () => {
  it('rewrites bare imports resolved from the themes directory', async () => {
    writeFiles({
      '.vivliostyle/themes/node_modules/@vivliostyle/theme-a/package.json':
        JSON.stringify({
          name: '@vivliostyle/theme-a',
          main: 'theme.css',
          vivliostyle: { theme: { style: 'theme.css' } },
        }),
      '.vivliostyle/themes/node_modules/@vivliostyle/theme-a/theme.css': '',
      '.vivliostyle/style.css': '',
    });
    const result = await transformCssImports({
      code: "@import '@vivliostyle/theme-a';\nh1 { color: red; }",
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver: createResolver(),
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toBe(
      "@import 'themes/node_modules/@vivliostyle/theme-a/theme.css';\nh1 { color: red; }",
    );
  });

  it('rewrites versioned bare imports ignoring the version', async () => {
    writeFiles({
      '.vivliostyle/themes/node_modules/@vivliostyle/theme-a/package.json':
        JSON.stringify({
          name: '@vivliostyle/theme-a',
          version: '3.1.0',
          vivliostyle: { theme: { style: 'theme.css' } },
        }),
      '.vivliostyle/themes/node_modules/@vivliostyle/theme-a/theme.css': '',
      '.vivliostyle/themes/node_modules/@vivliostyle/theme-a/theme-all.css': '',
      '.vivliostyle/style.css': '',
    });
    const result = await transformCssImports({
      code: "@import '@vivliostyle/theme-a@^3.0.0/theme-all.css';",
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver: createResolver(),
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toBe(
      "@import 'themes/node_modules/@vivliostyle/theme-a/theme-all.css';",
    );
  });

  it('preserves import conditions and the url() notation', async () => {
    writeFiles({
      '.vivliostyle/themes/node_modules/theme-a/package.json': JSON.stringify({
        name: 'theme-a',
        main: 'theme.css',
      }),
      '.vivliostyle/themes/node_modules/theme-a/theme.css': '',
      '.vivliostyle/style.css': '',
    });
    const result = await transformCssImports({
      code: '@import url(theme-a) layer(base) screen;',
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver: createResolver(),
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toBe(
      '@import url(themes/node_modules/theme-a/theme.css) layer(base) screen;',
    );
  });

  it('keeps relative imports pointing to existing files untouched', async () => {
    writeFiles({
      '.vivliostyle/style.css': '',
      '.vivliostyle/css/base.css': '',
    });
    const code = "@import url(css/base.css);\n@import './css/base.css' print;";
    const result = await transformCssImports({
      code,
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver: createResolver(),
    });
    expect(result.errors).toEqual([]);
    expect(result.modified).toBe(false);
    expect(result.code).toBe(code);
  });

  it('keeps absolute URLs and other schemes untouched', async () => {
    const code = [
      "@import 'https://example.com/theme.css';",
      "@import '/root.css';",
      "@import 'data:text/css,body{}';",
    ].join('\n');
    const result = await transformCssImports({
      code,
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver: createResolver(),
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toBe(code);
  });

  it('mounts packages resolved from the project node_modules', async () => {
    writeFiles({
      'node_modules/theme-b/package.json': JSON.stringify({
        name: 'theme-b',
        main: 'theme.css',
      }),
      'node_modules/theme-b/theme.css': '',
      '.vivliostyle/style.css': '',
    });
    const resolver = createResolver();
    const result = await transformCssImports({
      code: "@import 'theme-b';",
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver,
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toBe(
      "@import 'themes/node_modules/theme-b/theme.css';",
    );
    expect(resolver.mounts.get('theme-b')).toBe(abs('node_modules/theme-b'));
    expect(
      resolver.resolveMountedFile('/themes/node_modules/theme-b/theme.css'),
    ).toBe(abs('node_modules/theme-b/theme.css'));
  });

  it('prefers packages in the themes directory over the project node_modules', async () => {
    writeFiles({
      '.vivliostyle/themes/node_modules/theme-b/package.json': JSON.stringify({
        name: 'theme-b',
        main: 'theme.css',
      }),
      '.vivliostyle/themes/node_modules/theme-b/theme.css': '',
      'node_modules/theme-b/package.json': JSON.stringify({
        name: 'theme-b',
        main: 'theme.css',
      }),
      'node_modules/theme-b/theme.css': '',
      '.vivliostyle/style.css': '',
    });
    const resolver = createResolver();
    const result = await transformCssImports({
      code: "@import 'theme-b';",
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver,
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toBe(
      "@import 'themes/node_modules/theme-b/theme.css';",
    );
    expect(resolver.mounts.size).toBe(0);
  });

  it('respects nested node_modules inside the themes directory', async () => {
    writeFiles({
      '.vivliostyle/themes/node_modules/theme-b/package.json': JSON.stringify({
        name: 'theme-b',
        main: 'theme.css',
      }),
      '.vivliostyle/themes/node_modules/theme-b/theme.css': '',
      '.vivliostyle/themes/node_modules/theme-b/node_modules/theme-c/package.json':
        JSON.stringify({ name: 'theme-c', main: 'index.css' }),
      '.vivliostyle/themes/node_modules/theme-b/node_modules/theme-c/index.css':
        '',
      '.vivliostyle/themes/node_modules/theme-c/package.json': JSON.stringify({
        name: 'theme-c',
        main: 'index.css',
      }),
      '.vivliostyle/themes/node_modules/theme-c/index.css': '',
    });
    const result = await transformCssImports({
      code: "@import 'theme-c';",
      importer: abs('.vivliostyle/themes/node_modules/theme-b/theme.css'),
      importerUrlPath: '/themes/node_modules/theme-b/theme.css',
      resolver: createResolver(),
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toBe("@import 'node_modules/theme-c/index.css';");
  });

  it('does not let files without the .css extension shadow package names', async () => {
    writeFiles({
      '.vivliostyle/theme-b': '',
      '.vivliostyle/themes/node_modules/theme-b/package.json': JSON.stringify({
        name: 'theme-b',
        main: 'theme.css',
      }),
      '.vivliostyle/themes/node_modules/theme-b/theme.css': '',
      '.vivliostyle/style.css': '',
    });
    const result = await transformCssImports({
      code: "@import 'theme-b';",
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver: createResolver(),
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toBe(
      "@import 'themes/node_modules/theme-b/theme.css';",
    );
  });

  it('rewrites imports between mounted packages', async () => {
    writeFiles({
      'node_modules/theme-b/package.json': JSON.stringify({
        name: 'theme-b',
        main: 'theme.css',
      }),
      'node_modules/theme-b/theme.css': "@import 'theme-c';",
      'node_modules/theme-c/package.json': JSON.stringify({
        name: 'theme-c',
        main: 'index.css',
      }),
      'node_modules/theme-c/index.css': '',
    });
    const resolver = createResolver();
    const result = await transformCssImports({
      code: fs.readFileSync(abs('node_modules/theme-b/theme.css'), 'utf8'),
      importer: abs('node_modules/theme-b/theme.css'),
      importerUrlPath: '/themes/node_modules/theme-b/theme.css',
      resolver,
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toBe("@import '../theme-c/index.css';");
    expect(resolver.mounts.get('theme-c')).toBe(abs('node_modules/theme-c'));
  });

  it('reports unresolved bare imports without changing the code', async () => {
    writeFiles({
      '.vivliostyle/style.css': '',
    });
    const code = "@import 'missing-theme';";
    const result = await transformCssImports({
      code,
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver: createResolver(),
    });
    expect(result.code).toBe(code);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(
      'Could not resolve the CSS import: missing-theme',
    );
  });
});

describe('ThemeCssResolver.resolveMountedFile', () => {
  it('rejects paths traversing outside of the mounted package', async () => {
    writeFiles({
      'node_modules/theme-b/package.json': JSON.stringify({
        name: 'theme-b',
        main: 'theme.css',
      }),
      'node_modules/theme-b/theme.css': '',
      'node_modules/secret/index.css': '',
      '.vivliostyle/style.css': '',
    });
    const resolver = createResolver();
    await transformCssImports({
      code: "@import 'theme-b';",
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver,
    });
    expect(
      resolver.resolveMountedFile(
        '/themes/node_modules/theme-b/../secret/index.css',
      ),
    ).toBeUndefined();
    expect(
      resolver.resolveMountedFile('/themes/node_modules/unknown/file.css'),
    ).toBeUndefined();
  });
});

describe('scanCssDependencies', () => {
  it('walks relative and bare imports and reports unresolved packages', async () => {
    writeFiles({
      '.vivliostyle/themes/node_modules/theme-a/package.json': JSON.stringify({
        name: 'theme-a',
        main: 'theme.css',
      }),
      '.vivliostyle/themes/node_modules/theme-a/theme.css':
        '@import url(css/base.css);',
      '.vivliostyle/themes/node_modules/theme-a/css/base.css': '',
      '.vivliostyle/style.css':
        "@import './local.css';\n@import 'theme-a';\n@import 'missing-theme';",
      '.vivliostyle/local.css': '',
    });
    const { files, errors } = await scanCssDependencies({
      entryFiles: [abs('.vivliostyle/style.css')],
      resolver: createResolver(),
    });
    expect(files).toEqual(
      expect.arrayContaining([
        abs('.vivliostyle/style.css'),
        abs('.vivliostyle/local.css'),
        abs('.vivliostyle/themes/node_modules/theme-a/theme.css'),
        abs('.vivliostyle/themes/node_modules/theme-a/css/base.css'),
      ]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(
      'Could not resolve the CSS import: missing-theme',
    );
  });

  it('collects the files reported as dependencies by PostCSS plugins', async () => {
    writeFiles({
      '.vivliostyle/style.css': '',
      'src/input.txt': '',
      'postcss.config.cjs':
        "module.exports = { plugins: [require('./postcss-plugin.cjs')] };",
      'postcss-plugin.cjs': `
        const { dirname, join } = require('node:path');
        module.exports = {
          postcssPlugin: 'test-plugin',
          Once(root, { result }) {
            result.messages.push({
              type: 'dependency',
              plugin: 'test-plugin',
              file: join(dirname(result.opts.from), '..', 'src/input.txt'),
            });
          },
        };
      `,
    });
    const { files, errors } = await scanCssDependencies({
      entryFiles: [abs('.vivliostyle/style.css')],
      resolver: createResolver(),
      postcssConfig: await loadPostcssConfig(projectDir),
    });
    expect(errors).toEqual([]);
    expect(files).toContain(abs('src/input.txt'));
  });

  it('walks the import graph transformed by PostCSS plugins', async () => {
    writeFiles({
      '.vivliostyle/style.css': "@import 'virtual-styles';",
      'postcss.config.cjs':
        "module.exports = { plugins: [require('./postcss-plugin.cjs')] };",
      'postcss-plugin.cjs': `
        module.exports = {
          postcssPlugin: 'test-plugin',
          AtRule: {
            import: (rule) => {
              if (rule.params.includes('virtual-styles')) {
                rule.remove();
              }
            },
          },
        };
      `,
    });
    const { errors } = await scanCssDependencies({
      entryFiles: [abs('.vivliostyle/style.css')],
      resolver: createResolver(),
      postcssConfig: await loadPostcssConfig(projectDir),
    });
    expect(errors).toEqual([]);
  });
});

describe('collectCssPackageImports', () => {
  const fileTheme = (rel: string): ParsedTheme => ({
    type: 'file',
    name: upath.basename(rel),
    source: abs(rel),
    location: abs(upath.join('.vivliostyle', rel)),
  });

  it('discovers the imported packages with their versions', async () => {
    writeFiles({
      'style.css': "@import './base.css';",
      'base.css':
        "@import '@scope/pkg@^3.0.0/theme-all.css';\n@import 'other-pkg';",
    });
    const discovered = await collectCssPackageImports({
      themeIndexes: new Set([fileTheme('style.css')]),
    });
    expect(discovered).toEqual(
      new Map([
        ['@scope/pkg', '@scope/pkg@^3.0.0'],
        ['other-pkg', 'other-pkg'],
      ]),
    );
  });

  it('skips packages configured as themes', async () => {
    writeFiles({
      'style.css': "@import 'configured-pkg@^2.0.0/a.css';",
    });
    const discovered = await collectCssPackageImports({
      themeIndexes: new Set<ParsedTheme>([
        fileTheme('style.css'),
        {
          type: 'package',
          name: 'configured-pkg',
          specifier: 'configured-pkg@^1.0.0',
          location: abs('.vivliostyle/themes/node_modules/configured-pkg'),
          registry: true,
        },
      ]),
    });
    expect(discovered.size).toBe(0);
  });

  it('scans local package themes and follows their imports', async () => {
    writeFiles({
      'my-theme/package.json': JSON.stringify({
        name: 'my-theme',
        vivliostyle: { theme: { style: 'theme.css' } },
      }),
      'my-theme/theme.css': "@import 'remote-pkg@^2.0.0/theme.css';",
    });
    const discovered = await collectCssPackageImports({
      themeIndexes: new Set<ParsedTheme>([
        {
          type: 'package',
          name: 'my-theme',
          specifier: abs('my-theme'),
          location: abs('.vivliostyle/themes/node_modules/my-theme'),
          registry: false,
        },
      ]),
    });
    expect(discovered).toEqual(new Map([['remote-pkg', 'remote-pkg@^2.0.0']]));
  });

  it('traverses imports referring to the configured local packages', async () => {
    writeFiles({
      'style.css': "@import 'my-theme/extra.css';",
      'my-theme/package.json': JSON.stringify({ name: 'my-theme' }),
      'my-theme/extra.css': "@import 'nested-pkg';",
    });
    const discovered = await collectCssPackageImports({
      themeIndexes: new Set<ParsedTheme>([
        fileTheme('style.css'),
        {
          type: 'package',
          name: 'my-theme',
          specifier: abs('my-theme'),
          location: abs('.vivliostyle/themes/node_modules/my-theme'),
          registry: false,
          importPath: [],
        },
      ]),
    });
    expect(discovered).toEqual(new Map([['nested-pkg', 'nested-pkg']]));
  });

  it('skips packages resolvable from the project unless the version is unsatisfied', async () => {
    writeFiles({
      'style.css': [
        "@import 'installed-pkg';",
        "@import 'outdated-pkg@^9.0.0/a.css';",
        "@import 'fresh-pkg@^1.0.0/a.css';",
      ].join('\n'),
      'node_modules/installed-pkg/package.json': JSON.stringify({
        name: 'installed-pkg',
        version: '1.0.0',
      }),
      'node_modules/outdated-pkg/package.json': JSON.stringify({
        name: 'outdated-pkg',
        version: '1.0.0',
      }),
      'node_modules/fresh-pkg/package.json': JSON.stringify({
        name: 'fresh-pkg',
        version: '1.2.0',
      }),
    });
    const discovered = await collectCssPackageImports({
      themeIndexes: new Set([fileTheme('style.css')]),
    });
    expect(discovered).toEqual(
      new Map([['outdated-pkg', 'outdated-pkg@^9.0.0']]),
    );
  });

  it('does not traverse the imports of the packages resolved from the project', async () => {
    writeFiles({
      'style.css': "@import 'installed-pkg';",
      'node_modules/installed-pkg/package.json': JSON.stringify({
        name: 'installed-pkg',
        version: '1.0.0',
        style: 'theme.css',
      }),
      'node_modules/installed-pkg/theme.css': "@import 'hidden-pkg';",
    });
    const discovered = await collectCssPackageImports({
      themeIndexes: new Set([fileTheme('style.css')]),
    });
    expect(discovered.size).toBe(0);
  });

  it('keeps the first specifier for conflicting versions', async () => {
    writeFiles({
      'style.css': "@import 'pkg@^1.0.0/a.css';\n@import 'pkg@^2.0.0/b.css';",
    });
    const discovered = await collectCssPackageImports({
      themeIndexes: new Set([fileTheme('style.css')]),
    });
    expect(discovered).toEqual(new Map([['pkg', 'pkg@^1.0.0']]));
  });
});

describe('loadPostcssConfig', () => {
  it('returns undefined when the project has no PostCSS config', async () => {
    await expect(loadPostcssConfig(projectDir)).resolves.toBeUndefined();
  });

  it('reports an invalid PostCSS config', async () => {
    writeFiles({
      'postcss.config.cjs': 'module.exports = { plugins: [42] };',
    });
    await expect(loadPostcssConfig(projectDir)).rejects.toThrow(
      'Failed to load the PostCSS config',
    );
  });

  it('applies the plugins to the transformed CSS', async () => {
    writeFiles({
      '.vivliostyle/style.css': '',
      'postcss.config.cjs':
        "module.exports = { plugins: [require('./postcss-plugin.cjs')] };",
      'postcss-plugin.cjs': `
        module.exports = {
          postcssPlugin: 'test-plugin',
          Declaration: {
            color: (decl) => {
              decl.value = 'blue';
            },
          },
        };
      `,
    });
    const result = await transformCssImports({
      code: 'h1 { color: red; }',
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver: createResolver(),
      postcssConfig: await loadPostcssConfig(projectDir),
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toBe('h1 { color: blue; }');
  });

  it('rewrites the bare imports emitted by the plugins', async () => {
    writeFiles({
      '.vivliostyle/themes/node_modules/theme-a/package.json': JSON.stringify({
        name: 'theme-a',
        main: 'theme.css',
      }),
      '.vivliostyle/themes/node_modules/theme-a/theme.css': '',
      '.vivliostyle/style.css': '',
      'postcss.config.cjs':
        "module.exports = { plugins: [require('./postcss-plugin.cjs')] };",
      'postcss-plugin.cjs': `
        module.exports = {
          postcssPlugin: 'test-plugin',
          Once(root, { AtRule }) {
            root.prepend(new AtRule({ name: 'import', params: "'theme-a'" }));
          },
        };
      `,
    });
    const result = await transformCssImports({
      code: 'h1 { color: red; }',
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver: createResolver(),
      postcssConfig: await loadPostcssConfig(projectDir),
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toContain(
      "@import 'themes/node_modules/theme-a/theme.css';",
    );
  });

  it('reports the errors thrown by the plugins without changing the code', async () => {
    writeFiles({
      '.vivliostyle/style.css': '',
      'postcss.config.cjs':
        "module.exports = { plugins: [require('./postcss-plugin.cjs')] };",
      'postcss-plugin.cjs': `
        module.exports = {
          postcssPlugin: 'test-plugin',
          Once() {
            throw new Error('plugin failure');
          },
        };
      `,
    });
    const result = await transformCssImports({
      code: 'h1 { color: red; }',
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver: createResolver(),
      postcssConfig: await loadPostcssConfig(projectDir),
    });
    expect(result.code).toBe('h1 { color: red; }');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch('plugin failure');
  });
});

describe('resolvePostcssConfig', () => {
  it('returns undefined for a temporary server root', async () => {
    await expect(
      resolvePostcssConfig({ postcss: UseTemporaryServerRoot }),
    ).resolves.toBeUndefined();
  });

  it('searches the config file from the specified directory', async () => {
    writeFiles({
      'sub/postcss.config.cjs': 'module.exports = { plugins: [] };',
    });
    const config = await resolvePostcssConfig({ postcss: abs('sub') });
    expect(config?.file).toBe(abs('sub/postcss.config.cjs'));
  });

  it('uses the inline config without searching for a config file', async () => {
    writeFiles({
      '.vivliostyle/style.css': '',
      // Would fail to load if the config file was searched
      'postcss.config.cjs': 'module.exports = { plugins: [42] };',
    });
    const postcssConfig = await resolvePostcssConfig({
      postcss: {
        map: false,
        plugins: [
          {
            postcssPlugin: 'test-plugin',
            Declaration: {
              color: (decl) => {
                decl.value = 'blue';
              },
            },
          },
        ],
      },
    });
    expect(postcssConfig?.file).toBeUndefined();
    expect(postcssConfig?.options).toEqual({ map: false });
    const result = await transformCssImports({
      code: 'h1 { color: red; }',
      importer: abs('.vivliostyle/style.css'),
      importerUrlPath: '/style.css',
      resolver: createResolver(),
      postcssConfig,
    });
    expect(result.errors).toEqual([]);
    expect(result.code).toBe('h1 { color: blue; }');
  });
});

describe('validateThemeCssDependencies', () => {
  it('rejects file themes with unresolved imports', async () => {
    writeFiles({
      'style.css': "@import 'missing-theme';",
    });
    const theme: ParsedTheme = {
      type: 'file',
      name: 'style.css',
      source: abs('style.css'),
      location: abs('style.css'),
    };
    await expect(
      validateThemeCssDependencies({
        workspaceDir: projectDir,
        themesDir: abs('themes'),
        themeIndexes: new Set([theme]),
        postcss: projectDir,
      }),
    ).rejects.toThrow('Could not resolve the CSS import: missing-theme');
  });

  it('accepts themes whose import graphs are fully resolvable', async () => {
    writeFiles({
      'themes/node_modules/theme-a/package.json': JSON.stringify({
        name: 'theme-a',
        main: 'theme.css',
      }),
      'themes/node_modules/theme-a/theme.css': '',
      'style.css': "@import 'theme-a';",
    });
    const theme: ParsedTheme = {
      type: 'file',
      name: 'style.css',
      source: abs('style.css'),
      location: abs('style.css'),
    };
    await expect(
      validateThemeCssDependencies({
        workspaceDir: projectDir,
        themesDir: abs('themes'),
        themeIndexes: new Set([theme]),
        postcss: projectDir,
      }),
    ).resolves.toBeUndefined();
  });
});
