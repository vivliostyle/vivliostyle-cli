---
"@vivliostyle/cli": patch
---

Ignore file watcher events until the preview browser has opened, so that the files written to the workspace on startup no longer reload the viewer and fail with `Execution context was destroyed`.
