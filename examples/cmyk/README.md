# CMYK

You can output CMYK color PDFs using the `device-cmyk()` CSS function.

Documents may sometimes contain RGB color elements that are difficult to control. For example, CSS inside SVG is not handled by Vivliostyle, so `device-cmyk()` cannot be used. Using `cmyk.overrideMap`, you can convert RGB color elements that do not go through `device-cmyk()` to CMYK. Unhandled RGB colors are warned by `cmyk.warnUnmapped` (default: true).

Raster image conversion is not currently supported.

```
$ npm run build && gs -dQUIET -dBATCH -dNOPAUSE -sOutputFile=- -sDEVICE=ink_cov output.pdf

INFO Start building
INFO Launching PDF build environment
INFO Building pages
ERROR 304 http://localhost:3000/viewer/lib/resources/vivliostyle-icon.png
INFO Building PDF
INFO Processing PDF
INFO Converting CMYK colors
SUCCESS Finished building output.pdf
📘 Built successfully!
 0.07574  0.00000  0.00000  0.14254 CMYK OK
```
