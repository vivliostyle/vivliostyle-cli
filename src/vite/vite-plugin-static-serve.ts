import sirv from 'sirv';
import upath from 'upath';
import * as vite from 'vite';
import { ResolvedTaskConfig } from '../config/resolve.js';
import { ParsedVivliostyleInlineConfig } from '../config/schema.js';

export function vsStaticServePlugin({
  config: _config,
  inlineConfig,
}: {
  config: ResolvedTaskConfig;
  inlineConfig: ParsedVivliostyleInlineConfig;
}): vite.Plugin {
  let config = _config;

  const createMiddlewares = () =>
    Object.entries(config.static).flatMap(([base, dirs]) =>
      dirs.map(
        (dir) =>
          [
            base,
            sirv(upath.resolve(config.context, dir), {
              dev: true,
              etag: false,
            }),
          ] as const,
      ),
    );

  return {
    name: 'vivliostyle:static-serve',
    apply: () => Boolean(inlineConfig.enableStaticServe),
    configureServer(viteServer) {
      return () => {
        createMiddlewares().forEach(([base, middleware]) => {
          viteServer.middlewares.use(base, middleware);
        });
      };
    },

    configurePreviewServer(viteServer) {
      return () => {
        createMiddlewares().forEach(([base, middleware]) => {
          viteServer.middlewares.use(base, middleware);
        });
      };
    },
  };
}
