module.exports = {
  title: 'yuno',
  entry: [
    {
      rel: 'contents',
      path: 'manuscript/ToC.html',
      theme: '../themes/file.css',
    },
    'manuscript/a.md',
    'manuscript/b.md',
    'manuscript/c.md',
  ],
  output: ['output1.pdf'],
  theme: '../themes/debug-theme',
  workspaceDir: '.vs-valid.3',
  // if { rel: 'contents'; path: string } is set on entry, the configure below is no effect.
  toc: true,
  tocTitle: 'xxx',
};
