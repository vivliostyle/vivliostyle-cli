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

You can use a theme by specifying the `-T` (`--theme`) option or `theme` in the [configuration file](./using-config-file.md). If the theme file does not exist locally, it will be automatically installed in the `themes` directory on the first run.

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

### Using Create Book

By using Create Book, you can easily create a project with a theme already set. Refer to [Create Book](https://docs.vivliostyle.org/#/create-book).
