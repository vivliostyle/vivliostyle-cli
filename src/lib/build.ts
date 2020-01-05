import fs from 'fs';
import path from 'path';
import puppeteer, { PDFOptions } from 'puppeteer';

import {
  findEntryPointFile,
  getBrokerUrl,
  launchSourceAndBrokerServer,
  LoadMode,
  statPromise,
  parseSize,
} from './misc';

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
}

export default async function run({
  input,
  outputPath,
  size,
  vivliostyleTimeout,
  rootDir,
  loadMode = 'document',
  sandbox = true,
}: SaveOption) {
  const stat = await statPromise(input).catch((err) => {
    if (err.code === 'ENOENT') {
      throw new Error(`Specified input doesn't exists: ${input}`);
    }
    throw err;
  });
  const root = rootDir || (stat.isDirectory() ? input : path.dirname(input));
  const sourceIndex = await findEntryPointFile(input, root);

  const outputFile =
    fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()
      ? path.resolve(outputPath, 'output.pdf')
      : outputPath;
  const outputSize = parseSize(size);

  try {
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

    console.log(`Launching headless Chrome...`);
    const browser = await puppeteer.launch({
      headless: true,
      defaultViewport: {
        width: 1280,
        height: 720,
      },
      args: ['--disable-gpu', sandbox ? '' : '--no-sandbox'],
    });
    const version = await browser.version();
    console.log(version);
    const page = await browser.newPage();

    console.log('Running Vivliostyle...');
    console.log(navigateURL);
    const session = await page.target().createCDPSession();
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    session.on('CSS.fontsUpdated', (event) => {
      console.log(event);
      // event will be received when browser updates fonts on the page due to webfont loading.
    });
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
          console.log(readyState);
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

    console.log('Printing to PDF...');

    let printConfig: PDFOptions = {
      path: outputFile,
      margin: {
        top: 0,
        bottom: 0,
        right: 0,
        left: 0,
      },
      printBackground: true,
    };

    await page.pdf({
      marginTop: 0,
      marginBottom: 0,
      marginRight: 0,
      marginLeft: 0,
      printBackground: true,
      preferCSSPageSize: true,
      path: outputFile,
    });

    await browser.close();

    // TODO: gracefully exit broker & source server
    process.exit(0);
  } catch (err) {
    console.trace(err);
    process.exit(1);
  }
}
