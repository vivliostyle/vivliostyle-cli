---
"@vivliostyle/cli": patch
---

Load config files importing `@vivliostyle/cli` even when the package is not installed in the user's project (e.g. when the CLI is invoked via a global install or npx), by resolving such imports to the running CLI package itself.
