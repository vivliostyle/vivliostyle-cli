'use strict';

const fs = require('fs');
const path = require('path');
const chromeLauncher = require('chrome-launcher');
const chrome = require('chrome-remote-interface');
const httpServer = require('http-server');

const {
  findPort,
  getBrokerUrl,
  launchBrokerServer,
  launchSourceServer,
} = require('./misc');

module.exports = run;

function run(input, size, vivliostyleTimeout) {
  const stat = fs.statSync(input);
  const root = stat.isDirectory()? input : path.dirname(input);
  const index = stat.isDirectory()? 'index.html' : path.basename(input);

  Promise.all([
    launchSourceServer(root),
    launchBrokerServer(),
  ]).then(([ source, broker ]) => {
    const sourceServer = source.server;
    const sourcePort = source.port;
    const brokerServer = broker.server;
    const brokerPort = broker.port;
    function terminate() {
      sourceServer.close();
      brokerServer.close();
    }
    ['SIGINT', 'SIGTERM'].forEach(sig => {
      process.on(sig, terminate);
    });

    const url = getBrokerUrl(sourcePort, index, brokerPort);
    console.log(`Opening preview page... ${url}`);

    chromeLauncher.launch({
      startingUrl: url,
    }).then(chrome => {
      ['SIGNIT', 'SIGTERM'].forEach(sig => {
        process.on(sig, () => {
          chrome.kill();
        });
      });
    }).catch(err => {
      console.log('Cannot launch Chrome. Did you install it?\nviola-savepdf supports Chrome (Canary) only.');
    });
  }).catch(err => {
    console.trace(err);
  });
}
