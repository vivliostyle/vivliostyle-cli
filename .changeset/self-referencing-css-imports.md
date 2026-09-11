---
'@vivliostyle/cli': patch
---

Resolve CSS `@import` rules referring to the package containing the importing stylesheet by its own name, like the self-referencing of Node.js, instead of installing the package with the same name from npm.
