---
"@vivliostyle/cli": patch
---

Fix npm registry requests failing with `invalid onError method` on Node.js 26 when a proxy is configured, which broke theme and template lookups in `create` behind a proxy.
