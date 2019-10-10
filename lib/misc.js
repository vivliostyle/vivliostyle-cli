'use strict';
var path = require('path');
var fs = require('fs');
var url = require('url');
var httpServer = require('http-server');
var chromeLauncher = require('chrome-launcher');
var cm = 1 / 2.54;
var mm = 1 / 25.4;
var q = 1 / 101.6;
var inch = 1;
var pc = 1 / 6;
var pt = 1 / 72;
var px = 1 / 96;
var presetPageSize = {
    a5: [148 * mm, 210 * mm],
    a4: [210 * mm, 297 * mm],
    a3: [297 * mm, 420 * mm],
    b5: [176 * mm, 250 * mm],
    b4: [250 * mm, 353 * mm],
    'jis-b5': [182 * mm, 257 * mm],
    'jis-b4': [257 * mm, 364 * mm],
    letter: [8.5 * inch, 11 * inch],
    legal: [8.5 * inch, 14 * inch],
    ledger: [11 * inch, 17 * inch],
};
module.exports = {
    convertSizeToInch: convertSizeToInch,
    findPort: findPort,
    getBrokerUrl: getBrokerUrl,
    launchSourceAndBrokerServer: launchSourceAndBrokerServer,
    launchBrokerServer: launchBrokerServer,
    launchSourceServer: launchSourceServer,
    launchChrome: launchChrome,
};
function convertSizeToInch(size) {
    var size_ = size.trim().toLowerCase();
    if (size_ in presetPageSize) {
        return presetPageSize[size_];
    }
    var splitted = size_.split(',');
    if (splitted.length !== 2) {
        throw new Error("Cannot parse size : " + size);
    }
    var ret = splitted.map(function (str) {
        var match = str.trim().match(/^([\d\.]+)([\w]*)$/);
        if (!match) {
            throw new Error("Cannot parse size : " + str);
        }
        var num = +match[1];
        var unit = match[2];
        if (!Number.isFinite(num) || num <= 0) {
            throw new Error("Cannot parse size : " + str);
        }
        switch (unit) {
            case 'cm':
                return num * cm;
            case 'mm':
                return num * mm;
            case 'q':
                return num * q;
            case 'in':
                return num * inch;
            case 'pc':
                return num * pc;
            case 'pt':
                return num * pt;
            case '':
            case 'px':
                return num * px;
            default:
                throw new Error("Cannot parse size : " + str);
        }
    });
    return ret;
}
function findPort() {
    var portfinder = require('portfinder');
    portfinder.basePort = 13000;
    return portfinder.getPortPromise();
}
function getBrokerUrl(_a) {
    var sourcePort = _a.sourcePort, sourceIndex = _a.sourceIndex, brokerPort = _a.brokerPort, _b = _a.loadMode, loadMode = _b === void 0 ? 'document' : _b;
    var sourceUrl = "http://127.0.0.1:" + sourcePort + "/" + sourceIndex;
    return ("http://localhost:" + brokerPort + "/broker/index.html?render=" + encodeURIComponent(sourceUrl) + ("&loadMode=" + encodeURIComponent(loadMode)));
}
function launchSourceAndBrokerServer(root) {
    return new Promise(function (resolve, reject) {
        launchSourceServer(root)
            .then(function (source) {
            launchBrokerServer()
                .then(function (broker) {
                resolve([source, broker]);
            })
                .catch(function (e) {
                source.server.close();
                reject(e);
            });
        })
            .catch(function (e) {
            reject(e);
        });
    });
}
function launchBrokerServer() {
    return new Promise(function (resolve) {
        findPort().then(function (port) {
            console.log("Launching broker server... http://localhost:" + port);
            var server = httpServer.createServer({
                root: path.resolve(__dirname, '..'),
                cache: -1,
                cors: true,
                before: [
                    function (req, res, next) {
                        // Provide node_modules
                        var resolvedPath;
                        if (req.url.startsWith('/node_modules')) {
                            var pathName = url.parse(req.url).pathname;
                            var moduleName = pathName.substr(14).replace('..', '');
                            try {
                                resolvedPath = require.resolve(moduleName);
                            }
                            catch (e) {
                                if (e.code !== 'MODULE_NOT_FOUND') {
                                    next();
                                    throw e;
                                }
                            }
                        }
                        if (resolvedPath) {
                            var stream = fs.createReadStream(resolvedPath);
                            stream.pipe(res); // send module to client
                        }
                        else {
                            next(); // module not found
                        }
                    },
                ],
            });
            server.listen(port, 'localhost', function () {
                ['exit', 'SIGNIT', 'SIGTERM'].forEach(function (sig) {
                    process.on(sig, function () {
                        server.close();
                    });
                });
                resolve({ server: server, port: port });
            });
        });
    });
}
function launchSourceServer(root) {
    return new Promise(function (resolve) {
        findPort().then(function (port) {
            console.log("Launching source server... http://localhost:" + port);
            var server = httpServer.createServer({
                root: root,
                cache: -1,
                cors: true,
            });
            server.listen(port, 'localhost', function () {
                ['exit', 'SIGNIT', 'SIGTERM'].forEach(function (sig) {
                    process.on(sig, function () {
                        server.close();
                    });
                });
                resolve({ server: server, port: port });
            });
        });
    });
}
function launchChrome(launcherOptions) {
    return chromeLauncher.launch(launcherOptions).then(function (launcher) {
        ['exit', 'SIGNIT', 'SIGTERM'].forEach(function (sig) {
            process.on(sig, function () {
                launcher.kill();
            });
        });
        return launcher;
    });
}
