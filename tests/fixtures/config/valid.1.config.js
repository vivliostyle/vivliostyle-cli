module.exports = {
  title: 'title',
  author: 'author',
  theme: 'debug-theme',
  entry: [
    'manuscript.md',
    {
      path: 'manuscript.md',
      title: 'title',
      theme: 'theme.css',
    },
  ],
  entryContext: '.',
  output: [
    'output1.pdf',
    {
      path: 'output2.pdf',
      format: 'pdf',
    },
  ],
  size: 'size',
  pressReady: true,
  language: 'language',
  toc: './toc.html',
  cover: './cover.png',
  timeout: 1,
};
