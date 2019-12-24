import fs from 'fs';
import path from 'path';
import chrome from 'chrome-remote-interface';

import {
  convertSizeToInch,
  findEntryPointFile,
  getBrokerUrl,
  launchSourceAndBrokerServer,
  launchChrome,
  LoadMode,
  PageSize,
  findPort,
  statPromise,
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

export interface OnPageLoadOption {
  Page: Page;
  Runtime: Runtime;
  Emulation: Emulation;
  outputFile: string;
  outputSize: PageSize | null;
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
    const chromePort = await findPort();
    const launcherOptions = {
      port: chromePort,
      chromeFlags: [
        '--window-size=1280,720',
        '--disable-gpu',
        '--headless',
        sandbox ? '' : '--no-sandbox',
      ],
    };

    console.log(`Launching headless Chrome... port:${launcherOptions.port}`);

    await launchChrome(launcherOptions).catch((err) => {
      if (err.code === 'ECONNREFUSED') {
        console.log(`Cannot launch headless Chrome. use --no-sandbox option.`);
      } else {
        console.log(
          'Cannot launch Chrome. Did you install it?\nvivliostyle-cli supports Chrome (Canary) only.',
        );
      }
      process.exit(1);
    });

    chrome({ port: chromePort }, async (protocol) => {
      const { Page, Runtime, Emulation } = protocol;

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

      Page.navigate({ url: navigateURL });
    }).on('error', (err) => {
      console.error('Cannot connect to Chrome:' + err);
      process.exit(1);
    });
  } catch (err) {
    console.trace(err);
    process.exit(1);
  }
}

async function onPageLoad({
  Page,
  Runtime,
  Emulation,
  outputFile,
  outputSize,
  vivliostyleTimeout,
}: OnPageLoadOption) {
  function checkBuildComplete(freq: number = 1000): Promise<void> {
    let time = 0;

    function fn(resolve: ResolveFunction<void>, reject: RejectFunction) {
      setTimeout(async () => {
        if (time > vivliostyleTimeout) {
          return reject(new Error('Running Vivliostyle process timed out.'));
        }

        const { result } = await Runtime.evaluate({
          expression: `window.coreViewer.readyState`,
        });
        if (result.value === 'complete') {
          return resolve();
        }

        time += freq;
        fn(resolve, reject);
      }, freq);
    }

    return new Promise((resolve, reject) => fn(resolve, reject));
  }

  console.log('Running Vivliostyle...');

  await Emulation.setEmulatedMedia({ media: 'print' });
  await checkBuildComplete();

  console.log('Printing to PDF...');

  function printConfig() {
    if (outputSize === undefined || outputSize === null) {
      console.log(
        'Warning: Output size is not defined.\n' +
          'Due to the headless Chrome bug, @page { size } CSS rule will be ignored.\n' +
          'cf. https://bugs.chromium.org/p/chromium/issues/detail?id=724160',
      );
      return {
        marginTop: 0,
        marginBottom: 0,
        marginRight: 0,
        marginLeft: 0,
        printBackground: true,
        preferCSSPageSize: true,
      };
    }
    return {
      paperWidth: outputSize[0],
      paperHeight: outputSize[1],
      marginTop: 0,
      marginBottom: 0,
      marginRight: 0,
      marginLeft: 0,
      printBackground: true,
    };
  }

  const { data } = await Page.printToPDF(printConfig());

  fs.writeFileSync(outputFile, data, { encoding: 'base64' });
}
