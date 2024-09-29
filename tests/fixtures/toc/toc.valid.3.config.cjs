module.exports = {
  title: 'yuno',
  entry: [
    {
      rel: 'contents',
      path: 'manuscript/ToC.html',
      output: 'index.html',
      theme: 'sample-theme.css',
    },
    'manuscript/a.md',
    'manuscript/b.md',
    'manuscript/c.md',
  ],
  output: ['output1.pdf'],
  theme: '../themes/debug-theme',
  workspaceDir: '.vs-valid.3',
  toc: {
    title: 'xxx',
  },
};
