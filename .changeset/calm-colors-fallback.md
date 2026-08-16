---
"@vivliostyle/cli": minor
---

Add `cmyk.fallback`, a function that converts RGB colors the color mapping does not cover, and deprecate `cmyk.overrideMap`. A static color table can be written inside the fallback function; return `null` to leave a color unmapped.
