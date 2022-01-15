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

export interface ServerOption {
  input: string;
  workspaceDir: string;
  httpServer: boolean;
  size?: PageSize;
  style?: string;
  userStyle?: string;
  singleDoc?: boolean;
  quick?: boolean;
}

let _brokerServer: Server;
let _sourceServer: Server;

export async function prepareServer(option: ServerOption): Promise<{
  brokerUrl: string;
}> {
  let brokerServer: Server | undefined;
  if (option.httpServer) {
    const brokerRoot = resolvePkg('@vivliostyle/viewer', { cwd: __dirname })!;
    _brokerServer = _brokerServer || (await launchServer(brokerRoot));
    brokerServer = _brokerServer;
  }

  let sourceServer: Server | undefined;
  if (brokerServer && !isUrlString(option.input)) {
    _sourceServer = _sourceServer || (await launchServer(option.workspaceDir));
    sourceServer = _sourceServer;
  }

  return {
    brokerUrl: getBrokerUrl(option, {
      brokerServer,
      sourceServer,
    }),
  };
}

function getBrokerUrl(
  {
    input,
    workspaceDir,
    size,
    style,
    userStyle,
    singleDoc,
    quick,
  }: ServerOption,
  {
    brokerServer,
    sourceServer,
  }: { brokerServer?: Server; sourceServer?: Server },
): string {
  const viewerUrl = brokerServer
    ? (() => {
        const viewerUrl = new URL('http://localhost');
        viewerUrl.port = `${brokerServer.port}`;
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
      })();

  const pageSizeValue =
    size && ('format' in size ? size.format : `${size.width} ${size.height}`);

  function escapeParam(url: string) {
    return url.replace(/&/g, '%26');
  }

  let viewerParams = '';
  if (sourceServer) {
    const sourceUrl = new URL('http://localhost');
    sourceUrl.port = `${sourceServer.port}`;
    sourceUrl.pathname = upath.relative(workspaceDir, input);
    viewerParams += `src=${escapeParam(sourceUrl.href)}`;
  } else {
    const sourceUrl = isUrlString(input)
      ? new URL(input)
      : pathToFileURL(input);
    viewerParams += `src=${escapeParam(sourceUrl.href)}`;
  }

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
