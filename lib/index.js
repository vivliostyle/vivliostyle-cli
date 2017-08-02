'use strict';

const fs = require('fs');
const path = require('path');
const chromeLauncher = require('chrome-launcher');
const chrome = require('chrome-remote-interface');
const httpServer = require('http-server');

const {convertSizeToInch} = require('./misc');

module.exports = run;

function run(input, size, vivliostyleTimeout) {
  const stat = fs.statSync(input);
  const root = stat.isDirectory()? input : path.dirname(input);
  const index = stat.isDirectory()? 'index.html' : path.basename(input);

  const outputSize = (typeof size === 'string')? convertSizeToInch(size) : null;

  Promise.all([
    launchSourceServer(root),
    launchBrokerServer(),
    launchChrome(),
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

    chrome(protocol => {
      const { Page, Runtime } = protocol;
      Promise.all([
        Page.enable(),
        Runtime.enable(),
      ]).then(() => {
        Page.loadEventFired(() => {
          onPageLoad({
            Page,
            Runtime,
            sourcePort,
            sourceIndex: index,
            outputSize,
            vivliostyleTimeout,
          }).catch(err => {
            console.trace(err);
          }).then(() => {
            protocol.close();
            terminate();
          });
        });

        Page.navigate({url: `http://localhost:${brokerPort}/broker.html`});
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

function onPageLoad({ Page, Runtime, sourcePort, sourceIndex, outputSize, vivliostyleTimeout }) {

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

  const js = `window.viewer.loadDocument({
    url: 'http://127.0.0.1:${sourcePort}/${sourceIndex}'
  }, {}, {
    fitToScreen: true
  })`;

  console.log('Running Vivliostyle...');
  return Runtime.evaluate({expression: js})
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
      fs.writeFileSync('output.pdf', data, { encoding: 'base64' });
    });
}

function launchChrome(headless = true) {
  const launcherOptions = {
    port: 9222,
    chromeFlags: [
      '--window-size=1280,720',
      '--disable-gpu',
      headless ? '--headless' : ''
    ],
  };

  return chromeLauncher.launch(launcherOptions).then(chrome => {
    console.log(`Launching headless Chrome... port:${chrome.port}`);
    return chrome;
  });
}

function findPort() {
  const portfinder = require('portfinder');
  portfinder.basePort = 13000;
  return portfinder.getPortPromise();
}

function launchSourceServer(root) {
  return new Promise((resolve) => {
    findPort().then(port => {
      console.log(`Launching source server... http://localhost:${port}`);
      const server = httpServer.createServer({
        root,
        cache: -1,    // disable caching,
        cors: true,
      });
      server.listen(port, () => resolve({ server, port }));
    });
  });
}

function launchBrokerServer() {
  return new Promise((resolve) => {
    findPort().then(port => {
      console.log(`Launching broker server... http://localhost:${port}`);
      const server = httpServer.createServer({
        root: path.resolve(__dirname, '..'),
        cache: -1,    // disable caching,
        cors: true,
      });
      server.listen(port, () => resolve({ server, port }));
    });
  });
}
