import path from 'path';
import puppeteer from 'puppeteer';

import { getBrokerUrl, launchSourceAndBrokerServer, LoadMode } from './server';
import { findEntryPointFile, statFile, debug, launchBrowser } from './util';

export interface PreviewOption {
  input: string;
  rootDir?: string;
  loadMode: LoadMode;
  sandbox: boolean;
  executableChromium?: string;
}

export default async function run({
  input,
  rootDir,
  loadMode = 'document',
  sandbox = true,
  executableChromium,
}: PreviewOption) {
  const stat = await statFile(input);
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
    debug(
      `Executing Chromium path: ${executableChromium ||
        puppeteer.executablePath()}`,
    );
    const browser = await launchBrowser({
      headless: false,
      executablePath: executableChromium || puppeteer.executablePath(),
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
