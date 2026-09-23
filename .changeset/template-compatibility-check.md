---
"@vivliostyle/cli": minor
---

Add a template manifest `vivliostyle-template.json` that declares the Vivliostyle CLI versions a project template supports via its `engines` field, and check it in `vivliostyle create` and `vivliostyle theme create` before applying a template. When the running CLI does not satisfy the required version range, the command aborts with a message that tells how to update the CLI or how to pin a built-in template to a release tag. The manifest is never copied into the generated project, and templates without it are applied as before. All built-in templates now declare `>=11.3.0`.
