import http from 'http';
import resolvePkg from 'resolve-pkg';
import handler from 'serve-handler';
import upath from 'upath';
import { pathToFileURL, URL } from 'url';
import {
  beforeExitHandlers,
  debug,
  findAvailablePort,
  isUrlString,
} from './util';

export type PageSize = { format: string } | { width: string; height: string };

export interface Server {
  server: http.Server;
  port: number;
}

export type ViewerUrlOption = {
  size?: PageSize;
  style?: string;
  userStyle?: string;
  singleDoc?: boolean;
  quick?: boolean;
};

export type ServerOption = ViewerUrlOption & {
  input: string;
  workspaceDir: string;
  httpServer: boolean;
  viewer: string | undefined;
};

let _viewerServer: Server | undefined;
let _sourceServer: Server | undefined;

export async function prepareServer(option: ServerOption): Promise<{
  viewerFullUrl: string;
}> {
  const viewerUrl = await (option.viewer && isUrlString(option.viewer)
    ? new URL(option.viewer)
    : option.httpServer
    ? (async () => {
        const viewerRoot = resolvePkg('@vivliostyle/viewer', {
          cwd: __dirname,
        })!;
        _viewerServer = _viewerServer || (await launchServer(viewerRoot));

        const viewerUrl = new URL('http://localhost');
        viewerUrl.port = `${_viewerServer.port}`;
        viewerUrl.pathname = '/lib/index.html';
        return viewerUrl;
      })()
    : (() => {
        const viewerUrl = new URL('file://');
        viewerUrl.pathname = upath.join(
          resolvePkg('@vivliostyle/viewer', { cwd: __dirname })!,
          'lib/index.html',
        );
        return viewerUrl;
      })());

  const sourceUrl = await (isUrlString(option.input)
    ? new URL(option.input)
    : option.httpServer ||
      // Use http server because http viewer cannot access to file protocol
      (option.viewer && /^https?:/i.test(option.viewer))
    ? (async () => {
        _sourceServer =
          _sourceServer || (await launchServer(option.workspaceDir));

        const sourceUrl = new URL('http://localhost');
        sourceUrl.port = `${_sourceServer.port}`;
        sourceUrl.pathname = upath.relative(option.workspaceDir, option.input);
        return sourceUrl;
      })()
    : pathToFileURL(option.input));

  return {
    viewerFullUrl: getViewerFullUrl(option, {
      viewerUrl,
      sourceUrl,
    }),
  };
}

export function teardownServer() {
  if (_viewerServer) {
    _viewerServer.server.close();
    _viewerServer = undefined;
  }
  if (_sourceServer) {
    _sourceServer.server.close();
    _sourceServer = undefined;
  }
}

export function getViewerFullUrl(
  { size, style, userStyle, singleDoc, quick }: ViewerUrlOption,
  { viewerUrl, sourceUrl }: { viewerUrl: URL; sourceUrl: URL },
): string {
  const pageSizeValue =
    size && ('format' in size ? size.format : `${size.width} ${size.height}`);

  function escapeParam(url: string) {
    return url.replace(/&/g, '%26');
  }

  let viewerParams = `src=${escapeParam(sourceUrl.href)}`;
  viewerParams += `&bookMode=${!singleDoc}&renderAllPages=${!quick}`;

  if (style) {
    viewerParams += `&style=${escapeParam(style)}`;
  }

  if (userStyle) {
    viewerParams += `&userStyle=${escapeParam(userStyle)}`;
  }

  if (pageSizeValue) {
    viewerParams +=
      '&userStyle=data:,/*<viewer>*/' +
      encodeURIComponent(`@page{size:${pageSizeValue}!important;}`) +
      '/*</viewer>*/';
  }

  return `${viewerUrl.href}#${viewerParams}`;
}

function startEndpoint(root: string): http.Server {
  const serve = (req: http.IncomingMessage, res: http.ServerResponse) =>
    handler(req, res, {
      public: root,
      cleanUrls: false,
      directoryListing: false,
      headers: [
        {
          source: '**',
          headers: [
            {
              key: 'access-control-allow-headers',
              value: 'Origin, X-Requested-With, Content-Type, Accept, Range',
            },
            {
              key: 'access-control-allow-origin',
              value: '*',
            },
            {
              key: 'cache-control',
              value: 'no-cache, no-store, must-revalidate',
            },
          ],
        },
      ],
    });
  return http.createServer(serve);
}

async function launchServer(root: string): Promise<Server> {
  const port = await findAvailablePort();
  debug(`Launching server... root: ${root} port: ${port}`);

  const server = startEndpoint(root);

  return await new Promise((resolve) => {
    server.listen(port, 'localhost', () => {
      beforeExitHandlers.push(() => {
        server.close();
      });
      resolve({ server, port });
    });
  });
}
