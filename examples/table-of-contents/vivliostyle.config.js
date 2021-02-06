module.exports = {
  title: 'Example of Table of Contents',
  author: 'spring-raining',
  language: 'en',
  size: 'A4',
  theme: 'default-style.css',
  entry: [
    './manuscript/prelude.md',
    {
      path: './manuscript/cadence.html',
      encodingFormat: 'text/html',
    },
    {
      path: './manuscript/finale.md',
      theme: 'custom-style.css',
    },
  ],
  output: 'draft.pdf',
  toc: true,
};
