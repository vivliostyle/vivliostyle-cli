import fs from 'fs';
import path from 'path';
import chrome from 'chrome-remote-interface';

import {
  convertSizeToInch,
  getBrokerUrl,
  launchSourceAndBrokerServer,
  launchChrome,
  LoadMode,
} from './misc';

type ResolveFunction<T> = (value?: T | PromiseLike<T>) => void;
type RejectFunction = (reason?: any) => void;

export interface SaveOption {
  input: string;
  outputPath: string;
  size: number | string;
  vivliostyleTimeout: number;
  rootDir: string;
  loadMode: LoadMode;
  sandbox: boolean;
}

export interface OnPageLoadOption {
  Page: Page;
  Runtime: Runtime;
  Emulation: Emulation;
  outputFile: string;
  outputSize: [number, number] | null;
  vivliostyleTimeout: number;
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
  const stat = fs.statSync(input);
  const root = rootDir || (stat.isDirectory() ? input : path.dirname(input));
  const indexFile = stat.isDirectory()
    ? path.resolve(input, 'index.html')
    : input;
  const sourceIndex = path.relative(root, indexFile);

  const outputFile =
    fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()
      ? path.resolve(outputPath, 'output.pdf')
      : outputPath;
  const outputSize = typeof size === 'string' ? convertSizeToInch(size) : null;

  try {
    const [source, broker] = await launchSourceAndBrokerServer(root);
    const sourcePort = source.port;
    const brokerPort = broker.port;
    const navigateURL = getBrokerUrl({
      sourcePort,
      sourceIndex,
      brokerPort,
      loadMode,
    });
    const launcherOptions = {
      port: 9222,
      chromeFlags: [
        '--window-size=1280,720',
        '--disable-gpu',
        '--headless',
        sandbox ? '' : '--no-sandbox',
      ],
    };

    console.log(`Launching headless Chrome... port:${launcherOptions.port}`);
    const launcher = await launchChrome(launcherOptions).catch((err) => {
      if (err.code === 'ECONNREFUSED') {
        console.log(`Cannot launch headless Chrome. use --no-sandbox option.`);
      } else {
        console.log(
          'Cannot launch Chrome. Did you install it?\nvivliostyle-savepdf supports Chrome (Canary) only.',
        );
      }
      process.exit(1);
    });
    chrome(async (protocol) => {
      const {Page, Runtime, Emulation} = protocol;
      await Promise.all([Page.enable(), Runtime.enable()]).catch((err) => {
        console.trace(err);
        process.exit(1);
      });

      Page.loadEventFired(async () => {
        await onPageLoad({
          Page,
          Runtime,
          Emulation,
          outputFile,
          outputSize,
          vivliostyleTimeout,
        }).catch((err: Error) => {
          console.trace(err);
          protocol.close();
          process.exit(1);
        });

        protocol.close();
        process.exit(0);
      });

      Page.navigate({url: navigateURL});
    }).on('error', (err) => {
      console.error('Cannot connect to Chrome:' + err);
      process.exit(1);
    });
  } catch (err) {
    console.trace(err);
    process.exit(1);
  }
}

function onPageLoad({
  Page,
  Runtime,
  Emulation,
  outputFile,
  outputSize,
  vivliostyleTimeout,
}: OnPageLoadOption) {
  function checkBuildComplete() {
    const js = `window.viewer.readyState`;
    let time = 0;

    function fn(
      freq: number,
      resolve: ResolveFunction<void>,
      reject: RejectFunction,
    ) {
      setTimeout(() => {
        if (time > vivliostyleTimeout) {
          reject(new Error('Running Vivliostyle process timed out.'));
          return;
        }
        Runtime.evaluate({expression: js}).then(({result}) => {
          time += freq;
          result.value === 'complete' ? resolve() : fn(freq, resolve, reject);
        });
      }, freq);
    }
    return new Promise((resolve, reject) => {
      fn(1000, resolve, reject);
    });
  }

  console.log('Running Vivliostyle...');
  return Emulation.setEmulatedMedia({media: 'print'})
    .then(checkBuildComplete)
    .then(() => {
      console.log('Printing to PDF...');
      if (outputSize) {
        return Page.printToPDF({
          paperWidth: outputSize[0],
          paperHeight: outputSize[1],
          marginTop: 0,
          marginBottom: 0,
          marginRight: 0,
          marginLeft: 0,
          printBackground: true,
        });
      } else {
        console.log(
          'Warning: Output size is not defined.\n' +
            'Due to the headless Chrome bug, @page { size } CSS rule will be ignored.\n' +
            'cf. https://bugs.chromium.org/p/chromium/issues/detail?id=724160',
        );
        return Page.printToPDF({
          marginTop: 0,
          marginBottom: 0,
          marginRight: 0,
          marginLeft: 0,
          printBackground: true,
          preferCSSPageSize: true,
        });
      }
    })
    .then(({data}: {data: string}) => {
      fs.writeFileSync(outputFile, data, {encoding: 'base64'});
    });
}
