module.exports = {
  title: 'cover test',
  entry: 'manuscript/foo.md',
  output: ['output1.pdf'],
  workspaceDir: '.vs-valid.1',
  cover: {
    src: 'arch.jpg',
    name: 'alt text',
    htmlPath: 'cover-page.html',
  },
};
