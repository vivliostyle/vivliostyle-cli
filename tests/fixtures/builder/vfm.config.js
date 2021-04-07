const baseConfig = require('./workspace.config');

module.exports = {
  ...baseConfig,
  workspaceDir: '.vs-vfm',
  vfm: {
    hardLineBreaks: true,
    disableFormatHtml: true,
  },
};
