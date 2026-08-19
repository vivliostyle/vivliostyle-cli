---
"@vivliostyle/cli": patch
---

Fix RegExp `source` entries in `replaceImage` skipping files when the RegExp has the `g` flag. The sticky (`y`) flag, which has no meaning for source matching, is now ignored.
