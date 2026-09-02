# Themes and CSS

To add styling such as fonts and text sizes to your manuscript, apply a Cascading Style Sheet (CSS), similar to how you would with an HTML file.

## Adding Additional Stylesheets

To use additional stylesheets (CSS files) alongside those specified in the HTML file, use the `--style` option.

```
vivliostyle build example.html --style additional-style.css
```

The stylesheet specified this way will be treated the same as the [author stylesheet](https://developer.mozilla.org/en-US/docs/Web/CSS/Cascade#author_stylesheets) specified in the HTML file. Since it is specified later, it will override the styles in the HTML file according to CSS cascading rules.

### Specifying User Stylesheets

To use a [user stylesheet](https://developer.mozilla.org/en-US/docs/Web/CSS/Cascade#user_stylesheets), specify the stylesheet with the `--user-style` option. User stylesheets do not override author stylesheets unless the style is specified with `!important`.

```
vivliostyle build example.html --user-style user-style.css
```

### Specifying CSS Content Directly

By using the `--css` option, you can pass the stylesheet directly as CSS text. This option is useful for setting simple stylesheets or CSS variables.

```
vivliostyle build example.html --css "body { background-color: lime; }"
```

### Specifying Page Size

You can specify the page size with the `-s` (`--size`) option. The sizes you can specify are A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger, or you can specify the width and height separated by a comma.

```
vivliostyle build paper.html -s A4 -o paper.pdf
vivliostyle build letter.html -s letter -o letter.pdf
vivliostyle build slide.html -s 10in,7.5in -o slide.pdf
```

This option is equivalent to `--css "@page { size: <size>; }"`.

### Specifying Crop Marks

By using the `-m` (`--crop-marks`) option, crop marks (indicators of the cutting position for printed materials) will be added to the output PDF.

```
vivliostyle build example.html -m
```

You can specify the bleed width when adding crop marks with the `--bleed` option. You can also specify the width outside the crop marks with the `--crop-offset` option.

```
vivliostyle build example.html -m --bleed 5mm
vivliostyle build example.html -m --crop-offset 20mm
```

This option is equivalent to `--css "@page { marks: crop cross; bleed: <bleed>; crop-offset: <crop-offset>; }"`.

## About Vivliostyle Themes

- [Vivliostyle Themes](https://vivliostyle.github.io/themes/)

Vivliostyle Themes is an official collection of style themes used when creating publications with Vivliostyle. By referring to Vivliostyle Themes, you can apply styles without preparing your own CSS.

### Finding Themes

To find themes published as npm packages, search for the keyword "vivliostyle-theme" on [npm](https://www.npmjs.com/):

- [List of Themes (npm)](https://www.npmjs.com/search?q=keywords%3Avivliostyle-theme)

### Using Themes

- [Example: theme-css](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/theme-css)
- [Example: theme-preset](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/theme-preset)

You can use a theme by specifying the `-T` (`--theme`) option or `theme` in the [configuration file](./using-config-file.md). If the theme file does not exist locally, it will be automatically installed on the first run.

```
vivliostyle build manuscript.md --theme @vivliostyle/theme-techbook -o paper.pdf
```

You can also use themes available in your local environment. If it is a single CSS file, you can specify the CSS file directly as follows.

```
vivliostyle build manuscript.md --theme ./my-theme/style.css -o paper.pdf
```

If there is a `package.json` file that conforms to npm in your local environment, you can also load the Vivliostyle Theme in that directory. The following is an example where a package available as a Vivliostyle Theme is placed in the `my-theme` directory.

```
vivliostyle build manuscript.md --theme ./my-theme -o paper.pdf
```

All of the settings above can be specified in the configuration file, and you can also use more than one of them.

```js
theme: [
  '@vivliostyle/theme-techbook',
  './my-theme',
],
```

### Importing Themes from CSS

You can import a theme package directly from your CSS file with its npm package name, instead of writing a relative path into the `themes` directory:

```css
@import '@vivliostyle/theme-base';
@import '@vivliostyle/theme-base/css/partial/footnote.css';

h1 {
  /* your customization */
}
```

Note that this is usually unnecessary if you only want to use a theme. It is generally needed when you want to create a new theme that extends other themes.

An import with the package name alone loads the default style entry of the package, resolved from the `vivliostyle.theme.style`, `style`, `exports` (with the `style` condition), and `main` fields of its package.json, in this order. An import with a subpath loads the specified file; when the package declares the `exports` field, the subpath is resolved through it.

The imported package must be installed beforehand. Unlike a theme specified with the `theme` option, Vivliostyle CLI does not install packages referred from CSS automatically. Install the packages you want to use with the `npm install` command.

A specifier is treated as a relative URL and keeps the standard CSS semantics when it points to an existing file with the `.css` extension; for example, `@import 'foo.css'` refers to the relative file when it exists next to the importing stylesheet. Any other specifier is resolved as an npm package. When the same package is installed both in the project and in the `themes` directory, the one in the `themes` directory takes precedence.

### Using Create Book

By using Create Book, you can easily create a project with a theme already set. Refer to [Create Book](https://docs.vivliostyle.org/en/cli/getting-started/).

## Using PostCSS

If your project has a [PostCSS](https://postcss.org/) configuration file, Vivliostyle CLI applies its plugins to every CSS file it processes.

Place the PostCSS config in the same directory as the [configuration file](./using-config-file.md). Any config format supported by [postcss-load-config](https://github.com/postcss/postcss-load-config) (e.g. `postcss.config.js`) can be loaded. The config is also applied to the CSS files of the theme packages you use.

The [`css.postcss` option](./config.md#cssconfig) of the configuration file accepts an inline PostCSS config, or a directory to search for the PostCSS config file from. If an inline config is provided, the PostCSS config file is not searched.

```js
import autoprefixer from 'autoprefixer';

export default {
  entry: ['manuscript.md'],
  css: {
    postcss: {
      plugins: [autoprefixer()],
    },
  },
};
```

## Tailwind CSS

- [Example: with-tailwindcss](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/with-tailwindcss)

Through PostCSS plugins, you can also use CSS frameworks such as [Tailwind CSS](https://tailwindcss.com/).

Follow the [Using PostCSS](https://tailwindcss.com/docs/installation/using-postcss) section of the Tailwind CSS documentation to set it up.

Tailwind CSS is a framework that styles elements through classes called utility classes, applying the styles that correspond to each class name. When combined with VFM, you can specify the classes with the [VFM attribute syntax](https://vivliostyle.github.io/vfm/#/vfm) as follows; Tailwind scans the manuscript files and generates the styles for the classes in use.

```md
# Vivliostyle meets Tailwind CSS {.text-4xl .font-extrabold .tracking-tight .text-accent}

This document is styled with [Tailwind CSS](https://tailwindcss.com/) utility classes.
Tailwind scans this Markdown file for class names, so you can attach utilities to
inline elements with the **VFM attribute syntax**{.bg-accent/15 .px-1 .rounded} like
`**text**{.underline}`.
```

Tailwind CSS is a powerful tool, but the text-centric documents Vivliostyle mainly targets differ from web pages in many ways, and whether styling with utility classes fits your writing process depends on your authoring style. Still, it can be a strong option when you want plenty of ad hoc styles in your text.
