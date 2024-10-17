# JavaScript API

<!-- START JavaScript API -->
## Exported members

### Functions

- [`build`](#build)
- [`init`](#init)
- [`preview`](#preview)

### Interfaces

- [`BuildCliFlags`](#buildcliflags)
- [`InitCliFlags`](#initcliflags)
- [`PreviewCliFlags`](#previewcliflags)

### Type Aliases

- [`StructuredDocument`](#structureddocument)
- [`StructuredDocumentSection`](#structureddocumentsection)
- [`VivliostyleConfigSchema`](#vivliostyleconfigschema)

## Functions

### build()

> **build**(`cliFlags`): `Promise`\<`void`\>

Build publication file(s) from the given configuration.

```ts
import { build } from '@vivliostyle/cli';
build({
  configPath: './vivliostyle.config.js',
  logLevel: 'silent',
});
```

#### Parameters

• **cliFlags**: [`BuildCliFlags`](api-javascript.md#buildcliflags)

#### Returns

`Promise`\<`void`\>

***

### init()

> **init**(`cliFlags`): `Promise`\<`void`\>

Initialize a new vivliostyle.config.js file.

#### Parameters

• **cliFlags**: [`InitCliFlags`](api-javascript.md#initcliflags)

#### Returns

`Promise`\<`void`\>

***

### preview()

> **preview**(`cliFlags`): `Promise`\<`void`\>

Open a preview of the publication.

#### Parameters

• **cliFlags**: [`PreviewCliFlags`](api-javascript.md#previewcliflags)

#### Returns

`Promise`\<`void`\>

## Interfaces

### BuildCliFlags

#### Extends

- `CliFlags`

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| `author?` | `string` | - |
| `bleed?` | `string` | - |
| `browser?` | `"chromium"` \| `"firefox"` \| `"webkit"` | - |
| `bypassedPdfBuilderOption?` | `string` | - |
| `configPath?` | `string` | - |
| `cropMarks?` | `boolean` | - |
| `cropOffset?` | `string` | - |
| `css?` | `string` | - |
| `executableBrowser?` | `string` | - |
| ~~`executableChromium?`~~ | `string` | **Deprecated** |
| `http?` | `boolean` | - |
| `ignoreHttpsErrors?` | `boolean` | - |
| `image?` | `string` | - |
| `input?` | `string` | - |
| `language?` | `string` | - |
| `logLevel?` | `"silent"` \| `"info"` \| `"verbose"` \| `"debug"` | - |
| `preflight?` | `"press-ready"` \| `"press-ready-local"` | - |
| `preflightOption?` | `string`[] | - |
| `pressReady?` | `boolean` | - |
| `proxyBypass?` | `string` | - |
| `proxyPass?` | `string` | - |
| `proxyServer?` | `string` | - |
| `proxyUser?` | `string` | - |
| `quick?` | `boolean` | - |
| `readingProgression?` | `"ltr"` \| `"rtl"` | - |
| `renderMode?` | `"local"` \| `"docker"` | - |
| `sandbox?` | `boolean` | - |
| `singleDoc?` | `boolean` | - |
| `size?` | `string` | - |
| `style?` | `string` | - |
| `targets?` | `Pick`\<`OutputFormat`, `"path"` \| `"format"`\>[] | - |
| `theme?` | `string` | - |
| `timeout?` | `number` | - |
| `title?` | `string` | - |
| `userStyle?` | `string` | - |
| ~~`verbose?`~~ | `boolean` | **Deprecated** |
| `viewer?` | `string` | - |
| `viewerParam?` | `string` | - |

***

### InitCliFlags

#### Properties

| Property | Type |
| ------ | ------ |
| `author?` | `string` |
| `language?` | `string` |
| `logLevel?` | `"silent"` \| `"info"` \| `"debug"` |
| `size?` | `string` |
| `theme?` | `string` |
| `title?` | `string` |

***

### PreviewCliFlags

#### Extends

- `CliFlags`

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| `author?` | `string` | - |
| `bleed?` | `string` | - |
| `browser?` | `"chromium"` \| `"firefox"` \| `"webkit"` | - |
| `configPath?` | `string` | - |
| `cropMarks?` | `boolean` | - |
| `cropOffset?` | `string` | - |
| `css?` | `string` | - |
| `executableBrowser?` | `string` | - |
| ~~`executableChromium?`~~ | `string` | **Deprecated** |
| `http?` | `boolean` | - |
| `ignoreHttpsErrors?` | `boolean` | - |
| `image?` | `string` | - |
| `input?` | `string` | - |
| `language?` | `string` | - |
| `logLevel?` | `"silent"` \| `"info"` \| `"verbose"` \| `"debug"` | - |
| `preflight?` | `"press-ready"` \| `"press-ready-local"` | - |
| `preflightOption?` | `string`[] | - |
| `pressReady?` | `boolean` | - |
| `proxyBypass?` | `string` | - |
| `proxyPass?` | `string` | - |
| `proxyServer?` | `string` | - |
| `proxyUser?` | `string` | - |
| `quick?` | `boolean` | - |
| `readingProgression?` | `"ltr"` \| `"rtl"` | - |
| `renderMode?` | `"local"` \| `"docker"` | - |
| `sandbox?` | `boolean` | - |
| `singleDoc?` | `boolean` | - |
| `size?` | `string` | - |
| `style?` | `string` | - |
| `targets?` | `Pick`\<`OutputFormat`, `"path"` \| `"format"`\>[] | - |
| `theme?` | `string` | - |
| `timeout?` | `number` | - |
| `title?` | `string` | - |
| `userStyle?` | `string` | - |
| ~~`verbose?`~~ | `boolean` | **Deprecated** |
| `viewer?` | `string` | - |
| `viewerParam?` | `string` | - |

## Type Aliases

### StructuredDocument

> **StructuredDocument**: `object`

#### Type declaration

| Name | Type |
| ------ | ------ |
| `children` | [`StructuredDocument`](api-javascript.md#structureddocument)[] |
| `href` | `string` |
| `sections`? | [`StructuredDocumentSection`](api-javascript.md#structureddocumentsection)[] |
| `title` | `string` |

#### See

https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md

***

### StructuredDocumentSection

> **StructuredDocumentSection**: `object`

#### Type declaration

| Name | Type |
| ------ | ------ |
| `children` | [`StructuredDocumentSection`](api-javascript.md#structureddocumentsection)[] |
| `headingHtml` | `string` |
| `headingText` | `string` |
| `href`? | `string` |
| `id`? | `string` |
| `level` | `number` |

#### See

https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md

***

### VivliostyleConfigSchema

> **VivliostyleConfigSchema**: `v.InferInput`\<*typeof* [`VivliostyleConfigSchema`](api-javascript.md#vivliostyleconfigschema)\>

#### See

https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md

<!-- END JavaScript API -->
