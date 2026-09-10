import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import type { NextHandleFunction } from 'connect';
import escapeRe from 'escape-string-regexp';
import { lookup as mime } from 'mime-types';
import sirv, { type RequestHandler } from 'sirv';
import upath from 'upath';
import type * as vite from 'vite';

import { locateVivliostyleConfig } from '../config/load.js';
import {
  isWebPubConfig,
  type ParsedEntry,
  type ParsedTheme,
  type ResolvedTaskConfig,
} from '../config/resolve.js';
import type { ParsedVivliostyleInlineConfig } from '../config/schema.js';
import { CMYK_RESERVE_MAP_FILENAME } from '../constants.js';
import { Logger } from '../logger.js';
import {
  getAssetMatcher,
  getWebPubResourceMatcher,
  GlobMatcher,
} from '../processor/asset.js';
import {
  generateManifest,
  prepareThemeDirectory,
  transformManuscript,
} from '../processor/compile.js';
import {
  clearPostcssConfigCache,
  collectThemeCssEntryFiles,
  type PostcssConfig,
  resolvePostcssConfig,
  scanCssDependencies,
  ThemeCssResolver,
  transformCssImports,
} from '../processor/css.js';
import { generateCmykReserveMap } from '../server.js';
import {
  debounce,
  getFormattedError,
  isFileSync,
  pathContains,
  pathEquals,
  toError,
} from '../util.js';
import { reloadConfig } from './plugin-util.js';

// Ref: https://github.com/lukeed/sirv
function createEntriesRouteLookup(entries: ParsedEntry[], cwd: string) {
  const extns = ['', 'html', 'htm'];
  const toAssume = (uri: string) => {
    const len = uri.length - 1;
    let i = 0,
      x;
    const path = uri.codePointAt(len) === 47 ? uri.slice(0, len) : uri;
    const arr = [],
      tmp = `${path}/index`;
    for (; i < extns.length; i++) {
      x = extns[i] ? `.${extns[i]}` : '';
      if (path) {
        arr.push(path + x);
      }
      arr.push(tmp + x);
    }

    return arr;
  };
  const cache = entries.reduce<Record<string, ParsedEntry>>((acc, e) => {
    acc[
      `/${upath.relative(cwd, e.target).normalize().replaceAll(/\\+/gv, '/')}`
    ] = e;
    return acc;
  }, {});
  return (uri: string) => {
    const arr = toAssume(uri);
    let data,
      i = 0;
    for (; i < arr.length; i++) {
      if ((data = cache[arr[i]])) {
        return [data, arr[i]] as const;
      }
    }
  };
}

function getWorkspaceMatcher({
  workspaceDir,
  themesDir,
  viewerInput,
  entries,
  outputs,
  copyAsset,
}: ResolvedTaskConfig) {
  const hasCmykReserveMap = outputs.some(
    (o) => o.format === 'pdf' && o.cmyk && o.cmyk.reserveMap.length > 0,
  );
  if (viewerInput.type === 'webpub') {
    return getWebPubResourceMatcher({
      outputs,
      themesDir,
      entries,
      cwd: workspaceDir,
      manifestPath: viewerInput.manifestPath,
      copyAsset,
      additionalPatterns: hasCmykReserveMap ? [CMYK_RESERVE_MAP_FILENAME] : [],
    });
  }

  let entryFiles: string[] = [];
  switch (viewerInput.type) {
    case 'epub':
      entryFiles = [
        upath.join(
          upath.relative(workspaceDir, viewerInput.epubTmpOutputDir),
          '**',
        ),
      ];
      break;
    case 'epub-opf':
    case 'webbook':
      entryFiles = ['**'];
      break;
    default:
      entryFiles = viewerInput satisfies never;
  }

  return new GlobMatcher([
    {
      patterns: entryFiles,
      ignore: ['node_modules/**'],
      dot: true,
      cwd: workspaceDir,
    },
  ]);
}

