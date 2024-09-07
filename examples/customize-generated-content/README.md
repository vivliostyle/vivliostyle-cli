# Customize the generated contents

You can customize automatically generated content like the table of contents and cover page. To do this, prepare an original HTML file and specify its path as a `path` option in the entry; the document will then be created based on that file.

HTML files for customization are converted according to these simple rules:

* Table of contents page: Place a `<nav role="doc-toc"></nav>` tag where you want the table of contents content to appear in the HTML. The table of contents content will be automatically inserted when the document is converted.

```html
<nav role="doc-toc">
  <h2>Table of Contents</h2>
  <ol>
    <li data-section-level="1">
      <a href="..." >Section 1</a>
    </li>
    <li data-section-level="1">
      <a href="..." >Section 2</a>
      <ol>
        <li data-section-level="2">
          <a href="..." >Section 2.1</a>
        </li>
      </ol>
    </li>
  </ol>
</nav>
```

Tips: The text of the `<h2>Table of Contents</h2>` can be changed with the `toc.title` option.

* Cover page: Place a `<img role="doc-cover" />` tag where you want the cover image to appear in the HTML. The path to the image specified by the `cover` option will be automatically inserted when the document is converted.

```html
<img role="doc-cover" src="cover-image.jpg" alt="Cover image" />
```

### vivliostyle.config.js

```js
module.exports = {
  title: 'ToC customization example',
  language: 'en',
  entry: [
    {
      rel: 'cover',
      path: 'cover-template.html',
      output: 'cover.html',
    },
    {
      rel: 'contents',
      path: 'toc-template.html',
      output: 'toc.html',
    },
    './manuscript/01_Computing Paradigms.md',
    './manuscript/02_Algorithm Design and Analysis.md',
    './manuscript/03_Systems and Architecture.md',
  ],
  output: 'draft.pdf',
  toc: {
    sectionDepth: 2,
    title: 'My awesome contents',
  },
  cover: {
    src: 'cover-image.jpg',
    name: 'My awesome cover',
  },
};
```
