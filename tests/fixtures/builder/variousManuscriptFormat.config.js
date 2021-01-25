module.exports = {
  title: 'title',
  author: 'author',
  entry: [
    'manuscript/soda.md',
    'manuscript/sample-html.html',
    'manuscript/sample-xhtml.xhtml',
  ],
  output: [
    {
      path: 'variousManuscriptFormat',
      format: 'webbook',
    },
  ],
  workspaceDir: '.vs-variousManuscriptFormat',
};
