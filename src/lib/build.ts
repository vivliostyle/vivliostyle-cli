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
import { log, statFile, findEntryPointFile, debug } from './util';

type ResolveFunction<T> = (value?: T | PromiseLike<T>) => void;
type RejectFunction = (reason?: any) => void;

export interface SaveOption {
  input: string;
  outputPath: string;
  size: number | string;
  vivliostyleTimeout: number;
  rootDir?: string;
  loadMode: LoadMode;
  sandbox: boolean;
  pressReady: boolean;
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

export default async function run({
  input,
  outputPath,
  size,
  vivliostyleTimeout,
  rootDir,
  loadMode = 'document',
  sandbox = true,
  pressReady = false,
}: SaveOption) {
  const stat = await statFile(input);
  const root = rootDir || (stat.isDirectory() ? input : path.dirname(input));
  const sourceIndex = await findEntryPointFile(input, root);

  const outputFile =
    fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()
      ? path.resolve(outputPath, 'output.pdf')
      : outputPath;
  const outputSize = parseSize(size);

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

  log(`Launching build environment... `);
  const browser = await puppeteer.launch({
    headless: true,
    // Why `--no-sandbox` flag? Running Chrome as root without --no-sandbox is not supported. See https://crbug.com/638180.
    args: [sandbox ? '' : '--no-sandbox'],
  });
  const version = await browser.version();
  debug(chalk.green(`success [version=${version}]`));
  const page = await browser.newPage();

  log('Building pages... ');

  await page.goto(navigateURL, { waitUntil: 'networkidle0' });

  const checkBuildComplete = function(freq: number = 1000): Promise<void> {
    let time = 0;

    function fn(resolve: ResolveFunction<void>, reject: RejectFunction) {
      setTimeout(async () => {
        if (time > vivliostyleTimeout) {
          return reject(new Error('Running Vivliostyle process timed out.'));
        }

        const readyState = await page.evaluate(
          () =>
            ((window as unknown) as Window & {
              coreViewer: { readyState: string };
            }).coreViewer.readyState,
        );

        if (readyState === 'complete') {
          return resolve();
        }

        time += freq;
        fn(resolve, reject);
      }, freq);
    }

    return new Promise((resolve, reject) => fn(resolve, reject));
  };

  await page.emulateMediaType('print');
  await checkBuildComplete();

  log('Printing to PDF... ');

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
