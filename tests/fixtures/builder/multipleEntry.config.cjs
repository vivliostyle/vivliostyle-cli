const baseConfig = require('./workspace.config');

module.exports = [
  {
    ...baseConfig,
    output: ['output1.pdf'],
    workspaceDir: '.vs-multipleEntry/one',
    toc: false,
  },
  {
    ...baseConfig,
    entry: [
      {
        path: 'manuscript/frontmatter.md',
      },
      {
        rel: 'contents',
      },
    ],
    output: {
      path: 'output2',
      format: 'webpub',
    },
    workspaceDir: '.vs-multipleEntry/two',
  },
];
