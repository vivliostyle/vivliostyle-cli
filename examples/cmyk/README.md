# CMYK

You can output CMYK color PDFs using the `device-cmyk()` CSS function.

Documents may sometimes contain RGB color elements that are difficult to control. For example, CSS inside SVG is not handled by Vivliostyle, so `device-cmyk()` cannot be used. Also, when using `img`, it appears to internally render `{ r: 0, g: 0, b: 0 }` even though it is not visible. Using `cmyk.overrideMap`, you can convert RGB color elements that do not go through `device-cmyk()` to CMYK. Unhandled RGB colors are warned by `cmyk.warnUnmapped` (default: true).

Using `replaceImage`, you can replace images in the PDF. Each path is resolved in the same way as the manuscript entries. While this option is not limited to RGB to CMYK conversion, it is particularly useful for this purpose. Replacement works when the original image stream is preserved, such as when only resizing is applied as in the example, but there are cases where replacement does not work when complex operations like filters are applied to the image.

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
10.74412  0.00000  0.00000 10.76592 CMYK OK
```
