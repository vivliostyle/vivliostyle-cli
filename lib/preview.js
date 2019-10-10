'use strict';
var fs = require('fs');
var path = require('path');
var _a = require('./misc'), getBrokerUrl = _a.getBrokerUrl, launchSourceAndBrokerServer = _a.launchSourceAndBrokerServer, launchChrome = _a.launchChrome;
module.exports = run;
function run(_a) {
    var input = _a.input, rootDir = _a.rootDir, _b = _a.loadMode, loadMode = _b === void 0 ? 'document' : _b, _c = _a.sandbox, sandbox = _c === void 0 ? true : _c;
    var stat = fs.statSync(input);
    var root = rootDir || (stat.isDirectory() ? input : path.dirname(input));
    var indexFile = stat.isDirectory()
        ? path.resolve(input, 'index.html')
        : input;
    var sourceIndex = path.relative(root, indexFile);
    launchSourceAndBrokerServer(root)
        .then(function (_a) {
        var source = _a[0], broker = _a[1];
        var sourcePort = source.port;
        var brokerPort = broker.port;
        var url = getBrokerUrl({
            sourcePort: sourcePort,
            sourceIndex: sourceIndex,
            brokerPort: brokerPort,
            loadMode: loadMode,
        });
        console.log("Opening preview page... " + url);
        launchChrome({
            startingUrl: url,
            chromeFlags: sandbox ? [] : ['--no-sandbox'],
        }).catch(function (err) {
            if (err.code === 'ECONNREFUSED') {
                console.log("Cannot launch Chrome. use --no-sandbox option or open " + url + " directly.");
                // Should still run
            }
            else {
                console.log('Cannot launch Chrome. Did you install it?\nvivliostyle-savepdf supports Chrome (Canary) only.');
                process.exit(1);
            }
        });
    })
        .catch(function (err) {
        console.trace(err);
        process.exit(1);
    });
}
