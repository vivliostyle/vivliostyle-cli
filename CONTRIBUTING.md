# Contribution Guide

## Development Guide

```bash
git clone https://github.com/vivliostyle/vivliostyle-cli.git && cd vivliostyle-cli
yarn install
yarn build
yarn link
cd example
yarn install
DEBUG=vs-cli vivliostyle build
```

After setup, run `yarn dev` to watch files.

### Docker Build

```
docker build -t vivliostyle/cli .
```

## Release Guide (Maintainers only)

### Enter pre-release

```bash
release-it --preRelease=beta --npm.tag=next
```

### Bump pre-release version

```bash
yarn release:pre
# or
release-it --preRelease --npm.tag=next
```

### Graduate

```bash
yarn release
# or
release-it
```
