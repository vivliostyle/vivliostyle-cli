'use strict';
var fs = require('fs');
var path = require('path');
var chrome = require('chrome-remote-interface');
var _a = require('./misc'), convertSizeToInch = _a.convertSizeToInch, getBrokerUrl = _a.getBrokerUrl, launchSourceAndBrokerServer = _a.launchSourceAndBrokerServer, launchChrome = _a.launchChrome;
module.exports = run;
function run(_a) {
    var input = _a.input, outputPath = _a.outputPath, size = _a.size, vivliostyleTimeout = _a.vivliostyleTimeout, rootDir = _a.rootDir, _b = _a.loadMode, loadMode = _b === void 0 ? 'document' : _b, _c = _a.sandbox, sandbox = _c === void 0 ? true : _c;
    var stat = fs.statSync(input);
    var root = rootDir || (stat.isDirectory() ? input : path.dirname(input));
    var indexFile = stat.isDirectory()
        ? path.resolve(input, 'index.html')
        : input;
    var sourceIndex = path.relative(root, indexFile);
    var outputFile = fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()
        ? path.resolve(outputPath, 'output.pdf')
        : outputPath;
    var outputSize = typeof size === 'string' ? convertSizeToInch(size) : null;
    launchSourceAndBrokerServer(root)
        .then(function (_a) {
        var source = _a[0], broker = _a[1];
        var sourcePort = source.port;
        var brokerPort = broker.port;
        var navigateURL = getBrokerUrl({
            sourcePort: sourcePort,
            sourceIndex: sourceIndex,
            brokerPort: brokerPort,
            loadMode: loadMode,
        });
        var launcherOptions = {
            port: 9222,
            chromeFlags: [
                '--window-size=1280,720',
                '--disable-gpu',
                '--headless',
                sandbox ? '' : '--no-sandbox',
            ],
        };
        console.log("Launching headless Chrome... port:" + launcherOptions.port);
        launchChrome(launcherOptions)
            .then(function (launcher) {
            chrome(function (protocol) {
                var Page = protocol.Page, Runtime = protocol.Runtime, Emulation = protocol.Emulation;
                Promise.all([Page.enable(), Runtime.enable()])
                    .then(function () {
                    Page.loadEventFired(function () {
                        onPageLoad({
                            Page: Page,
                            Runtime: Runtime,
                            Emulation: Emulation,
                            outputFile: outputFile,
                            outputSize: outputSize,
                            vivliostyleTimeout: vivliostyleTimeout,
                        })
                            .then(function () {
                            protocol.close();
                            process.exit(0);
                        })
                            .catch(function (err) {
                            console.trace(err);
                            protocol.close();
                            process.exit(1);
                        });
                    });
                    Page.navigate({ url: navigateURL });
                })
                    .catch(function (err) {
                    console.trace(err);
                    process.exit(1);
                });
            }).on('error', function (err) {
                console.error('Cannot connect to Chrome:' + err);
                process.exit(1);
            });
        })
            .catch(function (err) {
            if (err.code === 'ECONNREFUSED') {
                console.log("Cannot launch headless Chrome. use --no-sandbox option.");
            }
            else {
                console.log('Cannot launch Chrome. Did you install it?\nvivliostyle-savepdf supports Chrome (Canary) only.');
            }
            process.exit(1);
        });
    })
        .catch(function (err) {
        console.trace(err);
        process.exit(1);
    });
}
function onPageLoad(_a) {
    var Page = _a.Page, Runtime = _a.Runtime, Emulation = _a.Emulation, outputFile = _a.outputFile, outputSize = _a.outputSize, vivliostyleTimeout = _a.vivliostyleTimeout;
    function checkBuildComplete() {
        var js = "window.viewer.readyState";
        var time = 0;
        function fn(freq, resolve, reject) {
            setTimeout(function () {
                if (time > vivliostyleTimeout) {
                    reject(new Error('Running Vivliostyle process timed out.'));
                    return;
                }
                Runtime.evaluate({ expression: js }).then(function (_a) {
                    var result = _a.result;
                    time += freq;
                    result.value === 'complete' ? resolve() : fn(freq, resolve, reject);
                });
            }, freq);
        }
        return new Promise(function (resolve, reject) {
            fn(1000, resolve, reject);
        });
    }
    console.log('Running Vivliostyle...');
    return Emulation.setEmulatedMedia({ media: 'print' })
        .then(checkBuildComplete)
        .then(function () {
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
        }
        else {
            console.log('Warning: Output size is not defined.\n' +
                'Due to the headless Chrome bug, @page { size } CSS rule will be ignored.\n' +
                'cf. https://bugs.chromium.org/p/chromium/issues/detail?id=724160');
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
        .then(function (_a) {
        var data = _a.data;
        fs.writeFileSync(outputFile, data, { encoding: 'base64' });
    });
}
