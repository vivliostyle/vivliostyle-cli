module.exports = {
  title: 'title',
  author: 'author',
  language: 'ja',
  entry: [
    {
      path: 'manuscript/soda.md',
      theme: 'manuscript/sample-theme.css',
    },
  ],
  output: ['output1.pdf'],
  workspaceDir: '.vs-workspace',
  toc: true,
  cover: './manuscript/cover.png',
  theme: '../themes/debug-theme',
};
