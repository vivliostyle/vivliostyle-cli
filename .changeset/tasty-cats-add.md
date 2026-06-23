---
'@vivliostyle/cli': patch
---

Always resolve the build ID for non-pinned browser tags, keeping `build-ids.json` only as a fallback for when the browser registry is unreachable. The Docker image's browser cache directory is now writable by arbitrary UIDs.
