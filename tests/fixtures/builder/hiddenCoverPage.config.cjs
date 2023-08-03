const baseConfig = require('./workspace.config.cjs');

module.exports = {
  ...baseConfig,
  workspaceDir: '.vs-hiddenCoverPage',
  cover: {
    src: './manuscript/cover.png',
    hideCoverPage: true,
  },
};
