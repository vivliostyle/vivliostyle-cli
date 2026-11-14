---
"@vivliostyle/cli": patch
---

Fix `vivliostyle theme validate` accepting the style locator, `keywords`, and `vivliostyle.theme.category` of `package.json` with leading or trailing whitespace, such as `"style": "theme.css "`. These values are now inspected as written, as the theme loader and npm read them.
