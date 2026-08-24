---
"@vivliostyle/cli": minor
---

Support importing theme packages from CSS with npm package names, e.g. `@import '@vivliostyle/theme-base';`. Imports are resolved from installed packages honoring the `exports` field, and a theme declared with an empty `import` list (`{ specifier: '...', import: [] }`) is installed into the `themes` directory without being applied as a stylesheet by itself.
