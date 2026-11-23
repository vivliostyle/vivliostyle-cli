---
'@vivliostyle/cli': patch
---

Set the PDF page boxes of pages with `page-orientation: rotate-left` or `rotate-right` in their rotated size and position. Vivliostyle.js marks such pages with `data-vivliostyle-page-orientation` (vivliostyle/vivliostyle.js#2292), and Chromium prints them rotated, on a sheet with the width and height swapped. Before this change, the CLI cropped these pages to their unrotated size.
