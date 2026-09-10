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

> [!WARNING]
> The `renderMode: docker` option (`--render-mode docker`) is deprecated and may be removed in a future major release. See [#823](https://github.com/vivliostyle/vivliostyle-cli/issues/823) for the background and to share your feedback.

To specify Docker as the environment for PDF output, use the `--render-mode docker` option in the `vivliostyle build` command (the above option only executes post-processing on Docker, but this option executes all processing on Docker). This option ensures that all processing is executed on Docker, fixing the environment at the time of output and ensuring consistent results across different environments and OS.

When using Docker render mode, please note the following points:
- Docker is isolated from the host environment, so you cannot use fonts installed on the host. The fonts available by default in the Docker container are limited. You usually need to place local font files and specify them in CSS, or use web fonts such as Google Fonts.
- The files mounted on Docker are only the project workspace directory (usually the directory containing `vivliostyle.config.js`), and other files cannot be referenced from inside the Docker container. All files referenced in the document, such as images, must be included in the workspace directory.

## Generating PDF Bookmarks

The PDF output by the `vivliostyle build` command generates bookmarks based on the table of contents. PDF bookmarks can be used for table of contents navigation in PDF viewing software such as Adobe Acrobat.

This bookmark generation feature is enabled when the publication includes a table of contents. When [generating PDF from EPUB](./getting-started.md#generate-pdfs-from-other-formats), the table of contents included in the EPUB is used. For other cases, refer to [Creating a Table of Contents](./toc-page.md).

## CMYK

- [Example: cmyk](https://github.com/vivliostyle/vivliostyle-cli/tree/main/examples/cmyk)

To output CMYK colors in a PDF, set `pdfPostprocess.cmyk` to `true` or a configuration object in `vivliostyle.config.js`.

```js
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: true,
  },
});
```

This feature applies the CMYK values specified in the manuscript and separately prepared images to the PDF in post-processing. It requires control over the intended colors and an understanding of how PDF drawing elements are represented; enabling it does not automatically produce colors suited to a printing condition. It does not integrate with [Generating Print-Ready PDF (PDF/X-1a Format)](#generating-print-ready-pdf-pdfx-1a-format).

### How color replacement works

Vivliostyle.js and Vivliostyle Viewer lay out pages in a web browser, and Vivliostyle CLI saves those pages using the browser's PDF output. The CMYK feature temporarily represents CMYK values as RGB colors that the browser can display, then replaces them with the original CMYK values after PDF generation. This depends on Chromium/Chrome and its rendering engine, Skia, preserving `color(srgb ...)` values in the PDF. In the following sections, “browser” refers to Chromium/Chrome.

The available processing depends on how an element is represented in the PDF.

| PDF representation | Examples in the manuscript | Supported processing |
| --- | --- | --- |
| Vector graphics | Text, borders, background colors, SVG vector elements | Color replacement with `cmyk` |
| Raster graphics | Raster images placed with `img`, elements rasterized by the browser | Image replacement with `replaceImage` |
| Shadings | CSS and SVG gradients | Not converted |

The browser may rasterize an element when effects such as filters are applied. Specifying an element's color in CSS does not guarantee that it will be eligible for color replacement.

Color replacement operates on RGB values in the PDF and cannot distinguish an RGB specification from a CMYK specification in the manuscript. For example, if `rgb(0 0 0)` and `device-cmyk(0 0 0 1)` are used together, RGB black processed by color replacement also becomes K100. This feature is not designed to freely mix RGB and CMYK colors.

### Specifying CMYK colors in CSS

Use [`device-cmyk()`](https://drafts.csswg.org/css-color-5/#device-cmyk) to specify CMYK values in CSS. Each component accepts a number from 0 to 1 or a percentage from 0% to 100%.

```css
body {
  color: device-cmyk(0 0 0 1);
}

h1 {
  color: device-cmyk(100% 0% 0% 0%);
}
```

Vivliostyle collects `device-cmyk()` values from CSS and builds a mapping between their browser-facing RGB values and CMYK values. When `pdfPostprocess.cmyk` is enabled, this map is used to replace colors after PDF generation. Preview displays the RGB representation before replacement.

### Reserving RGB colors for SVG and other content

SVG vector elements are eligible for color replacement, but Vivliostyle does not collect `device-cmyk()` values from CSS or attributes inside SVG. Register the RGB colors used in the SVG and their intended CMYK values in `pdfPostprocess.cmyk.reserveMap`.

```js
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: {
      reserveMap: [
        ['#80ffff', { c: 5000, m: 0, y: 0, k: 0 }],
        ['#808080', { c: 0, m: 0, y: 0, k: 5000 }],
        ['#408080', { c: 5000, m: 0, y: 0, k: 5000 }],
      ],
    },
  },
});
```

This example replaces `#80ffff` with C50, `#808080` with K50, and `#408080` with C50+K50 in the SVG. RGB values accept hexadecimal notation such as `#80ffff` or an object such as `{ r: 5000, g: 10000, b: 10000 }`. RGB and CMYK object components are integers from 0 to 10000, where 5000 represents 50%. During color replacement, PDF RGB values are rounded to this scale for matching.

Multiple RGB values can be assigned to the same CMYK value.

### Converting unmapped RGB colors

`pdfPostprocess.cmyk.fallback` converts RGB colors that are not covered by the `device-cmyk()` and `reserveMap` mappings. A fallback function receives `{ r, g, b }` and returns `{ c, m, y, k }`, with each component an integer from 0 to 10000. Return `null` to leave a color unmapped. Asynchronous functions are supported.

```js
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: {
      fallback: ({ r, g, b }) => {
        if (r === 1686 && g === 1686 && b === 1686) {
          return { c: 0, m: 0, y: 0, k: 8300 };
        }
        return null;
      },
      ifUnmappedColorsFound: 'error',
    },
  },
});
```

This example converts the PDF RGB color with all components equal to 1686 (corresponding to `#2b2b2b`) to K83 and fails if any other unmapped RGB color is found.

For content such as SVGs whose colors cannot all be controlled, the following conversion functions are available from `@vivliostyle/cli`. When the intended CMYK values are known, specify them with `device-cmyk()`, `reserveMap`, or `fallback`. Automatic conversion may not produce the intended ink distribution.

| Function | Conversion |
| --- | --- |
| `createBuiltinCmykConversion()` | Converts to CMYK using MuPDF's built-in conversion |
| `createBuiltinGrayConversion()` | Converts to grayscale and maps the result to the K component |
| `createIccConversion({ outputProfile })` | Converts using a supplied ICC profile. Accepts CMYK or Gray profiles; Gray results are mapped to the K component |

For example, import `createBuiltinCmykConversion` and specify `fallback: createBuiltinCmykConversion()`. For an ICC profile example, see “ICC profiles and output intents” below.

### Replacing images

`pdfPostprocess.replaceImage` substitutes images in the PDF. It can also replace images with non-CMYK images, so it is configured outside `cmyk` and works even when `cmyk` is disabled.

Place a browser-displayable RGB image in the manuscript, specify that RGB image as `source`, and specify the CMYK image as `replacement`.

If a CMYK JPEG is placed in the manuscript, the browser can display it, but embeds an RGB conversion in the PDF. Placing it directly in the manuscript does not preserve its CMYK values. Image matching also fails between the original CMYK JPEG and the RGB image in the PDF, so specifying the CMYK JPEG as `source` does not produce a match. To use a CMYK JPEG, prepare a separate RGB version for display and matching, and specify the CMYK JPEG itself as `replacement`.

```js
import {
  createBuiltinGrayConversionReplacement,
  defineConfig,
} from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: true,
    replaceImage: [
      { source: /^(.*)_rgb\.png$/, replacement: '$1_cmyk.tiff' },
      createBuiltinGrayConversionReplacement(),
    ],
  },
});
```

`source` accepts a local image path or a regular expression. Regular expressions match file paths relative to `entryContext`, and a string `replacement` can refer to captured groups with `$1`, etc. Relative image paths are resolved from `entryContext`.

This example first replaces images such as `ck_rgb.png` with their corresponding `ck_cmyk.tiff` files, then converts the remaining images to grayscale. Candidates are tried in array order, and later candidates are not applied once a replacement succeeds. File-based replacement compares image dimensions and pixels rather than filenames in the PDF. If the browser embeds an image after applying a filter or cropping it with `object-view-box`, the image may no longer match its source file.

In addition to a path, `replacement` accepts a replacement function. For automatic conversion, use the following functions. Function-based replacements can also be placed directly in the array without a `source`, as in the example above. This allows conversion of images loaded from URLs without a local source file, or images rasterized by the browser.

| Function | Destination |
| --- | --- |
| `createBuiltinCmykConversionReplacement()` | DeviceCMYK |
| `createBuiltinGrayConversionReplacement()` | DeviceGray |
| `createBuiltinRgbConversionReplacement()` | DeviceRGB |
| `createIccConversionReplacement({ outputProfile })` | DeviceCMYK, DeviceGray, or DeviceRGB, matching the ICC profile |

A replacement function receives `{ image, mupdf }` and returns an image created with the supplied `mupdf` module, or `null` to try the next candidate. Asynchronous functions are supported. For image ownership and disposal requirements, see [ReplaceFunction](./api-javascript.md#replacefunction) and [ReplaceFunctionContext](./api-javascript.md#replacefunctioncontext).

### Detecting unconverted colors and images

`pdfPostprocess.cmyk` provides separate policies for unconverted colors and images.

| Setting | Detection target |
| --- | --- |
| `ifUnmappedColorsFound` | RGB color specifications not converted by the color map or `fallback` |
| `ifIncompatibleImagesFound` | Images encountered during the image scan whose color space is neither DeviceCMYK nor DeviceGray |

Both accept `"warn"` (log a warning, the default), `"error"` (fail the build), or `"ignore"` (do not report). Image validation also checks replacement images and runs even when `replaceImage` is not configured. Disabling `cmyk` disables this image validation.

These policies check the elements visited by the conversion process. They do not guarantee the color spaces of the entire PDF, including shadings, or its suitability for a printing condition. Check the output PDF separately. For example, Ghostscript's [`ink_cov` device](https://ghostscript.readthedocs.io/en/latest/Devices.html#ink-coverage-output) reports CMYK ink amounts per page. For one- or two-color printing, these values can reveal use of unintended ink channels. For four-color CMYK printing, they cannot determine whether RGB elements remain.

```sh
gs -dQUIET -dBATCH -dNOPAUSE -sOutputFile=- -sDEVICE=ink_cov output.pdf
```

### ICC profiles and output intents

`pdfPostprocess.outputIntent` embeds the supplied ICC profile as the PDF output intent. It does not validate that the profile is appropriate for the PDF content.

When using automatic conversion for the output condition specified by the output intent, specify the same profile in the conversion functions’ `outputProfile`. The conversion produces device colors for that output condition.

```js
import {
  createIccConversion,
  createIccConversionReplacement,
  defineConfig,
} from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  pdfPostprocess: {
    cmyk: {
      fallback: createIccConversion({ outputProfile: './print-cmyk.icc' }),
    },
    replaceImage: [
      createIccConversionReplacement({ outputProfile: './print-cmyk.icc' }),
    ],
    outputIntent: './print-cmyk.icc',
  },
});
```

CMYK values specified with `device-cmyk()` or `reserveMap` are output as DeviceCMYK, so they do not need ICC conversion. `createIccConversion` converts the RGB values passed to `fallback` to DeviceCMYK values using `outputProfile`. `createIccConversionReplacement` converts images and outputs them in the Device color space corresponding to the profile. The destination ICC profile itself is not embedded in the image.

All automatic conversion functions also accept `inputProfile`. This ICC profile is used to interpret unprofiled DeviceRGB, DeviceGray, or DeviceCMYK input and must match the input's color space. Input to `cmyk.fallback` is always RGB. If an image already has an ICC profile, that profile is used.

Relative paths in `inputProfile`, `outputProfile`, and `outputIntent` are resolved from `entryContext`.
