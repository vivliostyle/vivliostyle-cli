module.exports = {
  title: 'yuno',
  entry: [
    'manuscript/a.md',
    'manuscript/b.md',
    'manuscript/c.md',
    { rel: 'contents' },
  ],
  output: ['output1.pdf'],
  workspaceDir: '.vs-valid.2',
  toc: {
    title: 'もくじ',
    htmlPath: 'manuscript/contents.html',
  },
};
