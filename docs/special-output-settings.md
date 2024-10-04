# Special Output Settings

## Output in EPUB Format

To output in EPUB format, use the `-f` (`--format`) option with the `vivliostyle build` command, specifying `epub`, or use the `.epub` extension with the `-o` (`--output`) option.

When outputting in EPUB format, it is recommended to set the table of contents. Refer to [Creating Table of Contents Page](./toc-page.md) and configure `toc` in the configuration file. Then, set EPUB in the output options as follows:

```
vivliostyle build -o output.epub
```

You can also generate both PDF and EPUB in a single `vivliostyle build` command as follows (this applies to other output formats as well):

```
vivliostyle build -o pdfbook.pdf -o epubbook.epub
```

Vivliostyle CLI generates EPUB files compliant with EPUB 3. However, the CSS files applied to EPUB are output as they are, which may cause display issues depending on the EPUB viewer. To support more EPUB viewers, apply themes or CSS files compatible with each viewer. For Japanese EPUBs, we provide the Vivliostyle Theme ["@vivliostyle/theme-epub3j"](https://github.com/vivliostyle/themes/tree/main/packages/%40vivliostyle/theme-epub3j) compliant with the [EBPAJ EPUB 3 File Creation Guide](https://dpfj.or.jp/counsel/guide).

## Output in Web Publication (WebPub) Format

To generate a Web Publication (WebPub), specify `webpub` with the `-f` (`--format`) option in the `vivliostyle build` command. Specify the directory to place the WebPub with the `-o` (`--output`) option.

```
vivliostyle build -o webpub/ -f webpub
```

The generated WebPub directory contains a publication manifest `publication.json` file, which describes information such as the loading order of the HTML files of the content. This complies with the W3C standard specification [Publication Manifest](https://www.w3.org/TR/pub-manifest/).

WebPub can be used to create publications that can be read on the web. You can also generate a PDF from WebPub by specifying the `publication.json` file to the `vivliostyle build` command as follows:

```
vivliostyle build webpub/publication.json -o pdfbook.pdf
```

## Generating Print-Ready PDF (PDF/X-1a Format)

- [Example: preflight](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/preflight)

To output in PDF/X-1a format suitable for print submission, specify the `--preflight press-ready` option in the `vivliostyle build` command, or specify `preflight: 'press-ready'` in the [configuration file](./using-config-file.md). To use this feature, you need to install [Docker](https://docs.docker.com/get-started/get-docker/) in advance.

By specifying the `--preflight-option` option, you can add options to [press-ready](https://github.com/vibranthq/press-ready) that performs this processing.

```
# Output in grayscale
vivliostyle build manuscript.md --preflight press-ready --preflight-option gray-scale
# Force outline fonts and output
vivliostyle build manuscript.md --preflight press-ready --preflight-option enforce-outline
```

You can also specify the `--preflight press-ready-local` option to execute the output to PDF/X-1a format in the local environment. However, it is generally recommended to execute it in the Docker environment.

## Generating with Docker

- [Example: render-on-docker](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/render-on-docker)

To specify Docker as the environment for PDF output, use the `--render-mode docker` option in the `vivliostyle build` command (the above option only executes post-processing on Docker, but this option executes all processing on Docker). This option ensures that all processing is executed on Docker, fixing the environment at the time of output and ensuring consistent results across different environments and OS.

When using Docker render mode, please note the following points:
- Docker is isolated from the host environment, so you cannot use fonts installed on the host. The fonts available by default in the Docker container are limited. You usually need to place local font files and specify them in CSS, or use web fonts such as Google Fonts.
- The files mounted on Docker are only the project workspace directory (usually the directory containing `vivliostyle.config.js`), and other files cannot be referenced from inside the Docker container. All files referenced in the document, such as images, must be included in the workspace directory.

## Generating PDF Bookmarks

The PDF output by the `vivliostyle build` command generates bookmarks based on the table of contents. PDF bookmarks can be used for table of contents navigation in PDF viewing software such as Adobe Acrobat.

This bookmark generation feature is enabled when the publication includes a table of contents. When [generating PDF from EPUB](./getting-started.md#generate-pdfs-from-other-formats), the table of contents included in the EPUB is used. For other cases, refer to [Creating a Table of Contents](./toc-page.md).
