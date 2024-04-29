module.exports = {
  title: 'title',
  author: 'author',
  theme: ['../themes/debug-theme'],
  entry: [
    'manuscript.md',
    {
      path: 'manuscript.md',
      title: 'title',
      theme: {
        specifier: 'theme.css',
      },
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
  toc: {
    title: 'TOC',
    htmlPath: './toc.html',
    sectionDepth: 6,
  },
  cover: {
    src: './cover.png',
    name: 'Cover image alt',
    htmlPath: './mycover.html',
  },
  timeout: 1,
  workspaceDir: 'workspaceDir',
  vfm: {
    hardLineBreaks: true,
    disableFormatHtml: true,
  },
  readingProgression: 'rtl',
  browser: 'firefox',
  viewerParam: 'foo=bar',
  copyAsset: {
    includes: ['xx/yy', '**/zz'],
    excludes: ['*a*'],
    includeFileExtensions: ['zip'],
    excludeFileExtensions: ['png', 'jpg'],
  },
};
