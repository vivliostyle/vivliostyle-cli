import { NextHandleFunction } from 'connect';
import escapeRe from 'escape-string-regexp';
import { pathToFileURL } from 'node:url';
import sirv, { RequestHandler } from 'sirv';
import upath from 'upath';
import * as vite from 'vite';
import { locateVivliostyleConfig } from '../config/load.js';
import {
  isWebPubConfig,
  ParsedEntry,
  ParsedTheme,
  ResolvedTaskConfig,
  WebPublicationManifestConfig,
} from '../config/resolve.js';
import { ParsedVivliostyleInlineConfig } from '../config/schema.js';
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
import { getFormattedError, pathContains, pathEquals } from '../util.js';
import { reloadConfig } from './plugin-util.js';

// Ref: https://github.com/lukeed/sirv
function createEntriesRouteLookup(entries: ParsedEntry[], cwd: string) {
  const extns = ['', 'html', 'htm'];
  const toAssume = (uri: string) => {
    let i = 0,
      x,
      len = uri.length - 1;
    if (uri.charCodeAt(len) === 47) {
      uri = uri.substring(0, len);
    }
    let arr = [],
      tmp = `${uri}/index`;
    for (; i < extns.length; i++) {
      x = extns[i] ? `.${extns[i]}` : '';
      if (uri) arr.push(uri + x);
      arr.push(tmp + x);
    }

    return arr;
  };
  const cache = entries.reduce<Record<string, ParsedEntry>>((acc, e) => {
    acc[`/${upath.relative(cwd, e.target).normalize().replace(/\\+/g, '/')}`] =
      e;
    return acc;
  }, {});
  return (uri: string) => {
    let i = 0,
      data,
      arr = toAssume(uri);
    for (; i < arr.length; i++) {
      if ((data = cache[arr[i]])) return [data, arr[i]] as const;
    }
  };
}

function getWorkspaceMatcher({
  workspaceDir,
  themesDir,
  viewerInput,
  themeIndexes,
  entries,
  outputs,
}: ResolvedTaskConfig) {
  if (viewerInput.type === 'webpub') {
    return getWebPubResourceMatcher({
      outputs,
      themesDir,
      entries,
      cwd: workspaceDir,
      manifestPath: viewerInput.manifestPath,
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

  async function reload(forceUpdate = false) {
    const prevConfig = config;
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
      await generateManifest(config);
    }

    await prepareThemeDirectory(config);

    const entriesLookup = createEntriesRouteLookup(
      config.entries,
      config.workspaceDir,
    );
    const urlMatchRe = new RegExp(
      `^${escapeRe(config.base)}(/[^?#]*)([?#].*)?$`,
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
    projectDeps.push(...themeFiles);
    matchProjectDep = (pathname: string) =>
      projectDeps.some(
        (dep) => pathEquals(dep, pathname) || pathContains(dep, pathname),
      );
  }

  async function transform(
    entry: ParsedEntry,
    config: ResolvedTaskConfig & { viewerInput: WebPublicationManifestConfig },
    host: string | undefined,
  ) {
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
      } catch (error: any) {
        server?.config.logger.error(getFormattedError(error));
        transformCache.delete(entry.target);
        return;
      }
    })();
    transformCache.set(entry.target, promise);
    return await promise;
  }

  async function invalidate(entry: ParsedEntry, config: ResolvedTaskConfig) {
    const cwd = pathToFileURL(config.workspaceDir);
    const target = pathToFileURL(entry.target);
    if (target.href.indexOf(cwd.href) !== 0) {
      return;
    }
    transformCache.delete(entry.target);
    config.entries
      .filter((entry) => entry.rel === 'contents')
      .forEach((entry) => {
        transformCache.delete(entry.target);
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
    if (!isWebPubConfig(config) || !program) {
      return next();
    }
    const { entriesLookup, urlMatchRe } = program;
    const [_, pathname, qs] = decodeURI(req.url!).match(urlMatchRe) ?? [];
    const match = pathname && entriesLookup(pathname);
    if (!match) {
      return next();
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
        return next();
      }
      if (req.headers['if-none-match'] === cached.etag) {
        res.statusCode = 304;
        return res.end();
      } else {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Etag', cached.etag);
        return res.end(cached.content);
      }
    }

    const { host } = req.headers;
    if (entry.rel === 'contents') {
      // To transpile the table of contents, all dependent content must be transpiled in advance
      const _config = { ...config };
      await Promise.all(
        _config.entries.flatMap((e) =>
          isWebPubConfig(_config) && e.rel !== 'contents' && e.rel !== 'cover'
            ? transform(e, _config, host)
            : [],
        ),
      );
    }
    const result = await transform(entry, config, host);
    if (!result) {
      return next();
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Etag', result.etag);
    return res.end(result.content);
  } satisfies NextHandleFunction;

  const serveWorkspaceMiddleware =
    async function vivliostyleServeWorkspaceMiddleware(req, res, next) {
      if (!config || !program) {
        return next();
      }
      const {
        urlMatchRe,
        serveWorkspace,
        serveWorkspaceMatcher,
        serveAssets,
        serveAssetsMatcher,
      } = program;
      const [_, pathname] = decodeURI(req.url!).match(urlMatchRe) ?? [];
      if (!pathname) {
        return next();
      }

      const handleWorkspace = (next: () => void) => {
        if (!serveWorkspaceMatcher.match(pathname.slice(1))) {
          return next();
        }
        Logger.debug('dev-server > serveWorkspace %s', pathname);
        const url = req.url!;
        req.url = req.url!.slice(config.base.length);
        return serveWorkspace(req, res, () => {
          req.url = url;
          next();
        });
      };

      const handleAssets = (next: () => void) => {
        if (!serveAssetsMatcher.match(pathname.slice(1))) {
          return next();
        }
        Logger.debug('dev-server > serveAssets %s', pathname);
        const url = req.url!;
        req.url = url!.slice(config.base.length);
        return serveAssets(req, res, () => {
          req.url = url;
          next();
        });
      };

      handleWorkspace(() => handleAssets(next));
    } satisfies NextHandleFunction;

  return {
    name: 'vivliostyle:dev-server',
    enforce: 'pre',

    configureServer(viteServer) {
      server = viteServer;

      const handleUpdate = async (pathname: string) => {
        if (!matchProjectDep?.(pathname)) {
          return;
        }
        await reload();
        viteServer.ws.send({
          type: 'full-reload',
          path: '*',
        });
      };
      viteServer.watcher.on('add', handleUpdate);
      viteServer.watcher.on('change', handleUpdate);
      viteServer.watcher.on('unlink', handleUpdate);

      return () => {
        viteServer.middlewares.use(devServerMiddleware);
        viteServer.middlewares.use(serveWorkspaceMiddleware);
      };
    },
    configurePreviewServer(viteServer) {
      return () => {
        viteServer.middlewares.use(
          config.base,
          sirv(config.workspaceDir, { dev: true, etag: false, extensions: [] }),
        );
      };
    },
    async buildStart() {
      await reload(true);
    },
    async handleHotUpdate(ctx) {
      const entry = config?.entries.find(
        (e) =>
          (e.source?.type === 'file' && e.source.pathname === ctx.file) ||
          (!e.source && e.target === ctx.file),
      );
      if (config && entry) {
        await invalidate(entry, config);
      }
    },
  };
}
