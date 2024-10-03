## Creating Cover Page

If the configuration file `vivliostyle.config.js` specifies `cover: 'image.png'`, a cover HTML file `cover.html` will be generated and added as the cover page of the publication.

The content of the generated cover HTML file will be as follows:

```html
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Book Title</title>
    <style data-vv-style>
      body {
        margin: 0;
      }
      [role="doc-cover"] {
        display: block;
        width: 100vw;
        height: 100vh;
        object-fit: contain;
      }
      @page {
        margin: 0;
      }
    </style>
  </head>
  <body>
    <section role="region" aria-label="Cover">
      <img role="doc-cover" src="image.png" alt="Cover image" />
    </section>
  </body>
</html>
```

The `cover` can also be specified as an object with the following properties:

- By specifying `src`, you can set the cover image to be loaded.
- By specifying `htmlPath`, you can output the cover HTML file to a file other than `cover.html`. Setting it to `false` prevents the cover HTML file from being output. In this case, the cover page will not be included in the PDF output but will be set as the cover image when output in EPUB or WebPub format.
- By specifying `name`, you can change the alt text of the cover image.

```js
cover: {
  src: 'image.png',
  htmlPath: 'toc.html',
  name: 'My awesome cover image',
},
```

### To output the cover page to a location other than the beginning of the publication

By specifying `{ rel: 'cover' }` as an element of the `entry` array in the configuration file `vivliostyle.config.js`, the cover HTML file will be generated at that position.

```js
entry: [
  'titlepage.md',
  { rel: 'cover' },
  'chapter1.md',
  ...
],
cover: 'image.png',
```

With this, the first HTML file of the publication will be `titlepage.html`, followed by the cover HTML file `cover.html`.

You can also add multiple cover pages. The following example adds different cover pages at the beginning and end of the publication.

```js
entry: [
  {
    rel: 'cover',
    output: 'front-cover.html',
  },
  ...
  {
    rel: 'cover',
    output: 'back-cover.html',
    imageSrc: 'back.png',
  },
],
cover: 'front.png',
```

### To customize the cover page

* [Example: customize-generated-content](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/customize-generated-content)

To customize the cover page, specify the `path` and `output` of the cover file and `rel: 'contents'` as elements of the `entry` array in the configuration file as follows:

```js
entry: [
  {
    path: 'cover-template.html',
    output: 'cover.html',
    rel: 'cover'
  },
  ...
],
```

Then, prepare the HTML file `cover-template.html` as the cover template. By including a tag `<img role="doc-cover" />` in `cover-template.html`, the cover image will be inserted at that part and the cover HTML file will be output to `cover.html`.

