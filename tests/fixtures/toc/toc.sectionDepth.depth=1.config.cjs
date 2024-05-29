const config = require('./toc.sectionDepth.depth=0.config.cjs');

module.exports = {
  ...config,
  toc: {
    ...config.toc,
    sectionDepth: 1,
  },
};
