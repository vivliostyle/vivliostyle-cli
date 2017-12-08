'use strict';

const fs = require('fs');
const path = require('path');
const chromeLauncher = require('chrome-launcher');
const chrome = require('chrome-remote-interface');
const httpServer = require('http-server');

const {
  convertSizeToInch,
  findPort,
  getBrokerUrl,
  launchBrokerServer,
  launchSourceServer,
} = require('./misc');

module.exports = run;

function run(input, outputPath, size, vivliostyleTimeout, sandbox = true) {
  const stat = fs.statSync(input);
  const root = stat.isDirectory()? input : path.dirname(input);
  const index = stat.isDirectory()? 'index.html' : path.basename(input);

  const outputFile = fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()
    ? path.resolve(outputPath, 'output.pdf')
    : outputPath;
  const outputSize = (typeof size === 'string')? convertSizeToInch(size) : null;

  Promise.all([
    launchSourceServer(root),
    launchBrokerServer(),
    launchChrome(sandbox),
  ]).then(([ source, broker, launcher ]) => {
    const sourceServer = source.server;
    const sourcePort = source.port;
    const brokerServer = broker.server;
    const brokerPort = broker.port;
    function terminate() {
      sourceServer.close();
      brokerServer.close();
      launcher.kill();
    }
    ['SIGINT', 'SIGTERM'].forEach(sig => {
      process.on(sig, terminate);
    });

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
          }).catch(err => {
            console.trace(err);
          }).then(() => {
            protocol.close();
            terminate();
          });
        });

        Page.navigate({url: getBrokerUrl(sourcePort, index, brokerPort)});
      }).catch(err => {
        console.trace(err);
        terminate();
      });
    }).on('error', err => {
      throw Error('Cannot connect to Chrome:' + err);
      sourceServer.close();
      brokerServer.close();
    });

  }).catch(err => {
    console.trace(err);
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

function launchChrome(sandbox = true, headless = true) {
  const launcherOptions = {
    port: 9222,
    chromeFlags: [
      '--window-size=1280,720',
      '--disable-gpu',
      headless ? '--headless' : '',
      sandbox ? '' : '--no-sandbox'
    ],
  };

  return chromeLauncher.launch(launcherOptions).then(chrome => {
    console.log(`Launching headless Chrome... port:${chrome.port}`);
    ['SIGNIT', 'SIGTERM'].forEach(sig => {
      process.on(sig, () => {
        chrome.kill();
      });
    });
    return chrome;
  }).catch(err => {
    if(err.code === 'ECONNREFUSED') {
      console.log(`Cannot launch headless Chrome. use --no-sandbox option.`);
    }
    else {
      console.log('Cannot launch Chrome. Did you install it?\nviola-savepdf supports Chrome (Canary) only.');
    }
  });
}
