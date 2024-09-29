module.exports = {
  title: 'cover test 2',
  entry: [
    {
      rel: 'cover',
      path: 'manuscript/cover.html',
      output: 'index.html',
      imageSrc: 'arch.jpg',
      imageAlt: 'front cover',
      theme: './sample-theme.css',
    },
    {
      path: 'manuscript/foo.md',
      output: 'dir/foo.html',
    },
    {
      rel: 'cover',
      output: 'dir/back-cover.html',
      title: 'Back cover',
      imageSrc: 'arch.jpg',
      imageAlt: 'back cover',
      theme: './sample-theme.css',
      pageBreakBefore: 'right',
    },
  ],
  output: ['output1.pdf'],
  workspaceDir: '.vs-valid.2',
};
