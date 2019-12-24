import fs from 'fs';
import path from 'path';

import {
  findEntryPointFile,
  getBrokerUrl,
  launchSourceAndBrokerServer,
  launchChrome,
  LoadMode,
  statPromise,
} from './misc';

export interface PreviewOption {
  input: string;
  rootDir?: string;
  loadMode: LoadMode;
  sandbox: boolean;
}

export default async function run({
  input,
  rootDir,
  loadMode = 'document',
  sandbox = true,
}: PreviewOption) {
  const stat = await statPromise(input).catch((err) => {
    if (err.code === 'ENOENT') {
      throw new Error(`Specified input doesn't exists: ${input}`);
    }
    throw err;
  });
  const root = rootDir || (stat.isDirectory() ? input : path.dirname(input));
  const sourceIndex = await findEntryPointFile(input, root);

  try {
    const [source, broker] = await launchSourceAndBrokerServer(root);

    const sourcePort = source.port;
    const brokerPort = broker.port;
    const url = getBrokerUrl({
      sourcePort,
      sourceIndex,
      brokerPort,
      loadMode,
    });

    console.log(`Opening preview page... ${url}`);

    launchChrome({
      startingUrl: url,
      chromeFlags: sandbox ? [] : ['--no-sandbox'],
    }).catch((err) => {
      if (err.code === 'ECONNREFUSED') {
        console.log(
          `Cannot launch Chrome. use --no-sandbox option or open ${url} directly.`,
        );
        // Should still run
      } else {
        console.log(
          'Cannot launch Chrome. Did you install it?\nvivliostyle-cli supports Chrome (Canary) only.',
        );
        process.exit(1);
      }
    });
  } catch (err) {
    console.trace(err);
    process.exit(1);
  }
}
