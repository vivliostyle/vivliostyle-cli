# Using Config File

To compile multiple articles or chapter files into a single publication, use a configuration file. When you run the `vivliostyle build` or `vivliostyle preview` command, if there is a configuration file named `vivliostyle.config.js` in the current directory, it will be used. You can also create a configuration file in [JSONC](https://code.visualstudio.com/docs/languages/json#_json-with-comments) (JSON with comments) format with the filename `vivliostyle.config.json`.

## Creating a Configuration File

You can create a configuration file `vivliostyle.config.js` with the following command:

```
vivliostyle init
```

This will generate a `vivliostyle.config.js` file in the current directory. The created `vivliostyle.config.js` file will look like this:

```js
// @ts-check
/** @type {import('@vivliostyle/cli').VivliostyleConfigSchema} */
const vivliostyleConfig = {
  title: 'Principia',
  author: 'Isaac Newton',
  language: 'la',
  image: 'ghcr.io/vivliostyle/cli:latest',
  entry: [
    ...
  ],
};
module.exports = vivliostyleConfig;
```

## Configuration File Settings

The settings in the configuration file are explained in the comments within the file (starting with `//`). Here are the main settings for each item. For all settings, refer to the [Config Reference](./config.md).

- **title**: The title of the publication (e.g., `title: 'Principia'`).
- **author**: The author's name (e.g., `author: 'Isaac Newton'`).
- **language**: The language (e.g., `language: 'en'`). This will be reflected in the `lang` attribute of the HTML.
- **size**: The page size (e.g., `size: 'A4'`). For how to specify, refer to [Specifying Page Size](./themes-and-css.md#specifying-page-size).
- **theme**: The package name of the [Vivliostyle Themes](./themes-and-css.md#about-vivliostyle-themes) to apply to the entire document, or the path to a CSS file. You can specify the following values and also specify multiple themes in an array format:
  - npm-style package name (e.g., `@vivliostyle/theme-techbook`, `./local-pkg`)
  - URL or local file path specifying a single CSS (e.g., `./style.css`, `https://example.com/style.css`)
- **entry**: Specify an array of input Markdown or HTML files.
  ```js
  entry: [
    {
      path: 'about.md',
      title: 'About This Book',
      theme: 'about.css'
    },
    'chapter1.md',
    'chapter2.md',
    'glossary.html'
  ],
  ```
  You can specify the input as a string or in object format. In the case of object format, you can add the following properties:
  - `path`: Specify the path of the entry. This property is required, but not needed when specifying `rel: 'contents'` or `rel: 'cover'`. Refer to the following items for these specifications:
      - [To output the table of contents in a location other than the beginning of the publication](./toc-page.md#to-output-the-table-of-contents-in-a-location-other-than-the-beginning-of-the-publication)
      - [To output the cover page to a location other than the beginning of the publication](./cover-page.md#to-output-the-cover-page-to-a-location-other-than-the-beginning-of-the-publication)
  - `title`: Specify the title of the entry. If this property is not set, the title will be obtained from the content of the entry.
  - `theme`: Specify the package name of the Vivliostyle Themes to apply to the entry, or the path to a CSS file.
- **output**: Specify the output destination. Example: `output: 'output.pdf'`. The default is `{title}.pdf`. You can also specify multiple outputs in an array format as follows:
  ```js
  output: [
    './output.pdf',
    {
      path: './book',
      format: 'webpub',
    },
  ],
  ```
  You can specify the output as a string or in object format. In the case of object format, you can add the following properties:
  - `path`: Specify the path of the output destination. This property is required.
  - `format`: Specify the format to output (available options: `pdf`, `epub`, `webpub`). For EPUB output, refer to [Output in EPUB Format](./special-output-settings.md#output-in-epub-format), and for WebPub output, refer to [Output in Web Publication (WebPub) Format](./special-output-settings.md#output-in-web-publication-webpub-format).
- **workspaceDir**: Specify the directory to save intermediate files. If not specified, the default is the current directory, and the HTML files converted from Markdown will be saved in the same location as the Markdown files. Example: `workspaceDir: '.vivliostyle'`
- **toc**: If this property is specified, an HTML file `index.html` containing the table of contents will be output. For details, refer to [Creating Table of Contents Page](./toc-page.md).
- **cover**: If this property is specified, an HTML file `cover.html` for the cover page will be output. For details, refer to [Creating Cover Page](./cover-page.md).
- **image**: Change the Docker image to use. For details, refer to [Generating with Docker](./special-output-settings.md#generating-with-docker).

## Handling Multiple Inputs and Outputs at Once

- [Example: multiple-input-and-output](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/multiple-input-and-output)

The above configuration file options can be specified in an array. By setting them as an array, you can conveniently handle multiple inputs and outputs at once. The following example is a configuration file that converts Markdown files in the `src` directory to PDF files with the same name.

```js
const fs = require('fs');
const path = require('path');

const inputDir = path.join(__dirname, 'src');
const outputDir = path.join(__dirname, 'output');
const files = fs.readdirSync(inputDir);

const vivliostyleConfig = files
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({
    title: `Article ${path.basename(name, '.md')}`,
    entry: name,
    entryContext: inputDir,
    output: path.join(outputDir, `${path.basename(name, '.md')}.pdf`),
  }));
module.exports = vivliostyleConfig;
```
