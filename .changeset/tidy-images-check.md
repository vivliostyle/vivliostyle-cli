---
"@vivliostyle/cli": minor
---

Add `cmyk.ifUnreplacedImagesFound` option (`'warn' | 'error' | 'ignore'`) to check non-CMYK images remaining in the PDF after image replacement. It defaults to `'warn'`, so existing `cmyk` users will start seeing these warnings without any config change.
