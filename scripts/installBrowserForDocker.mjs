#!/usr/bin/env zx

if (os.arch() === 'arm64') {
  // Use the Debian packages until puppeteer supports
  // Registry info: https://packages.debian.org/ja/buster/arm64/chromium
  // Puppeteer code: https://github.com/puppeteer/puppeteer/blob/159d2835450697dabea6f9adf6e67d158b5b8ae3/src/node/BrowserFetcher.ts#L298-L303
  await $`apt install -y chromium=89.0.4389.114-1~deb10u1`;
} else {
  // Install dependencies for puppeteer
  await $`apt install -y chromium`;
  // Remove chrome without removing dependencies
  await $`dpkg -r --force-depends chromium`;
  // Then install actual browser
  await $`node node_modules/puppeteer-core/install.js`;
}
