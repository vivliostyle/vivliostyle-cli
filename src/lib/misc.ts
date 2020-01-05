import fs from 'fs';
import url from 'url';
import util from 'util';
import path from 'path';
import http, { RequestListener } from 'http';
import https from 'https';
import portfinder from 'portfinder';
import handler from 'serve-handler';
import * as chromeLauncher from 'chrome-launcher';

export type LoadMode = 'document' | 'book';
export type PageSize = { format: string } | { width: string; height: string };
type SourceServer = Server;
type BrokerServer = Server;
type NextFunction = (err?: any) => void;
type RequestHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: NextFunction,
) => void;

export interface Server {
  server: http.Server | https.Server;
  port: number;
}

export interface GetBrokerURLOption {
  sourcePort: number;
  sourceIndex: string;
  brokerPort: number;
  loadMode: LoadMode;
  outputSize?: PageSize;
}

export function parseSize(size: string | number): PageSize {
  const [width, height, ...others] = size ? `${size}`.split(',') : [];
  if (others.length) {
    throw new Error(`Cannot parse size: ${size}`);
  } else if (width && height) {
    return {
      width,
      height,
    };
  } else {
    return {
      format: width || 'Letter',
    };
  }
}

export function findEntryPointFile(
  target: string,
  root: string,
): Promise<string> {
  return new Promise((resolve) => {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      return resolve(path.relative(root, target));
    }
    const files = fs.readdirSync(target);
    const index = [
      'index.html',
      'index.htm',
      'index.xhtml',
      'index.xht',
    ].find((n) => files.includes(n));
    if (index) {
      return resolve(path.relative(root, path.resolve(target, index)));
    }

    // give up finding entrypoint
    resolve(path.relative(root, target));
  });
}

export function findPort(): Promise<number> {
  portfinder.basePort = 13000;
  return portfinder.getPortPromise();
}

export function getBrokerUrl({
  sourcePort,
  sourceIndex,
  brokerPort,
  loadMode = 'document',
  outputSize,
}: GetBrokerURLOption) {
  const sourceURL = url.format({
    protocol: 'http',
    hostname: 'localhost',
    port: sourcePort,
    pathname: sourceIndex,
  });

  return url.format({
    protocol: 'http',
    hostname: 'localhost',
    port: brokerPort,
    pathname: '/broker/index.html',
    query: {
      render: sourceURL,
      loadMode,
      ...outputSize,
    },
  });
}

export function startEndpoint({
  root,
  before = [],
}: {
  root: string;
  before?: RequestHandler[];
}): http.Server {
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
  const listener = before.reduceRight<RequestListener>(
    (prv, cur) => (req, res) => cur(req, res, () => prv(req, res)),
    serve,
  );
  return http.createServer(listener);
}

export async function launchSourceAndBrokerServer(
  root: string,
): Promise<[SourceServer, BrokerServer]> {
  try {
    const source = await launchSourceServer(root);
    const broker = await launchBrokerServer().catch((e) => {
      source.server.close();
      throw e;
    });
    return [source, broker];
  } catch (e) {
    throw e;
  }
}

export function launchBrokerServer(): Promise<BrokerServer> {
  return new Promise(async (resolve) => {
    const port = await findPort();

    console.log(`Launching broker server... http://localhost:${port}`);

    const beforeHook: RequestHandler = (req, res, next) => {
      // Provide node_modules
      let resolvedPath;
      if (req.url && req.url.startsWith('/node_modules')) {
        const pathName = url.parse(req.url).pathname!;
        const moduleName = pathName.substr(14).replace('..', '');
        try {
          resolvedPath = require.resolve(moduleName);
        } catch (e) {
          if (e.code !== 'MODULE_NOT_FOUND') {
            next();
            throw e;
          }
        }
      }

      if (!resolvedPath) {
        return next(); // module not found
      }

      const stream = fs.createReadStream(resolvedPath);
      stream.pipe(res); // send module to client
    };

    const server = startEndpoint({
      root: path.resolve(__dirname, '../..'),
      before: [beforeHook],
    });

    server.listen(port, 'localhost', () => {
      (['exit', 'SIGNIT', 'SIGTERM'] as NodeJS.Signals[]).forEach((sig) => {
        process.on(sig, () => {
          server.close();
        });
      });
      resolve({ server, port });
    });
  });
}

export function launchSourceServer(root: string): Promise<SourceServer> {
  return new Promise(async (resolve) => {
    const port = await findPort();

    console.log(`Launching source server... http://localhost:${port}`);

    const server = startEndpoint({ root });

    server.listen(port, 'localhost', () => {
      (['exit', 'SIGNIT', 'SIGTERM'] as NodeJS.Signals[]).forEach((sig) => {
        process.on(sig, () => {
          server.close();
        });
      });
      resolve({ server, port });
    });
  });
}

export async function launchChrome(launcherOptions: chromeLauncher.Options) {
  const launcher = await chromeLauncher.launch(launcherOptions);

  (['exit', 'SIGNIT', 'SIGTERM'] as NodeJS.Signals[]).forEach((sig) => {
    process.on(sig, () => {
      launcher.kill();
    });
  });

  return launcher;
}

export const statPromise = util.promisify(fs.stat);
