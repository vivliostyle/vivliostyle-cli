# create-book

## 11.1.0

## 11.0.4

## 11.0.3

## 11.0.2

## 11.0.1

### Patch Changes

- Drop Node.js 20 support and upgrade @puppeteer/browsers to v3 and puppeteer-core to v25. ([#815](https://github.com/vivliostyle/vivliostyle-cli/pull/815))

  This fixes broken Chrome downloads on recent Node.js releases (24.16.0+ and 26.1.0+), where a
  Node.js stream-backpressure change stalls the frozen `extract-zip` dependency in
  @puppeteer/browsers v2 mid-extraction without erroring, leaving a corrupted Chrome cache
  (puppeteer/puppeteer#14957, nodejs/node#63487). The minimum
  supported Node.js is now `>=22.12.0`. Because @puppeteer/browsers v3 extracts Chrome `.zip`
  archives via the system `unzip` CLI, `unzip` must be available on the host (Linux); the
  official Docker image already bundles it.

  Note: While dropping Node.js version support typically warrants a major version bump, this is
  released as a patch version as an exception because it affects all users of the recently released
  v11, and the Chrome download breakage is a critical blocker for those environments.

## 11.0.0

## 10.6.0

## 10.5.0

## 10.4.0

## 10.3.1

## 10.3.0

## 10.2.1

## 10.2.0

## 10.1.0

## 10.0.2

### Patch Changes

- Fix issue failing to install dependencies on create command. ([#685](https://github.com/vivliostyle/vivliostyle-cli/pull/685))

## 10.0.1

### Patch Changes

- Resolve prior release issue ([#683](https://github.com/vivliostyle/vivliostyle-cli/pull/683))

## 10.0.0

### Major Changes

- BREAKING CHANGE: Drop support for Node.js 18. Now Node.js 20 or >=22 is required. ([#681](https://github.com/vivliostyle/vivliostyle-cli/pull/681))
