# CMYK

You can output CMYK color PDFs using the `device-cmyk()` CSS function. To enable CMYK support, set `pdfPostprocess.cmyk` to a truthy value (either `true` or a configuration object) in vivliostyle.config.js.

Under the hood, this feature works by predicting the PDF operators that Chromium produces and replacing them in a post-processing step. Text, borders, background colors, and SVG vector elements are the typical targets of this conversion. Several additional features are provided to help produce fully CMYK PDFs.

## `cmyk.reserveMap`

SVG vector elements can be converted to CMYK, but `device-cmyk()` values within SVG's own CSS or attributes are not processed by Vivliostyle. More fundamentally, SVG editing software such as Adobe Illustrator and Inkscape does not support CMYK colors in SVG[^svg-cmyk]. Whether you are creating an SVG from scratch or converting from a CMYK-capable vector format like PDF or Illustrator's native format, you need a way to reserve specific RGB colors to be converted to designated CMYK colors. That is what `cmyk.reserveMap` provides.

[^svg-cmyk]: Technically, SVG can use any color expression that CSS allows, so SVG does support CMYK insofar as `device-cmyk()` exists. In practice, however, it is unlikely that CMYK SVGs will become common given the limited adoption of `device-cmyk()`.

shapes.svg is an SVG file designed to use C50, K50, and C50+K50 — colors not used elsewhere in the CSS. The chosen RGB placeholders are `#80ffff` for C50, `#808080` for K50, and `#408080` for C50+K50. These particular values are arbitrary; any values that don't collide with other colors in the document will work. They are then registered in `cmyk.reserveMap` as shown in the example config, enabling CMYK colors for vector elements inside SVG.

## `replaceImage`

Raster images are not covered by the color conversion described above. `replaceImage` lets you substitute raster images with CMYK-ready versions. Since this feature is not specific to CMYK, it is placed outside the `cmyk` configuration.

Images used in Vivliostyle must be displayable by a web browser. You reference an RGB image in your manuscript and specify the replacement via `replaceImage`, so that the final PDF output contains the CMYK image. The `source` field accepts a regular expression, so managing files by prefix/suffix or separate directories is recommended. Note that JPEG is a raster format that supports CMYK and can be displayed in web browsers[^tiff], but when a CMYK JPEG is included in a web page, Chromium internally converts it to RGB before embedding it in the PDF. This conversion is unpredictable, making CMYK JPEGs unsuitable for this purpose.

[^tiff]: TIFF also supports CMYK, but it can only be displayed in Safari. Since Vivliostyle's CMYK feature depends on Chromium-specific behavior, TIFF is excluded here.

Replacement works when the original image stream is preserved, such as when only resizing is applied as in the example, but there are cases where replacement does not work when complex operations like filters are applied to the image. Additionally, replacement does not work if the image contains semi-transparent pixels. Only fully opaque RGB images (not RGBA) are supported.

## Other options

By design, this feature cannot produce PDFs that freely mix RGB and CMYK colors (more precisely, it can produce a PDF with unconverted RGB values left in place, but it cannot guarantee that arbitrary RGB and CMYK values will coexist correctly). Since stray RGB elements are usually undesirable in a CMYK workflow, `cmyk.warnUnmapped` (default: `true`) logs warnings for any RGB colors in the PDF that have not been mapped to CMYK.

This CMYK feature assumes that you are aware of and in control of every colored element in your document. For complex documents, that may not always be the case. `cmyk.overrideMap` is a last resort for silencing `cmyk.warnUnmapped` warnings: it forcibly replaces any remaining RGB values in the PDF with the specified CMYK values.

`mapOutput` is primarily a debugging tool. It writes the internal color mapping table to a file.

```
$ npm run build && gs -dQUIET -dBATCH -dNOPAUSE -sOutputFile=- -sDEVICE=ink_cov output.pdf

INFO Start building
INFO Launching PDF build environment
INFO Building pages
INFO Building PDF
INFO Processing PDF
INFO Converting CMYK colors
INFO Replacing images
SUCCESS Finished building output.pdf
📙 Built successfully!
 0.34325  0.00000  0.00000  0.76783 CMYK OK
10.23707  0.00000  0.00000 10.22007 CMYK OK
```
