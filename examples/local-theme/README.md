# Local theme

You can also use private local themes.

To be recognized as a Vivliostyle theme, the [theme/package.json](./theme/package.json) must include at least the `"name"` and `"main"` fields (ref: https://github.com/vivliostyle/vivliostyle-cli/issues/537#issuecomment-2435021522).

When using a local theme located in the project root in [vivliostyle.config.js](./vivliostyle.config.js), you must specify the path with a `./` prefix (e.g., `theme: './theme'`). This is because Vivliostyle CLI gives priority to packages published on npm over local paths (ref: https://github.com/vivliostyle/vivliostyle-cli/issues/524).
