---
"@vivliostyle/cli": patch
---

Fix the progress logs during PDF builds, which printed transient pagination progress repeatedly when no TTY is attached and could drop the `Building pages` line.
