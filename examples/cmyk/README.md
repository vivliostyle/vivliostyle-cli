# CMYK

You can output CMYK color PDFs using the `device-cmyk()` CSS function. To enable CMYK support, set `pdfPostprocess.cmyk` to a truthy value (either `true` or a configuration object) in vivliostyle.config.js. Vivliostyle renders each `device-cmyk()` color as a substitute RGB color in the browser, then restores the intended CMYK value in Chromium's PDF output.

<span class="k100">K100</span> <span class="k80">K80</span> <span class="k60">K60</span> <span class="k40">K40</span> <span class="k20">K20</span> <span class="c100">C100</span> <span class="c80">C80</span> <span class="c60">C60</span> <span class="c40">C40</span> <span class="c20">C20</span> <a href="#">link</a> <span style="font-family: 'Noto Sans JP'">Noto Sans JPによるType 3に変換された日本語テキスト</span>

Text, borders, background colors, and SVG vector elements are typical conversion targets. The options below handle colors and images that need additional control.

## `cmyk.reserveMap`

SVG vector elements can be converted to CMYK, but `device-cmyk()` values within SVG's own CSS or attributes are not processed by Vivliostyle. More fundamentally, SVG editing software such as Adobe Illustrator and Inkscape does not support CMYK colors in SVG[^svg-cmyk]. Whether you are creating an SVG from scratch or converting from a CMYK-capable vector format like PDF or Illustrator's native format, you need a way to reserve specific RGB colors to be converted to designated CMYK colors. That is what `cmyk.reserveMap` provides.

[^svg-cmyk]: Technically, SVG can use any color expression that CSS allows, so SVG does support CMYK insofar as `device-cmyk()` exists. In practice, however, it is unlikely that CMYK SVGs will become common given the limited adoption of `device-cmyk()`.

shapes.svg is an SVG file designed to use C50, K50, and C50+K50 — colors not used elsewhere in the CSS. The chosen RGB placeholders are `#80ffff` for C50, `#808080` for K50, and `#408080` for C50+K50. These particular values are arbitrary; any values that don't collide with other colors in the document will work. They are then registered in `cmyk.reserveMap` as shown in the example config, enabling CMYK colors for vector elements inside SVG.

![shapes.svg using the reserved colors for C50, K50, and C50+K50](shapes.svg)

## `replaceImage`

Raster images are not covered by the color conversion described above. `replaceImage` lets you substitute raster images with CMYK-ready versions. Since this feature is not specific to CMYK, it is placed outside the `cmyk` configuration.

Images used in Vivliostyle must be displayable by a web browser. You can reference an RGB version in the manuscript and use `replaceImage` to put its CMYK original into the final PDF. The `source` field accepts a regular expression, so managing pairs by prefix/suffix or separate directories is recommended. Although JPEG supports CMYK and browsers can display it[^tiff], Chromium converts a CMYK JPEG to RGB before embedding it in a PDF. The resulting colors are unpredictable, making CMYK JPEGs unsuitable as the browser-facing source.

[^tiff]: TIFF also supports CMYK, but it can only be displayed in Safari. Since Vivliostyle's CMYK feature depends on Chromium-specific behavior, TIFF is excluded here.

ck_cmyk.tiff is a cyan-and-key-plate gradient. The manuscript displays its RGB conversion, ck_rgb.png, and the first `replaceImage` entry restores the TIFF in the output PDF.

![ck_rgb.png, the browser-facing version of ck_cmyk.tiff](ck_rgb.png)

Replacement works when the original image pixels are preserved, such as when only resizing is applied as in the example, but there are cases where replacement does not work when complex operations like filters are applied to the image. When Chromium separates a semi-transparent image into RGB pixels and a soft mask, `replaceImage` compares them together. The replacement image determines the resulting transparency; the source soft mask is not carried over.

### Function fallback

The manuscript also contains two images that cannot use the local file pair. One is loaded from a URL and has no corresponding local source in this example.

![cover.jpg loaded from a URL](https://github.com/vivliostyle/vivliostyle-cli/blob/v10.3.1/assets/cover.jpg?raw=true)

The other is ck_rgb.png cropped with `object-view-box`. Chromium rasterizes this crop into pixels that no longer match ck_rgb.png.

![ck_rgb.png cropped with object-view-box](ck_rgb.png){style="object-view-box: xywh(1px 0 100px 100px)"}

`replaceImage` tries entries in order. The config therefore puts the exact RGB-to-CMYK file replacement first and `createBuiltinGrayConversionReplacement()` last. The ordinary ck_rgb.png becomes CMYK, while the URL image and rasterized crop fall back to grayscale.

Custom replacement functions can handle other workflows. Vivliostyle CLI also provides built-in Gray, RGB, CMYK, and ICC conversion functions.

## Validation policies

By design, this feature cannot produce PDFs that freely mix RGB and CMYK colors (more precisely, it can produce a PDF with unconverted RGB values left in place, but it cannot guarantee that arbitrary RGB and CMYK values will coexist correctly). `cmyk.ifUnmappedColorsFound` determines what happens when RGB colors remain outside the color map: `"warn"` logs a warning, `"error"` fails the build, and `"ignore"` continues without reporting them. The default is `"warn"`.

Raster images require a separate check because replacing color operators does not change image data. During the same scan used by `replaceImage`, `cmyk.ifIncompatibleImagesFound` checks every encountered image, including images that do not match a replacement. It applies the same `"warn"`, `"error"`, and `"ignore"` policies when an image's color space is not DeviceCMYK or DeviceGray. The scan runs for `"warn"` and `"error"` even when no replacements are configured. The default is `"warn"`; disabling `cmyk` disables this check.

The example config sets both policies to `"error"`, so the build fails if either an unmapped RGB color or an incompatible image remains. It also uses `cmyk.overrideMap` to convert the three RGB colors introduced by the generated footnote rule.

```shellsession
$ npm run build && gs -dQUIET -dBATCH -dNOPAUSE -sOutputFile=- -sDEVICE=ink_cov output.pdf

INFO Start building
INFO Launching PDF build environment
INFO Building pages
INFO README.md CMYK
INFO Building PDF
INFO Processing PDF
INFO Converting CMYK colors and replacing images
SUCCESS Finished building output.pdf
📙 Built successfully!
 0.34299  0.00000  0.00000  4.30148 CMYK OK
 2.53568  0.00000  0.00000  6.15756 CMYK OK
 9.84404  0.00000  0.00000 12.27365 CMYK OK
 0.26049  0.00000  0.00000 10.68061 CMYK OK
 0.40878  0.00000  0.00000  4.92645 CMYK OK
 0.28367  0.00000  0.00000  3.60474 CMYK OK
```
