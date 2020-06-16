module.exports = {
  title: 'Ginga Book',
  theme: './style.css', // .css or local dir or npm package
  entryContext: './manuscripts', // default to '.'
  entry: [
    {
      path: 'introduction.md',
      title: 'Introduction',
    },
    {
      path: 'epigraph.md',
      title: 'Epigraph',
    },
  ],
  output: './dist',
  toc: true, // whether generates toc.html or not (does not affect manifest.json)
};
