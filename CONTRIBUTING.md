# Contribution Guide

## Development Guide

```bash
git clone https://github.com/vivliostyle/vivliostyle-cli.git && cd vivliostyle-cli
yarn install
yarn build
yarn link
cd example
DEBUG=vs-cli vivliostyle build
```

After setup, run `yarn dev` to watch files.

### Docker Build

```
docker build -t vivliostyle/cli .
```

## Release Guide (Maintainers only)

```bash
np
```
