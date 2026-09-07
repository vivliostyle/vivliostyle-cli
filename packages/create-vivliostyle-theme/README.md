<div align="center">
  <b>The fastest way to create a Vivliostyle theme package.</b>
</div>

# Create Vivliostyle Theme

[![npm badge](https://flat.badgen.net/npm/v/create-vivliostyle-theme)](https://npmjs.com/package/create-vivliostyle-theme) [![downloads](https://flat.badgen.net/npm/dt/create-vivliostyle-theme)]()

Just run `npm create vivliostyle-theme@latest` and start designing your theme!

## Use

```bash
npm create vivliostyle-theme@latest
yarn create vivliostyle-theme # for yarn users
pnpm create vivliostyle-theme # for pnpm users
```

Answer the questions, and a theme package is scaffolded from the [theme template](https://github.com/vivliostyle/vivliostyle-cli/tree/HEAD/templates/theme). The package name defaults to `vivliostyle-theme-<directory name>`.

```bash
npm create vivliostyle-theme@latest my-theme
cd vivliostyle-theme-my-theme
npm run example:preview
```

This package is a thin wrapper around the `vivliostyle theme create` command of [Vivliostyle CLI](https://github.com/vivliostyle/vivliostyle-cli). See [Themes and CSS](https://github.com/vivliostyle/vivliostyle-cli/blob/HEAD/docs/themes-and-css.md#creating-a-theme) for the structure of the generated package and the available options.

## Maintainer

- [spring-raining](https://github.com/spring-raining)
- [uetchy](https://github.com/uetchy)
