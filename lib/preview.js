'use strict';

const fs = require('fs');
const path = require('path');

const {
  getBrokerUrl,
  launchSourceAndBrokerServer,
  launchChrome,
} = require('./misc');
const packageJSON = require('./../package.json');

module.exports = run;

function run({
  input,
  rootDir,
  loadMode = 'document',
  sandbox = true
}) {
  const stat = fs.statSync(input);
  const root = rootDir || (stat.isDirectory() ? input : path.dirname(input));
  const indexFile = stat.isDirectory()? path.resolve(input, 'index.html') : input;
  const sourceIndex = path.relative(root, indexFile);

  launchSourceAndBrokerServer(root).then(([ source, broker ]) => {
    const sourcePort = source.port;
    const brokerPort = broker.port;
    const url = getBrokerUrl({
      sourcePort,
      sourceIndex,
      brokerPort,
      loadMode,
      version: packageJSON.version
    });

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
