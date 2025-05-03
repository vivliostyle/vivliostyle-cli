# Contribution Guide

## Development Guide

Please ensure pnpm:>=10 is installed in your machine.

```bash
git clone https://github.com/vivliostyle/vivliostyle-cli.git && cd vivliostyle-cli
pnpm install
```

After setup, run `pnpm dev` to watch files.

## Release Guide (Maintainers only)

### Enter pre-release

```bash
release-it --preRelease=beta --npm.tag=next
```

### Bump pre-release version

```bash
pnpm release:pre
# or
release-it --preRelease --npm.tag=next
```

### Graduate

```bash
pnpm release
# or
release-it
```
