# Vivliostyle Templates

This directory contains templates that can be used when creating publication projects with the `vivliostyle create` command and `create-book`, and theme packages with the `vivliostyle theme create` command and `create-vivliostyle-theme`.

## Official Templates

The following templates are officially provided:

- minimal: A minimal configuration template. Suitable for starting with a simple Markdown file.

- basic: A template with a basic publication structure. It includes multiple manuscript files and custom CSS, making it a good starting point for creating more comprehensive publications.

- basic-ja: A Japanese version of the basic template. It includes multiple manuscript files written in Japanese, suitable for creating Japanese-language publications.

- theme: A template for a Vivliostyle Theme package, used by the `vivliostyle theme create` command and `create-vivliostyle-theme`. It includes a stylesheet based on `@vivliostyle/theme-base` and example manuscripts for previewing the theme.

## Community Templates

You can use templates provided by the community or your own templates by using the `--template` option.

Templates are specified in the format `[provider]:repo[/subpath][#ref]`.

```sh
npm create book@latest -- --template gh:org/repo/templates/awesome-template
```

For details on referencing templates, see the [giget](https://github.com/unjs/giget#readme) documentation.

## Local Templates

You can also specify a local directory with the `--template` option. In this case, the local files will be copied.

```sh
npm create book@latest -- --template ./my-custom-template
```