export function vsDevServerPlugin({
  config: _config,
  inlineConfig,
}: {
  config: ResolvedTaskConfig;
  inlineConfig: ParsedVivliostyleInlineConfig;
}): vite.Plugin {
  let config = _config;
  let server: vite.ViteDevServer | undefined;
  let program:
    | {
        entriesLookup: (
          uri: string,
        ) => readonly [ParsedEntry, string] | undefined;
        urlMatchRe: RegExp;
        serveWorkspace: RequestHandler;
        serveWorkspaceMatcher: GlobMatcher;
        serveAssets: RequestHandler;
        serveAssetsMatcher: GlobMatcher;
      }
    | undefined;

  const transformCache: Map<
    string,
    Promise<{ content: string; etag: string } | undefined>
  > = new Map();
  let matchProjectDep: (pathname: string) => boolean;
  // Initialize with the given config so that the resolver is available on
  // preview servers, which never run `reload`
  let cssResolver = new ThemeCssResolver(_config);

  async function getPostcssConfig(): Promise<PostcssConfig | undefined> {
    try {
      return await resolvePostcssConfig(config);
    } catch (error) {
      Logger.logError(getFormattedError(toError(error)));
    }
  }

  async function reload(forceUpdate = false) {
    const prevConfig = config;
    clearPostcssConfigCache();
    config = await reloadConfig(prevConfig, inlineConfig, server?.config);

    transformCache.clear();
    const needToUpdateManifest =
      forceUpdate ||
      // FIXME: More precise comparison
      JSON.stringify(prevConfig) !== JSON.stringify(config);
    if (
      isWebPubConfig(config) &&
      config.viewerInput.needToGenerateManifest &&
      needToUpdateManifest
    ) {
      generateManifest(config);
    }

    // Write CMYK reserve map if configured
    generateCmykReserveMap(config);

    const localThemePaths = await prepareThemeDirectory(
      config,
      inlineConfig.signal,
    );

    const entriesLookup = createEntriesRouteLookup(
      config.entries,
      config.workspaceDir,
    );
    const urlMatchRe = new RegExp(
      `^${escapeRe(config.base)}(/[^?#]*)([?#].*)?$`,
      'v',
    );
    const serveWorkspace = sirv(config.workspaceDir, {
      dev: true,
      etag: false,
      dotfiles: true,
      extensions: [],
    });
    const serveWorkspaceMatcher = getWorkspaceMatcher(config);
    const serveAssets = sirv(config.entryContextDir, {
      dev: true,
      etag: false,
      dotfiles: false,
      extensions: [],
    });
    const serveAssetsMatcher = getAssetMatcher({
      ...config,
      cwd: config.entryContextDir,
    });
    program = {
      entriesLookup,
      urlMatchRe,
      serveWorkspace,
      serveWorkspaceMatcher,
      serveAssets,
      serveAssetsMatcher,
    };
    if (needToUpdateManifest) {
      Logger.debug(
        'dev-server > serveWorkspaceMatcher %O',
        serveWorkspaceMatcher.matcherConfig,
      );
      Logger.debug(
        'dev-server > serveAssetsMatcher %O',
        serveAssetsMatcher.matcherConfig,
      );
    }

    const configPath = locateVivliostyleConfig(inlineConfig);
    const projectDeps: string[] = [];
    if (configPath) {
      projectDeps.push(configPath);
      server?.watcher.add(configPath);
    }
    if (config.viewerInput.type === 'webpub') {
      projectDeps.push(config.viewerInput.manifestPath);
      server?.watcher.add(config.viewerInput.manifestPath);
    }

    const flattenWatchTarget = (themes: Set<ParsedTheme>) =>
      [...themes].flatMap((theme) => {
        if (theme.type === 'file') {
          return [theme.source];
        }
        if (theme.type === 'package' && !theme.registry) {
          return [theme.specifier];
        }
        return [];
      });
    const prevThemeFiles = flattenWatchTarget(prevConfig.themeIndexes);
    const themeFiles = flattenWatchTarget(config.themeIndexes);
    server?.watcher.unwatch(
      prevThemeFiles.filter((target) => !themeFiles.includes(target)),
    );
    server?.watcher.add(themeFiles);
    server?.watcher.add(localThemePaths);
    projectDeps.push(...themeFiles, ...localThemePaths);

    cssResolver = new ThemeCssResolver(config);
    const postcssConfig = await getPostcssConfig();
    if (postcssConfig?.file) {
      server?.watcher.add(postcssConfig.file);
      projectDeps.push(postcssConfig.file);
    }
    const cssEntries = collectThemeCssEntryFiles(config.themeIndexes);
    const cssScan = await scanCssDependencies({
      entryFiles: cssEntries.files,
      resolver: cssResolver,
      postcssConfig,
    });
    for (const error of [...cssEntries.errors, ...cssScan.errors]) {
      Logger.logError(getFormattedError(toError(error)));
    }
    const cssWatchFiles = cssScan.files.filter(
      (file) =>
        !pathContains(config.themesDir, file) &&
        !file.includes('/node_modules/'),
    );
    server?.watcher.add(cssWatchFiles);
    projectDeps.push(...cssWatchFiles);

    matchProjectDep = (pathname: string) =>
      projectDeps.some(
        (dep) => pathEquals(dep, pathname) || pathContains(dep, pathname),
      );
  }

  function transform(entry: ParsedEntry, host: string | undefined) {
    if (!isWebPubConfig(config)) {
      return;
    }
    // Respect the host header instead of the original rootUrl configuration,
    // as the dev server may run on a different port through a server other than Vite.
    const rootUrl = host
      ? `${server?.config.server.https ? 'https' : 'http'}://${host}`
      : config.rootUrl;
    const promise = (async () => {
      try {
        const html = await transformManuscript(entry, { ...config, rootUrl });
        if (!html) {
          transformCache.delete(entry.target);
          return;
        }
        const etag = `W/"${Date.now()}"`;
        if (entry.source?.type === 'file') {
          server?.watcher.add(entry.source.pathname);
        }
        return { content: html, etag };
      } catch (error: unknown) {
        server?.config.logger.error(
          getFormattedError(
            error instanceof Error ? error : new Error(String(error)),
          ),
        );
        transformCache.delete(entry.target);
      }
    })();
    transformCache.set(entry.target, promise);
    return promise;
  }

  async function transformAll(host?: string) {
    const tocEntries: ParsedEntry[] = [];
    for (const entry of config.entries) {
      if (entry.rel === 'contents') {
        // To transpile the table of contents, all dependent content must be transpiled in advance
        tocEntries.push(entry);
        continue;
      }
      await transform(entry, host);
    }
    for (const entry of tocEntries) {
      await transform(entry, host);
    }
  }

  function invalidate(entry: ParsedEntry) {
    const cwd = pathToFileURL(config.workspaceDir);
    const target = pathToFileURL(entry.target);
    if (target.href.indexOf(cwd.href) !== 0) {
      return;
    }
    transformCache.delete(entry.target);
    config.entries
      .filter((contentsEntry) => contentsEntry.rel === 'contents')
      .forEach((contentsEntry) => {
        transformCache.delete(contentsEntry.target);
      });
    server?.ws.send({
      type: 'full-reload',
      path: target.href.slice(cwd.href.length),
    });
  }

  const devServerMiddleware = async function vivliostyleDevServerMiddleware(
    req,
    res,
    next,
  ) {
    if (!program || req.url === undefined) {
      next();
      return;
    }
    const { entriesLookup, urlMatchRe } = program;
    const [_, pathname, qs] = decodeURI(req.url).match(urlMatchRe) ?? [];
    const match = pathname && entriesLookup(pathname);
    if (!match) {
      next();
      return;
    }
    const [entry, expected] = match;
    // Enforce using the actual path to match the full-reload event of the Vite client
    if (pathname !== expected) {
      res.statusCode = 301;
      res.setHeader('Location', `${expected}${qs || ''}`);
      return res.end();
    }

    Logger.debug('dev-server > request %s', pathname);
    const cachePromise = transformCache.get(entry.target);
    if (cachePromise) {
      const cached = await cachePromise;
      if (!cached) {
        next();
        return;
      }
      if (req.headers['if-none-match'] === cached.etag) {
        res.statusCode = 304;
        return res.end();
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html;charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Etag', cached.etag);
      return res.end(cached.content);
    }

    const { host } = req.headers;
    if (entry.rel === 'contents') {
      await transformAll(host);
    }
    const result = await transform(entry, host);
    if (!result) {
      next();
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Etag', result.etag);
    return res.end(result.content);
  } satisfies NextHandleFunction;

  const serveWorkspaceMiddleware = function vivliostyleServeWorkspaceMiddleware(
    req,
    res,
    next,
  ) {
    if (!config || !program || req.url === undefined) {
      next();
      return;
    }
    const requestUrl = req.url;
    const {
      urlMatchRe,
      serveWorkspace,
      serveWorkspaceMatcher,
      serveAssets,
      serveAssetsMatcher,
    } = program;
    const [_, pathname] = decodeURI(requestUrl).match(urlMatchRe) ?? [];
    if (!pathname) {
      next();
      return;
    }

    const handleWorkspace = (proceed: () => void) => {
      // oxlint-disable-next-line unicorn/prefer-regexp-test -- `match` is GlobMatcher's method, not String#match
      if (!serveWorkspaceMatcher.match(pathname.slice(1))) {
        proceed();
        return;
      }
      Logger.debug('dev-server > serveWorkspace %s', pathname);
      const url = requestUrl;
      req.url = requestUrl.slice(config.base.length);
      serveWorkspace(req, res, () => {
        req.url = url;
        proceed();
      });
    };

    const handleAssets = (proceed: () => void) => {
      // oxlint-disable-next-line unicorn/prefer-regexp-test -- `match` is GlobMatcher's method, not String#match
      if (!serveAssetsMatcher.match(pathname.slice(1))) {
        proceed();
        return;
      }
      Logger.debug('dev-server > serveAssets %s', pathname);
      const url = requestUrl;
      req.url = url.slice(config.base.length);
      serveAssets(req, res, () => {
        req.url = url;
        proceed();
      });
    };

    handleWorkspace(() => {
      handleAssets(next);
    });
  } satisfies NextHandleFunction;

  const serveCssMiddleware = async function vivliostyleServeCssMiddleware(
    req,
    res,
    next,
  ) {
    if (req.url === undefined) {
      next();
      return;
    }
    const urlMatchRe = new RegExp(
      `^${escapeRe(config.base)}(/[^?#]*)([?#].*)?$`,
      'v',
    );
    const [_, pathname] = decodeURI(req.url).match(urlMatchRe) ?? [];
    if (!pathname) {
      next();
      return;
    }

    const sendFile = (content: string | Buffer, contentType: string) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-cache');
      res.end(content);
    };
    const serveTransformedCss = async (file: string) => {
      const { code, errors } = await transformCssImports({
        code: fs.readFileSync(file, 'utf8'),
        importer: file,
        importerUrlPath: pathname,
        resolver: cssResolver,
        // Preview servers never run `reload`; the cached config makes this cheap
        postcssConfig: await getPostcssConfig(),
      });
      for (const error of errors) {
        Logger.logError(getFormattedError(toError(error)));
      }
      sendFile(code, 'text/css; charset=utf-8');
    };

    // Serve files of theme packages resolved outside of the workspace
    const mountedFile = cssResolver.resolveMountedFile(pathname);
    if (mountedFile) {
      Logger.debug('dev-server > serveMountedThemeFile %s', pathname);
      if (mountedFile.endsWith('.css')) {
        await serveTransformedCss(mountedFile);
      } else {
        sendFile(
          fs.readFileSync(mountedFile),
          mime(mountedFile) || 'application/octet-stream',
        );
      }
      return;
    }

    if (!pathname.endsWith('.css')) {
      next();
      return;
    }
    // The matchers restrict servable files on dev servers; preview servers
    // expose the whole directories and need no restriction
    const roots = [
      { root: config.workspaceDir, matcher: program?.serveWorkspaceMatcher },
      { root: config.entryContextDir, matcher: program?.serveAssetsMatcher },
    ];
    for (const { root, matcher } of roots) {
      // oxlint-disable-next-line unicorn/prefer-regexp-test -- `match` is GlobMatcher's method, not String#match
      if (matcher && !matcher.match(pathname.slice(1))) {
        continue;
      }
      const file = upath.join(root, pathname.slice(1));
      if (!pathContains(root, file) || !isFileSync(file)) {
        continue;
      }
      Logger.debug('dev-server > serveTransformedCss %s', pathname);
      await serveTransformedCss(file);
      return;
    }
    next();
  } satisfies NextHandleFunction;

  return {
    name: 'vivliostyle:dev-server',
    enforce: 'pre',

    configureServer(viteServer) {
      server = viteServer;
      const requestReload = debounce(async () => {
        try {
          await reload();
        } catch (error) {
          // An error inside the watcher callback leads to an unhandled
          // rejection, which kills the whole preview process
          Logger.logError(getFormattedError(toError(error)));
          return;
        }
        viteServer.ws.send({
          type: 'full-reload',
          path: '*',
        });
      }, 200);
      const handleUpdate = (pathname: string) => {
        if (!matchProjectDep?.(pathname)) {
          return;
        }
        requestReload();
      };
      viteServer.watcher.on('add', handleUpdate);
      viteServer.watcher.on('change', handleUpdate);
      viteServer.watcher.on('unlink', handleUpdate);

      return () => {
        viteServer.middlewares.use((req, res, next) => {
          void devServerMiddleware(req, res, next);
        });
        viteServer.middlewares.use((req, res, next) => {
          void serveCssMiddleware(req, res, next);
        });
        viteServer.middlewares.use(serveWorkspaceMiddleware);
      };
    },
    configurePreviewServer(viteServer) {
      return () => {
        viteServer.middlewares.use((req, res, next) => {
          void serveCssMiddleware(req, res, next);
        });
        viteServer.middlewares.use(
          config.base,
          sirv(config.workspaceDir, {
            dev: true,
            etag: false,
            dotfiles: true,
            extensions: [],
          }),
        );
        viteServer.middlewares.use(
          config.base,
          sirv(config.entryContextDir, {
            dev: true,
            etag: false,
            dotfiles: false,
            extensions: [],
          }),
        );
      };
    },
    async buildStart() {
      await reload(true);
      await transformAll();
    },
    handleHotUpdate(ctx) {
      const entry = config?.entries.find(
        (e) =>
          (e.source?.type === 'file' && e.source.pathname === ctx.file) ||
          (!e.source && e.target === ctx.file),
      );
      if (config && entry) {
        invalidate(entry);
      }
    },
  };
}
