# Creating Table of Contents Page

- [Example: table-of-contents](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/table-of-contents)

If the configuration file `vivliostyle.config.js` specifies `toc: true`, a table of contents HTML file named `index.html` will be generated as the first file of the publication.

The content of the generated table of contents HTML file will include the `title` and `h1` elements, which will output the title of the publication as specified in the configuration file's `title`.

```html
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Book Title</title>
    <link href="publication.json" rel="publication" type="application/ld+json" />
    <link href="style.css" rel="stylesheet" type="text/css" />
  </head>
  <body>
    <h1>Book Title</h1>
    <nav id="toc" role="doc-toc">
      <h2>Table of Contents</h2>
      <ol>
        <li><a href="prologue.html">Prologue</a></li>
        <li><a href="chapter1.html">Chapter 1</a></li>
        <li><a href="chapter2.html">Chapter 2</a></li>
        <li><a href="chapter3.html">Chapter 3</a></li>
        <li><a href="epilogue.html">Epilogue</a></li>
      </ol>
    </nav>
  </body>
</html>
```

The `toc` can also be specified as an object with the following properties:

- By specifying `htmlPath`, the table of contents HTML file will be output to a file other than `index.html`.
- By specifying `title`, the table of contents title (the content of the `h2` element within the `nav` element) will be changed.
- To include headings within the entries in addition to references to each entry, specify a value from `1` to `6` for `sectionDepth` (indicating which levels from `h1` to `h6` to include).

```js
toc: {
  htmlPath: 'toc.html',
  title: 'Contents',
  sectionDepth: 6,
},
```

## To output the table of contents in a location other than the beginning of the publication

By specifying `{ rel: 'contents' }` as an element of the `entry` array in the configuration file `vivliostyle.config.js`, the table of contents HTML file will be generated at that position.

```js
entry: [
  'titlepage.md',
  { rel: 'contents' },
  'chapter1.md',
  ...
],
toc: 'toc.html',
```

As a result, the first HTML file of the publication will be `titlepage.html`, followed by the table of contents HTML file `toc.html`.

## To customize the table of contents

* [Example: customize-generated-content](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/customize-generated-content)

To customize the table of contents, specify the `path`, `output`, and `rel: 'contents'` of the table of contents file as elements of the `entry` array in the configuration file as follows:

```js
entry: [
  {
    path: 'toc-template.html',
    output: 'index.html',
    rel: 'contents'
  },
  ...
],
```

Then, prepare the HTML file `toc-template.html` as a template for the table of contents. By including the tag `<nav role="doc-toc"></nav>` in `toc-template.html`, the table of contents items will be inserted into that part, and the table of contents HTML file will be output to `index.html`.

For detailed instructions on creating a table of contents, refer to the [W3C Publication Manifest](https://www.w3.org/TR/pub-manifest/) specification's [Machine-Processable Table of Contents](https://www.w3.org/TR/pub-manifest/#app-toc-structure).

