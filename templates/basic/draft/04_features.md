# Key Features of Vivliostyle CLI

## Themes and Styling

Vivliostyle CLI provides a flexible theming system that allows you to apply professional styles to your publications without writing CSS from scratch.

### Using Official Themes

The [Vivliostyle Themes](https://vivliostyle.github.io/themes/) collection offers pre-designed styles for various publication types:

```sh
vivliostyle build manuscript.md --theme @vivliostyle/theme-techbook
```

Popular themes include:

- **@vivliostyle/theme-techbook**: Technical documentation and programming books
- **@vivliostyle/theme-academic**: Academic papers and research documents
- **@vivliostyle/theme-bunko**: Japanese-style vertical writing novels

### Custom Stylesheets

Apply additional CSS styles to customize your publication:

```sh
vivliostyle build document.md --style custom.css
```

You can also inject CSS directly via command line:

```sh
vivliostyle build document.md --css "body { font-family: 'Georgia'; }"
```

### Page Size Configuration

Specify standard paper sizes or custom dimensions:

```sh
vivliostyle build paper.md -s A4
vivliostyle build letter.md -s letter
vivliostyle build slide.md -s 10in,7.5in
```

### Print Features

Add crop marks and bleed for professional printing:

```sh
vivliostyle build book.md -m --bleed 5mm --crop-offset 20mm
```

## Multiple Output Formats

Vivliostyle CLI supports generating publications in different formats from the same source.

### PDF Output

The default output format provides high-quality PDFs suitable for professional printing:

```sh
vivliostyle build manuscript.md -o output.pdf
```

### EPUB Output

Generate reflowable EPUB files for e-readers:

```js
// vivliostyle.config.js
export default {
  entry: ['chapter1.md', 'chapter2.md'],
  output: {
    path: './book.epub',
    format: 'epub',
  },
};
```

### WebPub Output

Create web publications that can be viewed in browsers:

```js
// vivliostyle.config.js
export default defineConfig({
  entry: ['index.md'],
  output: {
    path: './webpub',
    format: 'webpub',
  },
});
```

## Working with Configuration Files

For complex publications with multiple chapters and sections, use a configuration file.

### Creating a Configuration

Initialize a new configuration file:

```sh
vivliostyle init
```

This generates a `vivliostyle.config.js` file:

```js
export default defineConfig({
  title: 'My Book Title',
  author: 'John Doe',
  language: 'en',
  entry: ['manuscript.md'],
});
```

### Multiple Entries

Combine multiple source files:

```js
export default defineConfig({
  title: 'Complete Guide',
  entry: [
    {
      path: 'preface.md',
      title: 'Preface',
      theme: 'preface.css',
    },
    'chapter1.md',
    'chapter2.md',
    'chapter3.md',
    'appendix.html',
  ],
});
```

### Table of Contents

Automatically generate a table of contents:

```js
export default defineConfig({
  title: 'My Book',
  entry: ['chapter1.md', 'chapter2.md'],
  toc: {
    title: 'Table of Contents',
    htmlPath: 'toc.html',
  },
});
```

### Cover Pages

Generate a cover page from metadata:

```js
export default defineConfig({
  title: 'Publication Title',
  author: 'Author Name',
  cover: {
    htmlPath: 'cover.html',
  },
});
```

## Preview and Development

### Live Preview

Launch a browser preview with automatic reloading:

```sh
vivliostyle preview manuscript.md
```

The Vivliostyle Viewer opens in your browser, showing the typeset result in real-time.

### Quick Preview Mode

For large publications, use quick preview mode for faster loading:

```sh
vivliostyle preview --quick
```

This mode uses approximate page counting to improve performance, though page numbers may be less accurate.

## Advanced Input Formats

### EPUB Files

Convert existing EPUB files to PDF:

```sh
vivliostyle build book.epub -o book.pdf
```

### Web URLs

Process remote HTML documents:

```sh
vivliostyle build https://example.com/article.html -s A4 -o article.pdf
```

### Publication Manifests

Use W3C Web Publication manifest files:

```sh
vivliostyle build publication.json -o output.pdf
```

### Webbooks

Process HTML files that link to a table of contents or manifest:

```sh
vivliostyle build index.html -o book.pdf
```

## Docker Support

Run Vivliostyle CLI in a containerized environment:

```sh
vivliostyle build -o output.pdf --render-mode docker
```

This is useful for:

- Consistent builds across different environments
- CI/CD pipelines
- Avoiding local dependency installation

## Command-Line Shortcuts

The `vs` command is a shorter alias for `vivliostyle`:

```sh
vs build manuscript.md
vs preview document.md
vs create
```

This small convenience saves keystrokes during frequent use.

## Additional Help

Access built-in help for any command:

```sh
vivliostyle help
vivliostyle help build
vivliostyle help preview
vivliostyle help create
```

Each command provides detailed information about available options and usage patterns.
