---
"@vivliostyle/cli": minor
---

Apply the PostCSS config of the project (`postcss.config.*`, `.postcssrc*` or the `postcss` field of package.json) to the CSS files processed by Vivliostyle CLI.

- Add the `css.postcss` option to the config file. Similar to the option of the same name in Vite, it accepts an inline PostCSS config or a directory to search for the PostCSS config file from.
