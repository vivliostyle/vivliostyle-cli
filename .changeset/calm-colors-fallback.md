---
"@vivliostyle/cli": minor
---

Add `cmyk.fallback`, which accepts a custom function or a factory-created color conversion for RGB colors not covered by the regular color mapping, and deprecate `cmyk.overrideMap`. Return `null` from a custom function to leave a color unmapped.
