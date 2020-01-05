import path from 'path';
import puppeteer from 'puppeteer';

import {
  findEntryPointFile,
  getBrokerUrl,
  launchSourceAndBrokerServer,
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
    const browser = await puppeteer.launch({
      headless: false,
      args: [sandbox ? '' : '--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 0, height: 0 });
    await page.goto(url);
  } catch (err) {
    console.trace(err);
    process.exit(1);
  }
}
