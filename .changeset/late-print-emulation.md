---
"@vivliostyle/cli": patch
---

Speed up PDF builds by no longer emulating print media before pagination, so that the pages already completed stay out of the layout while the remaining pages are typeset. `page.pdf()` prints with the print media type by itself.
