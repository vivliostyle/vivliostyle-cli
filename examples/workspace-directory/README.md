# Manual workspace directory

Vivliostyle generates intermediate files (manuscript HTMLs, publication.json, etc.) on the same directory. If you don't prefer this behavior, you can change the directory by `workspaceDir` option.

#### vivliostyle.config.js

```js
module.exports = {
  title: 'Manual workspace directory',
  author: 'spring-raining',
  language: 'en',
  size: 'letter',
  entry: 'manuscript.md',
  output: 'draft.pdf',
  workspaceDir: 'workDir',
};
```
