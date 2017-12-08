'use strict';

const fs = require('fs');
const path = require('path');

const {
  findPort,
  getBrokerUrl,
  launchSourceAndBrokerServer,
  launchChrome,
} = require('./misc');

module.exports = run;

function run(input, sandbox = true) {
  const stat = fs.statSync(input);
  const root = stat.isDirectory()? input : path.dirname(input);
  const index = stat.isDirectory()? 'index.html' : path.basename(input);

  launchSourceAndBrokerServer(root).then(([ source, broker ]) => {
    const sourcePort = source.port;
    const brokerPort = broker.port;
    const url = getBrokerUrl(sourcePort, index, brokerPort);

    console.log(`Opening preview page... ${url}`);
    launchChrome({
      startingUrl: url,
      chromeFlags: sandbox ? [] : ['--no-sandbox'],
    }).catch(err => {
      if(err.code === 'ECONNREFUSED') {
        console.log(`Cannot launch Chrome. use --no-sandbox option or open ${url} directly.`);
        // Should still run
      }
      else {
        console.log('Cannot launch Chrome. Did you install it?\nviola-savepdf supports Chrome (Canary) only.');
        process.exit(1);
      }
    });
  }).catch(err => {
    console.trace(err);
    process.exit(1);
  });
}
