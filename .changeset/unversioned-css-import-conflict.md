---
'@vivliostyle/cli': patch
---

Report a conflicting version warning for CSS `@import` rules of the same theme package only when the requested version ranges do not intersect. Imports without a version specifier (e.g. `@import '@vivliostyle/theme-base/page'`) and compatible ranges now follow the version requested first without a warning.
