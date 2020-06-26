module.exports = {
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
      theme: null,
    },
    'gingatetsudo.md',
    'alice.md',
  ],
  // toc: './toc.html',
};
