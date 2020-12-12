const NodeEnvironment = require('jest-environment-node');

// Workaround for https://github.com/facebook/jest/issues/4422
module.exports = class extends NodeEnvironment {
  async setup() {
    await super.setup();
    this.global.Uint8Array = Uint8Array;
  }
};
