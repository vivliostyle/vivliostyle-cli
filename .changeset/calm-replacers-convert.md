---
"@vivliostyle/cli": minor
---

Allow functions in `replaceImage` for programmatic image conversion. `builtinCmykReplacement()`, `builtinGrayReplacement()`, and `iccReplacement()` provide ready-made converters. A function may return `null` to decline an image, letting later entries match. Replaced images keep their soft masks. Images with a `/Mask` entry are no longer replaced; a warning is logged instead.
