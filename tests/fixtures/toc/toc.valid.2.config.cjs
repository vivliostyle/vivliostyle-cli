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
  toc: 'manuscript/contents.html',
  tocTitle: 'もくじ',
};
