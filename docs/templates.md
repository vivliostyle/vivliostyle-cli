# Templates

Vivliostyle CLI provides a template system for generating new projects with predefined file structures, configurations, and content. Templates are applied when running the `create` command.

## Using a Template

When creating a project, you can specify a template with the `--template` option:

```sh
vivliostyle create my-project --template gh:org/repo/templates/awesome-template
```

Or use `npm create book` with template options:

```sh
npm create book -- --template gh:org/repo/templates/awesome-template
```

## Built-in Templates

Vivliostyle CLI ships with the following presets:

| Name | Description |
|------|-------------|
| `minimal` | Minimal template with a single empty Markdown file |
| `basic` | Basic template with starter content and examples in English |
| `basic-ja` | Basic template with starter content and examples in Japanese |

These presets are selected interactively when running `vivliostyle create` without specifying a template, or can be specified directly:

```sh
vivliostyle create my-project --template minimal
```

## Template Sources

The `--template` option accepts three types of sources:

### Remote (giget format)

Use the `[provider]:repo[/subpath][#ref]` format to download templates from remote repositories. The template download source can be specified in [giget](https://github.com/unjs/giget#readme) format.

```sh
# From GitHub
--template gh:org/repo/templates/my-template

# From a specific branch or tag
--template gh:org/repo/templates/my-template#v2.0.0

# From GitLab
--template gitlab:org/repo/templates/my-template
```

### Local directory

Specify a relative or absolute path to a local directory:

```sh
--template ./my-custom-template
--template ../shared-templates/book-template
```

All files are copied recursively, excluding `node_modules/` and `.git/`.

### Vivliostyle Themes templates

If a [Vivliostyle Themes](./themes-and-css) package you install provides templates via the `vivliostyle.template` field in its `package.json`, those templates appear as choices during interactive project creation. See [Providing Templates in a Vivliostyle Themes Package](#providing-templates-in-a-vivliostyle-themes-package) for the authoring format.

## Template Variables

Template files can contain [Handlebars](https://handlebarsjs.com/) expressions that are replaced with actual values during project creation. Only UTF-8 text files are processed; binary files (images, etc.) are copied as-is.

### Available Variables

| Variable | Type | Description |
|----------|------|-------------|
| `projectPath` | `string` | Project path |
| `title` | `string` | Project title |
| `author` | `string` | Author name |
| `language` | `string` | Language code (BCP 47) |
| `theme` | `ThemeSpecifier \| undefined` | Theme configuration |
| `themePackage` | `object \| undefined` | Theme package metadata |
| `themePackage.name` | `string` | Theme package name |
| `themePackage.version` | `string` | Theme package version |
| `cliVersion` | `string` | Vivliostyle CLI version |
| `coreVersion` | `string` | Vivliostyle Core version |
| `browser` | `object \| undefined` | Browser configuration |
| `browser.type` | `string` | Browser type (e.g. `"chrome"`) |
| `browser.tag` | `string \| undefined` | Browser tag |

When a theme package defines [custom prompts](#custom-prompts), the user's answers are also available as variables using the `name` specified in each prompt definition.

### Built-in Helpers

The following Handlebars helpers are registered:

| Helper | Description | Example input → output |
|--------|-------------|------------------------|
| `upper` | Uppercase | `my book` → `MY BOOK` |
| `lower` | Lowercase | `My Book` → `my book` |
| `capital` | Capital case | `my book` → `My Book` |
| `camel` | Camel case | `my book` → `myBook` |
| `snake` | Snake case | `my book` → `my_book` |
| `kebab` | Kebab case | `my book` → `my-book` |
| `proper` | Title case | `a guide to vivliostyle` → `A Guide to Vivliostyle` |
| `lorem` | Lorem ipsum placeholder text | (no input) |
| `json` | JSON serialization | object → JSON string |

### Example: `vivliostyle.config.js`

```js
// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: "{{proper title}}",
  author: "{{author}}",
  {{#if language}}
  language: "{{language}}",
  {{/if}}
  {{#if theme}}
  theme: {{json theme}},
  {{/if}}
  image: "ghcr.io/vivliostyle/cli:{{cliVersion}}",
  entry: ["manuscript.md"],
});
```

### Example: `package.json`

```json
{
  "name": "{{kebab title}}",
  "description": "{{proper title}}",
  "author": "{{author}}",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "vivliostyle build",
    "preview": "vivliostyle preview"
  },
  "dependencies": {
    "@vivliostyle/cli": "{{cliVersion}}"
  }
}
```

## Providing Templates in a Vivliostyle Themes Package

A [Vivliostyle Themes](./themes-and-css) package can bundle one or more project templates. Templates are declared in the `vivliostyle.template` field of `package.json`:

```json
{
  "name": "my-vivliostyle-theme",
  "version": "1.0.0",
  "vivliostyle": {
    "theme": {
      "name": "My Theme",
      "style": "./theme.css"
    },
    "template": {
      "default": {
        "name": "Default template",
        "description": "A basic starting point",
        "source": "org/my-vivliostyle-theme/template/default"
      },
      "with-prompts": {
        "name": "Template with custom options",
        "source": "org/my-vivliostyle-theme/template/with-prompts",
        "prompt": [
          {
            "type": "text",
            "name": "subtitle",
            "message": "Enter a subtitle:",
            "required": false
          },
          {
            "type": "select",
            "name": "pageSize",
            "message": "Select page size:",
            "options": ["A4", "A5", "B5"]
          }
        ]
      }
    }
  }
}
```

Each key in `vivliostyle.template` is a template ID. The object has the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | | Display name shown in the interactive prompt |
| `description` | `string` | | Short description shown as a hint |
| `source` | `string` | ✔ | Template source in giget format |
| `prompt` | `PromptOption[]` | | Additional prompts to collect user input |

The `source` field accepts the same giget format as the `--template` option.

### Custom Prompts

The `prompt` array lets template authors ask the user for additional information at project creation time. The user's answers become template variables available in Handlebars expressions.

The following prompt types are supported:

#### `text`

A free-form text input.

```json
{
  "type": "text",
  "name": "subtitle",
  "message": "Enter a subtitle:",
  "placeholder": "(optional)",
  "defaultValue": "",
  "initialValue": "",
  "required": false
}
```

#### `select`

A single-choice selection from a list.

```json
{
  "type": "select",
  "name": "pageSize",
  "message": "Select page size:",
  "options": [
    { "value": "A4", "label": "A4 (210×297 mm)", "hint": "Standard" },
    { "value": "A5", "label": "A5 (148×210 mm)" },
    "B5"
  ],
  "initialValue": "A4"
}
```

Options can be plain strings or objects with `value`, `label`, and `hint`.

#### `multiSelect`

Multiple-choice selection.

```json
{
  "type": "multiSelect",
  "name": "features",
  "message": "Select features to include:",
  "options": ["toc", "cover", "bibliography"]
}
```

#### `autocomplete`

Single-choice with typeahead filtering.

```json
{
  "type": "autocomplete",
  "name": "locale",
  "message": "Select a locale:",
  "options": ["en", "ja", "zh", "fr", "de"]
}
```

#### `autocompleteMultiSelect`

Multiple-choice with typeahead filtering.

```json
{
  "type": "autocompleteMultiSelect",
  "name": "locales",
  "message": "Select locales to support:",
  "options": ["en", "ja", "zh", "fr", "de"]
}
```

### Template Directory Layout

Place the template files under a directory referenced by `source`. The files will be copied to the new project directory and have template variables replaced.

```
my-vivliostyle-theme/
├── package.json          # vivliostyle.template declared here
├── theme.css
└── template/
    └── default/
        ├── vivliostyle.config.js   # uses {{title}}, {{author}}, etc.
        ├── manuscript.md
        └── assets/
            └── cover.webp          # binary file, copied as-is
```

## Minimal Template Example

The following is the simplest possible template: a single Markdown file and a config file.

**`vivliostyle.config.js`:**

```js
// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: "{{proper title}}",
  author: "{{author}}",
  entry: ["manuscript.md"],
});
```

**`manuscript.md`:**

```markdown
# {{proper title}}
```

When a user runs `vivliostyle create my-book --title "My First Book" --author "Jane Doe"` with this template, the output will be:

**`vivliostyle.config.js`** (after substitution):

```js
// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  title: "My First Book",
  author: "Jane Doe",
  entry: ["manuscript.md"],
});
```
