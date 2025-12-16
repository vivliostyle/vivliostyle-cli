---
'@vivliostyle/cli': major
---

BREAKING CHANGE: Remove deprecated flags: `--no-sandbox`, `--executable-chromium`, `--verbose` and `--http`.

- If you were using `--no-sandbox` or `--http`, you can simply remove them as they are no longer necessary.
- If you were using `--executable-chromium`, please switch to `--executable-browser` option.
- If you were using `--verbose`, please use `--log-level verbose` instead.
