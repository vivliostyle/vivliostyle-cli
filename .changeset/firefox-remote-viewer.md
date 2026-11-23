---
"@vivliostyle/cli": patch
---

Fix Firefox builds and previews with a remote `--viewer` (e.g. `https://vivliostyle.org/viewer/`) hanging until the timeout: disable Firefox's Local Network Access prompt, and allow the remote viewer's origin in the server's CORS policy
