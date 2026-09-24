---
"@vivliostyle/cli": minor
---

Add a `vivliostyle-template.json` manifest that lets a project template declare the Vivliostyle CLI versions it supports. `vivliostyle create` and `vivliostyle theme create` abort when the running CLI does not satisfy the declared range, and all built-in templates now require `>=11.3.0`.
