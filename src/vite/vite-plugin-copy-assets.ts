import { NextHandleFunction } from 'connect';
import picomatch from 'picomatch';
import sirv, { RequestHandler } from 'sirv';
import * as vite from 'vite';
import { MergedConfig } from '../input/config.js';
import {
  getDefaultIgnorePatterns,
  getIgnoreAssetPatterns,
} from '../processor/compile.js';
import { reloadConfig } from './plugin-util.js';

export function vsCopyAssetsPlugin({
  config: _config,
}: {
  config: MergedConfig;
}): vite.Plugin {
  let config = _config;
  let matcher: picomatch.Matcher;
  let serve: RequestHandler;

  async function reload() {
    config = await reloadConfig({
      cliFlags: config.cliFlags,
      context: config.entryContextDir,
      prevConfig: config,
    });

    const {
      entryContextDir: cwd,
      themesDir,
      copyAsset,
      outputs,
      entries,
    } = config;
    const ignorePatterns = [
      ...copyAsset.excludes,
      ...getIgnoreAssetPatterns({ outputs, entries, cwd }),
    ];
    const weakIgnorePatterns = getDefaultIgnorePatterns({ themesDir, cwd });

    // Step 1: Glob files with an extension in `fileExtension`
    // Ignore files in node_modules directory, theme example files and files matched `excludes`
    const fileExtensionMatcher = picomatch(
      copyAsset.fileExtensions.map((ext) => `**/*.${ext}`),
      {
        ignore: [...ignorePatterns, ...weakIgnorePatterns],
      },
    );
    // Step 2: Glob files matched with `includes`
    // Ignore only files matched `excludes`
    const includeMatcher = picomatch(copyAsset.includes, {
      ignore: ignorePatterns,
    });
    matcher = (test: string) =>
      fileExtensionMatcher(test) || includeMatcher(test);
    serve = sirv(cwd, { dev: true, etag: false, extensions: [] });
  }

  const middleware = async function vivliostyleCopyAssetsMiddleware(
    req,
    res,
    next,
  ) {
    if (matcher(req.url!)) {
      return serve(req, res, next);
    }
    next();
  } satisfies NextHandleFunction;

  return {
    name: 'vivliostyle:copy-assets',
    async configureServer(viteServer) {
      const { configPath } = config.cliFlags;
      if (configPath) {
        viteServer.watcher.add(configPath);
      }
      viteServer.watcher.on('change', async (pathname) => {
        if (pathname === configPath) {
          await reload();
        }
      });

      await reload();
      return () => {
        viteServer.middlewares.use(middleware);
      };
    },
  };
}
