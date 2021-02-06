# Single Markdown

`manuscript.md` is a manuscript file written in [VFM (Vivliostyle Flavored Markdown)](https://github.com/vivliostyle/vfm) and `manuscript.html` is a generated one from this file.

Please refer the VFM repository for more details of VFM syntax.

### vivliostyle.config.js

```js
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
```
