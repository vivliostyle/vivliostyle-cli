import http from 'node:http';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import handler from 'serve-handler';
import { viewerRoot } from './const.js';
import {
  beforeExitHandlers,
  debug,
  findAvailablePort,
  isUrlString,
  upath,
} from './util.js';

export type PageSize = { format: string } | { width: string; height: string };

export interface Server {
  server: http.Server;
  port: number;
}

export type ViewerUrlOption = {
  size?: PageSize;
  cropMarks?: boolean;
  bleed?: string;
  cropOffset?: string;
  css?: string;
  style?: string;
  userStyle?: string;
  singleDoc?: boolean;
  quick?: boolean;
  viewerParam?: string | undefined;
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
        _viewerServer = _viewerServer || (await launchServer(viewerRoot));

        const viewerUrl = new URL('http://localhost');
        viewerUrl.port = `${_viewerServer.port}`;
        viewerUrl.pathname = '/lib/index.html';
        return viewerUrl;
      })()
    : (() => {
        const viewerUrl = new URL('file://');
        viewerUrl.pathname = upath.join(viewerRoot, 'lib/index.html');
        return viewerUrl;
      })());

  const inputUrl = isUrlString(option.input)
    ? new URL(option.input)
    : pathToFileURL(option.input);
  const sourceUrl = await (async () => {
    if (
      inputUrl.protocol === 'file:' &&
      (option.httpServer ||
        // Use http server because http viewer cannot access to file protocol
        (option.viewer && /^https?:/i.test(option.viewer)))
    ) {
      _sourceServer =
        _sourceServer || (await launchServer(option.workspaceDir));

      const sourceUrl = new URL('http://localhost');
      sourceUrl.port = `${_sourceServer.port}`;
      sourceUrl.pathname = upath.relative(
        option.workspaceDir,
        fileURLToPath(inputUrl),
      );
      return sourceUrl;
    }
    return inputUrl;
  })();

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
  {
    size,
    cropMarks,
    bleed,
    cropOffset,
    css,
    style,
    userStyle,
    singleDoc,
    quick,
    viewerParam,
  }: ViewerUrlOption,
  { viewerUrl, sourceUrl }: { viewerUrl: URL; sourceUrl: URL },
): string {
  const pageSizeValue =
    size && ('format' in size ? size.format : `${size.width} ${size.height}`);

  function escapeParam(url: string) {
    return url.replace(/&/g, '%26');
  }

  let viewerParams =
    sourceUrl.href === 'data:,'
      ? '' // open Viewer start page
      : `src=${escapeParam(sourceUrl.href)}`;
  viewerParams += `&bookMode=${!singleDoc}&renderAllPages=${!quick}`;

  if (style) {
    viewerParams += `&style=${escapeParam(style)}`;
  }

  if (userStyle) {
    viewerParams += `&userStyle=${escapeParam(userStyle)}`;
  }

  if (pageSizeValue || cropMarks || bleed || cropOffset || css) {
    let pageStyle = '@page{';
    if (pageSizeValue) {
      pageStyle += `size:${pageSizeValue};`;
    }
    if (cropMarks) {
      pageStyle += `marks:crop cross;`;
    }
    if (bleed || cropMarks) {
      pageStyle += `bleed:${bleed ?? '3mm'};`;
    }
    if (cropOffset) {
      pageStyle += `crop-offset:${cropOffset};`;
    }
    pageStyle += '}';

    // The pageStyle settings are put between the `/*<viewer>*/` and `/*</viewer>*/`
    // in the `&style=data:,…` viewer parameter so that they are reflected in the
    // Settings menu of the Viewer. Also the custom CSS code is appended after the
    // `/*</viewer>*/` so that it is shown in the Edit CSS box in the Settings menu.
    viewerParams += `&style=data:,/*<viewer>*/${encodeURIComponent(
      pageStyle,
    )}/*</viewer>*/${encodeURIComponent(css ?? '')}`;
  }

  if (viewerParam) {
    // append additional viewer parameters
    viewerParams += `&${viewerParam}`;
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
