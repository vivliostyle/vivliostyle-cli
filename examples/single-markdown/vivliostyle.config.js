module.exports = {
  title: 'Single Markdown publication',
  author: 'spring-raining',
  language: 'en',
  size: 'A4',
  entry: 'manuscript.md',
  output: [
    {
      path: './draft.pdf',
      format: 'pdf',
    },
    {
      path: './draft',
      format: 'webpub',
    },
  ],
};
