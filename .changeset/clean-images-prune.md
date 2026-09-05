---
'@vivliostyle/cli': patch
---

Fix `pdfPostprocess.replaceImage` leaving original images and their dependencies inside the output PDF after replacement, even when no references to them remain.

