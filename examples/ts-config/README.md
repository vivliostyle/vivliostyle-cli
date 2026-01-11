# TypeScript Configuration File

This example demonstrates how to use a TypeScript configuration file (`vivliostyle.config.ts`) instead of JavaScript.

## Requirements

TypeScript configuration file support requires **Node.js >= 22.6.0**.

For Node.js versions before v24.3.0, the `--experimental-strip-types` flag is required.

## Usage

### Using npm scripts

The `package.json` in this example includes scripts with the required Node.js options:

```sh
npm run build    # Build PDF
npm run preview  # Preview in browser
```

### Manual execution

You can also run vivliostyle directly with the flag:

```sh
node --experimental-strip-types node_modules/.bin/vivliostyle build
```

Or using the `NODE_OPTIONS` environment variable:

```sh
NODE_OPTIONS="--experimental-strip-types" vivliostyle build
```

## Notes

- Node.js v24.3.0 and later do not require the `--experimental-strip-types` flag
- Supported TypeScript config file extensions: `.ts`, `.mts`, `.cts`
