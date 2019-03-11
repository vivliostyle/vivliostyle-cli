'use strict';

const fs = require('fs');
const path = require('path');
const chrome = require('chrome-remote-interface');

const {
  convertSizeToInch,
  getBrokerUrl,
  launchSourceAndBrokerServer,
  launchChrome,
} = require('./misc');

module.exports = run;

function run({
  input,
  outputPath,
  size,
  vivliostyleTimeout,
  rootDir,
  loadMode = 'document',
  sandbox = true
}) {
  const stat = fs.statSync(input);
  const root = rootDir || (stat.isDirectory() ? input : path.dirname(input));
  const indexFile = stat.isDirectory()? path.resolve(input, 'index.html') : input;
  const sourceIndex = path.relative(root, indexFile);

  const outputFile = fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()
    ? path.resolve(outputPath, 'output.pdf')
    : outputPath;
  const outputSize = (typeof size === 'string')? convertSizeToInch(size) : null;

  launchSourceAndBrokerServer(root).then(([ source, broker ]) => {
    const sourcePort = source.port;
    const brokerPort = broker.port;
    const navigateURL = getBrokerUrl({
      sourcePort,
      sourceIndex,
      brokerPort,
      loadMode
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
    launchChrome(launcherOptions).then(launcher => {
      chrome(protocol => {
        const { Page, Runtime, Emulation } = protocol;
        Promise.all([
          Page.enable(),
          Runtime.enable(),
        ]).then(() => {
          Page.loadEventFired(() => {
            onPageLoad({
              Page,
              Runtime,
              Emulation,
              outputFile,
              outputSize,
              vivliostyleTimeout,
            }).then(() => {
              protocol.close();
              process.exit(0);
            }).catch(err => {
              console.trace(err);
              protocol.close();
              process.exit(1);
            });
          });

          Page.navigate({url: navigateURL});
        }).catch(err => {
          console.trace(err);
          process.exit(1);
        });
      }).on('error', err => {
        console.error('Cannot connect to Chrome:' + err);
        process.exit(1);
      });
    }).catch(err => {
      if(err.code === 'ECONNREFUSED') {
        console.log(`Cannot launch headless Chrome. use --no-sandbox option.`);
      }
      else {
        console.log('Cannot launch Chrome. Did you install it?\nviola-savepdf supports Chrome (Canary) only.');
      }
      process.exit(1);
    });

  }).catch(err => {
    console.trace(err);
    process.exit(1);
  });
}

function onPageLoad({ Page, Runtime, Emulation, outputFile, outputSize, vivliostyleTimeout }) {

  function checkBuildComplete() {
    const js = `window.viewer.readyState`;
    let time = 0;

    function fn(freq, resolve, reject) {
      setTimeout(() => {
        if (time > vivliostyleTimeout) {
          reject(new Error('Running Vivliostyle process timed out.'));
          return;
        }
        Runtime.evaluate({expression: js})
          .then(({result}) => {
            time += freq;
            result.value === 'complete'
              ? resolve()
              : fn(freq, resolve, reject);
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
      console.log('Printing to PDF...')
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
      }
      else {
        console.log('Warning: Output size is not defined.\n'
                  + 'Due to the headless Chrome bug, @page { size } CSS rule will be ignored.\n'
                  + 'cf. https://bugs.chromium.org/p/chromium/issues/detail?id=724160');
        return Page.printToPDF({
          marginTop: 0,
          marginBottom: 0,
          marginRight: 0,
          marginLeft: 0,
          printBackground: true,
        });
      }
    }).then(({ data }) => {
      fs.writeFileSync(outputFile, data, { encoding: 'base64' });
    });
}
