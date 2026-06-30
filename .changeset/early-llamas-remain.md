---
'@vivliostyle/cli': patch
---

Down-level the build to the `engines.node` floor (>=22.12.0) so the CLI no longer crashes with `SyntaxError: Unexpected identifier '_'` on Node 22.
