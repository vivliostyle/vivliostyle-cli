---
'@vivliostyle/cli': major
'create-book': major
---

Drop Node.js 20 support and upgrade @puppeteer/browsers to v3 and puppeteer-core to v25.

This fixes broken Chrome downloads on recent Node.js releases (24.16.0+ and 26.1.0+), where a
Node.js stream-backpressure change stalls the frozen `extract-zip` dependency in
@puppeteer/browsers v2 mid-extraction without erroring, leaving a corrupted Chrome cache
(puppeteer/puppeteer#14957, nodejs/node#63487). The minimum
supported Node.js is now `>=22.12.0`. Because @puppeteer/browsers v3 extracts Chrome `.zip`
archives via the system `unzip` CLI, `unzip` must be available on the host (Linux); the
official Docker image already bundles it.
