# {{themeName}}

[![npm: version](https://flat.badgen.net/npm/v/{{name}})](https://npmjs.com/package/{{name}})
[![npm: total downloads](https://flat.badgen.net/npm/dt/{{name}})](https://npmjs.com/package/{{name}})
![npm: license](https://flat.badgen.net/npm/license/{{name}})
{{#if description}}

{{description}}
{{/if}}

## Use

Install the theme in your project and set it in `vivliostyle.config.js`:

```sh
npm install {{name}}
```

```js
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  theme: '{{name}}',
});
```

To add your own CSS on top of the theme, list it after the theme:

```js
export default defineConfig({
  theme: ['{{name}}', './custom.css'],
});
```

## Development

### Files

```
{{name}}
├── README.md
├── example/                  Sample manuscripts for checking the theme
│   ├── assets/
│   ├── 01_typography.md
│   ├── 02_figures-and-tables.md
│   └── 03_code-and-math.md
├── package.json
├── theme.css                 The stylesheet of the theme
└── vivliostyle.config.js     Configuration for previewing and building the example
```

### Customizing the theme

`theme.css` is built on [`@vivliostyle/theme-base`](https://github.com/vivliostyle/themes/tree/main/packages/%40vivliostyle/theme-base). It imports the base styles and the feature modules you need, and adjusts them with CSS custom properties. Change the values in `theme.css`, remove the modules you do not need, and add your own rules at the end of the file.

Users of the theme can override the same variables in their own stylesheet, so prefer variables over hard-coded values where possible.

### Commands

Preview the example manuscripts with the theme applied. The preview reloads when you edit the files:

```sh
npm run example:preview
```

Build the example as a PDF and a web publication into `dist/`:

```sh
npm run example:build
```

Validate `package.json` before publishing. The `prepublishOnly` script runs it automatically on `npm publish`:

```sh
npm run validate
```

## Publishing

Publish the theme to npm with `npm publish`. Packages with the `vivliostyle-theme` keyword are listed on [npm](https://www.npmjs.com/search?q=keywords%3Avivliostyle-theme) and can be chosen when creating a project with Create Book. See [Vivliostyle Themes](https://github.com/vivliostyle/themes) for the theme specification and how to contribute your theme to the official collection.
