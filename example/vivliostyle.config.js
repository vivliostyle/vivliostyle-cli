module.exports = {
  title: 'Example Book',
  author: 'Vivliostyle Foundation',
  theme:
    'https://raw.githubusercontent.com/youchan/viola-project/master/main.css',
  // theme: '../vivliostyle-theme-bunko',
  // theme: '../vivliostyle-theme-bunko/theme.css',
  size: 'A4',
  entryContext: 'manuscripts',
  entry: [
    'introduction.md',
    {
      path: 'fragments/chapter1.md',
    },
    'gingatetsudo.md',
    'fragments/chapter2.md',
    'alice.md',
  ],
  cover: 'manuscripts/logo.png',
  // toc: './toc.html',
  // toc: true,
};
