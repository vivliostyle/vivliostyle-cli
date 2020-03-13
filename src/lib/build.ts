import fs from 'fs';
import os from 'os';
import path from 'path';
import chalk from 'chalk';
import uuid from 'uuid/v1';
import puppeteer from 'puppeteer';
import * as pressReadyModule from 'press-ready';

import {
  getBrokerUrl,
  launchSourceAndBrokerServer,
  LoadMode,
  PageSize,
} from './server';
import {
  log,
  statFile,
  findEntryPointFile,
  debug,
  retry,
  launchBrowser,
} from './util';

export interface BuildOption {
  input: string;
  outputPath: string;
  size?: number | string;
  timeout: number;
  rootDir?: string;
  loadMode: LoadMode;
  sandbox: boolean;
  pressReady: boolean;
  executableChromium?: string;
}

function parseSize(size: string | number): PageSize {
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

export default async function run({
  input,
  outputPath,
  size,
  timeout,
  rootDir,
  loadMode = 'document',
  sandbox = true,
  pressReady = false,
  executableChromium,
}: BuildOption) {
  const stat = await statFile(input);
  const root = rootDir || (stat.isDirectory() ? input : path.dirname(input));
  const sourceIndex = await findEntryPointFile(input, root);

  const outputFile =
    fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()
      ? path.resolve(outputPath, 'output.pdf')
      : outputPath;
  const outputSize = size ? parseSize(size) : undefined;

  const [source, broker] = await launchSourceAndBrokerServer(root);
  const sourcePort = source.port;
  const brokerPort = broker.port;
  const navigateURL = getBrokerUrl({
    sourcePort,
    sourceIndex,
    brokerPort,
    loadMode,
    outputSize,
  });
  debug('brokerURL', navigateURL);

  log(`Launching build environment...`);
  debug(
    `Executing Chromium path: ${executableChromium ||
      puppeteer.executablePath()}`,
  );
  const browser = await launchBrowser({
    headless: true,
    executablePath: executableChromium || puppeteer.executablePath(),
    // Why `--no-sandbox` flag? Running Chrome as root without --no-sandbox is not supported. See https://crbug.com/638180.
    args: [sandbox ? '' : '--no-sandbox'],
  });
  const version = await browser.version();
  debug(chalk.green('success'), `version=${version}`);

  const page = await browser.newPage();

  page.on('pageerror', (error) => {
    debug(chalk.red('broker:error'), error.message);
  });

  page.on('console', (msg) =>
    debug(chalk.magenta('broker:console'), msg.text()),
  );

  page.on('response', (response) => {
    debug(
      chalk.gray('broker:response'),
      chalk.green(response.status().toString()),
      response.url(),
    );
    if (300 > response.status() && 200 <= response.status()) return;
    debug(chalk.red('broker:failedRequest'), response.status(), response.url());
  });

  log('Building pages...');

  await page.goto(navigateURL, { waitUntil: 'networkidle0' });
  await page.emulateMediaType('print');
  await retry(
    async () => {
      const readyState = await page.evaluate(
        () =>
          ((window as unknown) as Window & {
            coreViewer: { readyState: string };
          }).coreViewer.readyState,
      );

      if (readyState !== 'complete') {
        throw new Error(`Document being rendered: ${readyState}`);
      }
    },
    { timeout },
  );

  log('Generating PDF...');

  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `vivliostyle-cli-${uuid()}.pdf`);

  await page.pdf({
    margin: {
      top: 0,
      bottom: 0,
      right: 0,
      left: 0,
    },
    printBackground: true,
    preferCSSPageSize: true,
    path: tmpPath,
  });

  await browser.close();

  if (pressReady) {
    log(`Running press-ready`);
    await pressReadyModule.build({
      input: tmpPath,
      output: outputFile,
    });
  } else {
    fs.copyFileSync(tmpPath, outputFile);
  }

  log(`🎉  Done`);
  log(`${chalk.bold(outputFile)} has been created`);

  // TODO: gracefully exit broker & source server
  process.exit(0);
}
