import { NextHandleFunction } from 'connect';
import { pathToFileURL } from 'node:url';
import upath from 'upath';
import * as vite from 'vite';
import {
  MergedConfig,
  ParsedEntry,
  WebPublicationManifestConfig,
} from '../input/config.js';
import {
  generateManifest,
  prepareThemeDirectory,
  transformManuscript,
} from '../processor/compile.js';
import { prependToHead, reloadConfig } from './plugin-util.js';

const themesRequestPath = `/@vivliostyle:themes`;
const urlSplitRe = /^([^?#]*)([?#].*)?$/;

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

export function vsDevServerPlugin({
  config: _config,
}: {
  config: MergedConfig;
}): vite.Plugin {
  let config = _config;
  let server: vite.ViteDevServer | undefined;
  let transformCache: Map<string, { content: string; etag: string }> =
    new Map();
  let entriesLookup: (
    uri: string,
  ) => readonly [ParsedEntry, string] | undefined;
  const projectDeps = new Set<string>();
  let themesRootPath: string | undefined;

  async function reload(forceUpdate = false) {
    const prevConfig = config;
    config = await reloadConfig({
      cliFlags: config.cliFlags,
      context: config.entryContextDir,
      prevConfig,
    });

    transformCache.clear();
    const needToUpdateManifest =
      forceUpdate ||
      // FIXME: More precise comparison
      JSON.stringify(prevConfig) !== JSON.stringify(config);
    if (config.needToGenerateManifest && needToUpdateManifest) {
      await generateManifest(config);
    }

    const cwd = pathToFileURL(config.workspaceDir);
    const themesDir = pathToFileURL(config.themesDir);
    themesRootPath =
      themesDir.href.indexOf(cwd.href) === 0
        ? themesDir.pathname.slice(cwd.pathname.length)
        : undefined;
    await prepareThemeDirectory(config);

    entriesLookup = createEntriesRouteLookup(
      config.entries,
      config.workspaceDir,
    );
    if (config.cliFlags.configPath) {
      projectDeps.add(config.cliFlags.configPath);
      server?.watcher.add(config.cliFlags.configPath);
    }
    if (config.manifestPath) {
      projectDeps.add(config.manifestPath);
      server?.watcher.add(config.manifestPath);
    }
  }

  async function transform(
    entry: ParsedEntry,
    config: MergedConfig & WebPublicationManifestConfig,
  ) {
    let html = await transformManuscript(entry, config);
    if (!html) {
      return;
    }
    // Inject Vite client script to enable HMR
    html = prependToHead(
      html,
      '<script type="module" src="/@vite/client"></script>',
    );
    const etag = `W/"${Date.now()}"`;
    transformCache.set(entry.target, { content: html, etag });
    if (entry.source) {
      server?.watcher.add(entry.source);
    }
    return { content: html, etag };
  }

  async function invalidate(entry: ParsedEntry, config: MergedConfig) {
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

  const middleware = async function vivliostyleDevServerMiddleware(
    req,
    res,
    next,
  ) {
    if (!config.manifestPath) {
      return next();
    }
    const [_, pathname, qs] = decodeURI(req.url!).match(urlSplitRe) ?? [];
    const match = pathname && entriesLookup?.(pathname);
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
    const cached = transformCache.get(entry.target);
    if (cached) {
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

    if (entry.rel === 'contents') {
      // To transpile the table of contents, all dependent content must be transpiled in advance
      await Promise.all(
        config.entries.flatMap((e) =>
          config.manifestPath && e.rel !== 'contents' && e.rel !== 'cover'
            ? transform(e, config)
            : [],
        ),
      );
    }
    const result = await transform(entry, config);
    if (!result) {
      return next();
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Etag', result.etag);
    return res.end(result.content);
  } satisfies NextHandleFunction;

  return {
    name: 'vivliostyle:dev-server',
    enforce: 'pre',

    async configureServer(viteServer) {
      server = viteServer;

      const handleUpdate = async (pathname: string) => {
        if (!projectDeps.has(pathname)) {
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
        viteServer.middlewares.use(middleware);
      };
    },
    async buildStart() {
      await reload(true);
    },
    async handleHotUpdate(ctx) {
      const entry = config.entries.find(
        (e) => e.source === ctx.file || (!e.source && e.target === ctx.file),
      );
      if (entry) {
        await invalidate(entry, config);
      }
    },
    resolveId(id) {
      if (themesRootPath && id.startsWith(themesRootPath)) {
        return `${themesRequestPath}${id.slice(themesRootPath.length)}`;
      }
    },
  };
}
