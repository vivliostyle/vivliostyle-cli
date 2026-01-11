---
'@vivliostyle/cli': minor
---

Add CMYK color output support for PDF. Please also refer to the example at [examples/cmyk](examples/cmyk).

- Add `pdfPostprocess.cmyk` config property to specify whether to convert colors to CMYK in the output PDF.
- Add `pdfPostprocess.replaceImage` config property to specify images replacement rules during PDF post-processing.
