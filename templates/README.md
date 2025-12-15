# Vivliostyle Templates

This directory contains templates that can be used when creating publication projects with the `vivliostyle create` command and `create-book`.

## Official Templates

The following templates are officially provided:

- minimal: A minimal configuration template. Suitable for starting with a simple Markdown file.

- basic: A template with a basic publication structure. It includes multiple manuscript files and custom CSS, making it a good starting point for creating more comprehensive publications.

## Community Templates

You can use templates provided by the community or your own templates by using the `--template` option.

Templates are specified in the format `[provider]:repo[/subpath][#ref]`.

```sh
npm create book -- --template gh:org/repo/templates/awesome-template
```

For details on referencing templates, see the [giget](https://github.com/unjs/giget#readme) documentation.

## Local Templates

You can also specify a local directory with the `--template` option. In this case, the local files will be copied.

```sh
npm create book -- --template ./my-custom-template
```
