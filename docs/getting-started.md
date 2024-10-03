# Getting Started

Vivliostyle CLI is a command-line interface for typesetting HTML and Markdown documents. It includes the [Vivliostyle Viewer](https://docs.vivliostyle.org/#/vivliostyle-viewer) and generates high-quality PDFs suitable for publications.

## Installation

Ensure you have [Node.js](https://nodejs.org/) (v16 or later) installed.

Install Vivliostyle CLI with the following command:

```
npm install -g @vivliostyle/cli
```

## Generating PDFs

### Generate PDFs from HTML or Markdown

Use the `vivliostyle build` command to generate a PDF from an HTML file. The default output PDF file name is "output.pdf".

```
vivliostyle build index.html
```

Similarly, specify a Markdown file to generate a PDF from the Markdown.

```
vivliostyle build manuscript.md -s A4 -o paper.pdf
```

For the Markdown syntax available in Vivliostyle CLI, refer to [VFM: Vivliostyle Flavored Markdown](https://vivliostyle.github.io/vfm/#/).

### Specifying the output PDF file

Specify the PDF file name with the `-o` (`--output`) option.

```
vivliostyle build book.html -o book.pdf
```

### Specifying a web URL

You can also specify a web URL in addition to local HTML files.

```
vivliostyle build https://vivliostyle.github.io/vivliostyle_doc/samples/gutenberg/Alice.html -s A4 -o Alice.pdf
```

### Generate PDFs from other formats

Vivliostyle CLI supports reading EPUB, unzipped EPUB OPF files, `pub-manifest` (web publication manifest JSON files), and `webbook` (HTML files with links to a table of contents or web publication manifest).

```
vivliostyle build epub-sample.epub -o epub.pdf
vivliostyle build publication.json -o webpub.pdf
```

## Previewing the typesetting result

Preview the typesetting result in a browser with the `vivliostyle preview` command. The browser will launch, allowing you to view the typesetting result with the Vivliostyle Viewer.

```
vivliostyle preview index.html
vivliostyle preview manuscript.md
vivliostyle preview epub-sample.epub
```

### Quickly preview publications composed of many documents

To quickly preview publications composed of many documents, use the `-q` (`--quick`) option. This option uses rough page count estimation to load documents quickly (page numbers will be inaccurate).

```
vivliostyle preview index.html --quick
vivliostyle preview publication.json --quick
vivliostyle preview epub-sample.epub --quick
```

## Output formats other than PDF

Vivliostyle CLI supports output in EPUB format and Web publications (WebPub) in addition to PDF format. For details, see [Special Output Settings](./special-output-settings.md).

The matrix of supported output formats is as follows:

| Input \ Output | `pdf` | `webpub` | `epub` |
|---|:---:|:---:|:---:|
| `pub-manifest` | 🔵 | 🔵 | 🔵 |
| `markdown` | 🔵 | 🔵 | 🔵 |
| `html` `webbook` (including external HTML) | 🔵 | 🔵 | 🔵 |
| `epub` `epub-opf` | 🔵 | 🙅 | 🙅 |

## Other options

Display a list of available options in Vivliostyle CLI with the `vivliostyle help` command.

```
vivliostyle help
vivliostyle help init
vivliostyle help build
vivliostyle help preview
```

Secret feature: Instead of the `vivliostyle` command, you can also use the command name `vs` to reduce the number of keystrokes slightly.

See also:
- [Vivliostyle CLI (README)](https://github.com/vivliostyle/vivliostyle-cli/blob/main/README.md)

