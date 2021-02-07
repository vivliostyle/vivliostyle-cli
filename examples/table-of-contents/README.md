# Example of Table of Contents

With the `toc` option, we can generate a file with a table of contents.

- If the `true` is set, `index.html` will be written for a table of contents.
- If string value is set, a HTML file of table of contents will be written on the specified path.

#### vivliostyle.config.js

```js
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
```
