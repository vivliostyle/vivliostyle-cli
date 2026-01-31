# JavaScript API

<!-- START JavaScript API -->
## Exported members

### Functions

- [`build`](#build)
- [`create`](#create)
- [`createVitePlugin`](#createviteplugin)
- [`defineConfig`](#defineconfig)
- [`preview`](#preview)
- [`VFM`](#vfm)

### Interfaces

- [`StringifyMarkdownOptions`](#stringifymarkdownoptions)
- [`TemplateVariable`](#templatevariable)

### Type Aliases

- [`Metadata`](#metadata)
- [`StructuredDocument`](#structureddocument)
- [`StructuredDocumentSection`](#structureddocumentsection)
- [`VivliostyleConfigSchema`](#vivliostyleconfigschema)
- [`VivliostylePackageMetadata`](#vivliostylepackagemetadata)
- [`VivliostylePackageMetadata`](#vivliostylepackagemetadata)

### Variables

- [`readMetadata`](#readmetadata)

## Functions

### build()

> **build**(`options`): `Promise`\<`void`\>

Build publication file(s) from the given configuration.

```ts
import { build } from '@vivliostyle/cli';
build({
  configPath: './vivliostyle.config.js',
  logLevel: 'silent',
});
```

#### Parameters

##### options

###### author?

`string` = `...`

###### bleed?

`string` = `...`

###### browser?

`string` = `...`

###### cmyk?

`boolean` \| \{ `mapOutput?`: `string`; `overrideMap?`: \[\{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

###### config?

`string` = `...`

###### configData?

[`VivliostyleConfigSchema`](#vivliostyleconfigschema) \| `null` = `...`

###### createConfigFileOnly?

`boolean` = `...`

###### cropMarks?

`boolean` = `...`

###### cropOffset?

`string` = `...`

###### css?

`string` = `...`

###### cwd?

`string` = `...`

###### disableServerStartup?

`boolean` = `...`

###### enableStaticServe?

`boolean` = `...`

###### enableViewerStartPage?

`boolean` = `...`

###### executableBrowser?

`string` = `...`

###### host?

`string` \| `boolean` = `...`

###### ignoreHttpsErrors?

`boolean` = `...`

###### image?

`string` = `...`

###### input?

`string` = `...`

###### installDependencies?

`boolean` = `...`

###### language?

`string` = `...`

###### logger?

`LoggerInterface` = `...`

###### logLevel?

`"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

###### openViewer?

`boolean` = `...`

###### output?

`string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

###### port?

`number` = `...`

###### preflight?

`"press-ready"` \| `"press-ready-local"` = `...`

###### preflightOption?

`string` \| `string`[] = `...`

###### pressReady?

`boolean` = `...`

###### projectPath?

`string` = `...`

###### proxyBypass?

`string` = `...`

###### proxyPass?

`string` = `...`

###### proxyServer?

`string` = `...`

###### proxyUser?

`string` = `...`

###### quick?

`boolean` = `...`

###### readingProgression?

`"ltr"` \| `"rtl"` = `...`

###### renderMode?

`"local"` \| `"docker"` = `...`

###### sandbox?

`boolean` = `...`

###### signal?

`AbortSignal` = `...`

###### singleDoc?

`boolean` = `...`

###### size?

`string` = `...`

###### stderr?

`Writable` = `...`

###### stdin?

`Readable` = `...`

###### stdout?

`Writable` = `...`

###### style?

`string` = `...`

###### template?

`string` = `...`

###### theme?

`string` \| `false` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

###### timeout?

`number` = `...`

###### title?

`string` = `...`

###### userStyle?

`string` = `...`

###### viewer?

`string` = `...`

###### viewerParam?

`string` = `...`

###### vite?

`UserConfig` = `...`

###### viteConfigFile?

`string` \| `boolean` = `...`

#### Returns

`Promise`\<`void`\>

***

### create()

> **create**(`options`): `Promise`\<`void`\>

Scaffold a new Vivliostyle project.

#### Parameters

##### options

###### author?

`string` = `...`

###### bleed?

`string` = `...`

###### browser?

`string` = `...`

###### cmyk?

`boolean` \| \{ `mapOutput?`: `string`; `overrideMap?`: \[\{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

###### config?

`string` = `...`

###### configData?

[`VivliostyleConfigSchema`](#vivliostyleconfigschema) \| `null` = `...`

###### createConfigFileOnly?

`boolean` = `...`

###### cropMarks?

`boolean` = `...`

###### cropOffset?

`string` = `...`

###### css?

`string` = `...`

###### cwd?

`string` = `...`

###### disableServerStartup?

`boolean` = `...`

###### enableStaticServe?

`boolean` = `...`

###### enableViewerStartPage?

`boolean` = `...`

###### executableBrowser?

`string` = `...`

###### host?

`string` \| `boolean` = `...`

###### ignoreHttpsErrors?

`boolean` = `...`

###### image?

`string` = `...`

###### input?

`string` = `...`

###### installDependencies?

`boolean` = `...`

###### language?

`string` = `...`

###### logger?

`LoggerInterface` = `...`

###### logLevel?

`"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

###### openViewer?

`boolean` = `...`

###### output?

`string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

###### port?

`number` = `...`

###### preflight?

`"press-ready"` \| `"press-ready-local"` = `...`

###### preflightOption?

`string` \| `string`[] = `...`

###### pressReady?

`boolean` = `...`

###### projectPath?

`string` = `...`

###### proxyBypass?

`string` = `...`

###### proxyPass?

`string` = `...`

###### proxyServer?

`string` = `...`

###### proxyUser?

`string` = `...`

###### quick?

`boolean` = `...`

###### readingProgression?

`"ltr"` \| `"rtl"` = `...`

###### renderMode?

`"local"` \| `"docker"` = `...`

###### sandbox?

`boolean` = `...`

###### signal?

`AbortSignal` = `...`

###### singleDoc?

`boolean` = `...`

###### size?

`string` = `...`

###### stderr?

`Writable` = `...`

###### stdin?

`Readable` = `...`

###### stdout?

`Writable` = `...`

###### style?

`string` = `...`

###### template?

`string` = `...`

###### theme?

`string` \| `false` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

###### timeout?

`number` = `...`

###### title?

`string` = `...`

###### userStyle?

`string` = `...`

###### viewer?

`string` = `...`

###### viewerParam?

`string` = `...`

###### vite?

`UserConfig` = `...`

###### viteConfigFile?

`string` \| `boolean` = `...`

#### Returns

`Promise`\<`void`\>

***

### createVitePlugin()

> **createVitePlugin**(`inlineConfig`): `Promise`\<`Plugin`\<`any`\>[]\>

#### Parameters

##### inlineConfig

###### author?

`string` = `...`

###### bleed?

`string` = `...`

###### browser?

`string` = `...`

###### cmyk?

`boolean` \| \{ `mapOutput?`: `string`; `overrideMap?`: \[\{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

###### config?

`string` = `...`

###### configData?

[`VivliostyleConfigSchema`](#vivliostyleconfigschema) \| `null` = `...`

###### createConfigFileOnly?

`boolean` = `...`

###### cropMarks?

`boolean` = `...`

###### cropOffset?

`string` = `...`

###### css?

`string` = `...`

###### cwd?

`string` = `...`

###### disableServerStartup?

`boolean` = `...`

###### enableStaticServe?

`boolean` = `...`

###### enableViewerStartPage?

`boolean` = `...`

###### executableBrowser?

`string` = `...`

###### host?

`string` \| `boolean` = `...`

###### ignoreHttpsErrors?

`boolean` = `...`

###### image?

`string` = `...`

###### input?

`string` = `...`

###### installDependencies?

`boolean` = `...`

###### language?

`string` = `...`

###### logger?

`LoggerInterface` = `...`

###### logLevel?

`"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

###### openViewer?

`boolean` = `...`

###### output?

`string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

###### port?

`number` = `...`

###### preflight?

`"press-ready"` \| `"press-ready-local"` = `...`

###### preflightOption?

`string` \| `string`[] = `...`

###### pressReady?

`boolean` = `...`

###### projectPath?

`string` = `...`

###### proxyBypass?

`string` = `...`

###### proxyPass?

`string` = `...`

###### proxyServer?

`string` = `...`

###### proxyUser?

`string` = `...`

###### quick?

`boolean` = `...`

###### readingProgression?

`"ltr"` \| `"rtl"` = `...`

###### renderMode?

`"local"` \| `"docker"` = `...`

###### sandbox?

`boolean` = `...`

###### signal?

`AbortSignal` = `...`

###### singleDoc?

`boolean` = `...`

###### size?

`string` = `...`

###### stderr?

`Writable` = `...`

###### stdin?

`Readable` = `...`

###### stdout?

`Writable` = `...`

###### style?

`string` = `...`

###### template?

`string` = `...`

###### theme?

`string` \| `false` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

###### timeout?

`number` = `...`

###### title?

`string` = `...`

###### userStyle?

`string` = `...`

###### viewer?

`string` = `...`

###### viewerParam?

`string` = `...`

###### vite?

`UserConfig` = `...`

###### viteConfigFile?

`string` \| `boolean` = `...`

#### Returns

`Promise`\<`Plugin`\<`any`\>[]\>

***

### defineConfig()

> **defineConfig**(`config`): [`VivliostyleConfigSchema`](#vivliostyleconfigschema)

Define the configuration for Vivliostyle CLI.

#### Parameters

##### config

[`VivliostyleConfigSchema`](#vivliostyleconfigschema)

#### Returns

[`VivliostyleConfigSchema`](#vivliostyleconfigschema)

***

### preview()

> **preview**(`options`): `Promise`\<`ViteDevServer`\>

Open a browser for previewing the publication.

#### Parameters

##### options

###### author?

`string` = `...`

###### bleed?

`string` = `...`

###### browser?

`string` = `...`

###### cmyk?

`boolean` \| \{ `mapOutput?`: `string`; `overrideMap?`: \[\{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

###### config?

`string` = `...`

###### configData?

[`VivliostyleConfigSchema`](#vivliostyleconfigschema) \| `null` = `...`

###### createConfigFileOnly?

`boolean` = `...`

###### cropMarks?

`boolean` = `...`

###### cropOffset?

`string` = `...`

###### css?

`string` = `...`

###### cwd?

`string` = `...`

###### disableServerStartup?

`boolean` = `...`

###### enableStaticServe?

`boolean` = `...`

###### enableViewerStartPage?

`boolean` = `...`

###### executableBrowser?

`string` = `...`

###### host?

`string` \| `boolean` = `...`

###### ignoreHttpsErrors?

`boolean` = `...`

###### image?

`string` = `...`

###### input?

`string` = `...`

###### installDependencies?

`boolean` = `...`

###### language?

`string` = `...`

###### logger?

`LoggerInterface` = `...`

###### logLevel?

`"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

###### openViewer?

`boolean` = `...`

###### output?

`string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

###### port?

`number` = `...`

###### preflight?

`"press-ready"` \| `"press-ready-local"` = `...`

###### preflightOption?

`string` \| `string`[] = `...`

###### pressReady?

`boolean` = `...`

###### projectPath?

`string` = `...`

###### proxyBypass?

`string` = `...`

###### proxyPass?

`string` = `...`

###### proxyServer?

`string` = `...`

###### proxyUser?

`string` = `...`

###### quick?

`boolean` = `...`

###### readingProgression?

`"ltr"` \| `"rtl"` = `...`

###### renderMode?

`"local"` \| `"docker"` = `...`

###### sandbox?

`boolean` = `...`

###### signal?

`AbortSignal` = `...`

###### singleDoc?

`boolean` = `...`

###### size?

`string` = `...`

###### stderr?

`Writable` = `...`

###### stdin?

`Readable` = `...`

###### stdout?

`Writable` = `...`

###### style?

`string` = `...`

###### template?

`string` = `...`

###### theme?

`string` \| `false` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

###### timeout?

`number` = `...`

###### title?

`string` = `...`

###### userStyle?

`string` = `...`

###### viewer?

`string` = `...`

###### viewerParam?

`string` = `...`

###### vite?

`UserConfig` = `...`

###### viteConfigFile?

`string` \| `boolean` = `...`

#### Returns

`Promise`\<`ViteDevServer`\>

***

### VFM()

> **VFM**(`options?`, `metadata?`): `Processor`

Create Unified processor for Markdown AST and Hypertext AST.

#### Parameters

##### options?

[`StringifyMarkdownOptions`](#stringifymarkdownoptions)

Options.

##### metadata?

[`Metadata`](#metadata)

#### Returns

`Processor`

Unified processor.

## Interfaces

### StringifyMarkdownOptions

Option for convert Markdown to a stringify (HTML).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="assignidtofigcaption"></a> `assignIdToFigcaption?` | `boolean` | Assign ID to figcaption instead of img/code. |
| <a id="disableformathtml"></a> `disableFormatHtml?` | `boolean` | Disable automatic HTML format. |
| <a id="hardlinebreaks"></a> `hardLineBreaks?` | `boolean` | Add `<br>` at the position of hard line breaks, without needing spaces. |
| <a id="imgfigcaptionorder"></a> `imgFigcaptionOrder?` | `"img-figcaption"` \| `"figcaption-img"` | Order of img and figcaption elements in figure. |
| <a id="language"></a> `language?` | `string` | Document language (ignored in partial mode). |
| <a id="math"></a> `math?` | `boolean` | Enable math syntax. |
| <a id="partial"></a> `partial?` | `boolean` | Output markdown fragments. |
| <a id="replace"></a> `replace?` | `ReplaceRule`[] | Replacement handler for HTML string. |
| <a id="style"></a> `style?` | `string` \| `string`[] | Custom stylesheet path/URL. |
| <a id="title"></a> `title?` | `string` | Document title (ignored in partial mode). |

***

### TemplateVariable

#### Extends

- `Omit`\<`ParsedVivliostyleInlineConfig`, `"theme"`\>

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="author"></a> `author` | `string` |
| <a id="bleed"></a> `bleed?` | `string` |
| <a id="browser"></a> `browser?` | `object` |
| `browser.tag?` | `string` |
| `browser.type` | `"chrome"` \| `"chromium"` \| `"firefox"` |
| <a id="cliversion"></a> `cliVersion` | `string` |
| <a id="cmyk"></a> `cmyk?` | `boolean` \| \{ `mapOutput?`: `string`; `overrideMap?`: \[\{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} |
| <a id="config"></a> `config?` | `string` |
| <a id="configdata"></a> `configData?` | [`VivliostyleConfigSchema`](#vivliostyleconfigschema) \| `null` |
| <a id="coreversion"></a> `coreVersion` | `string` |
| <a id="createconfigfileonly"></a> `createConfigFileOnly?` | `boolean` |
| <a id="cropmarks"></a> `cropMarks?` | `boolean` |
| <a id="cropoffset"></a> `cropOffset?` | `string` |
| <a id="css"></a> `css?` | `string` |
| <a id="cwd"></a> `cwd?` | `string` |
| <a id="disableserverstartup"></a> `disableServerStartup?` | `boolean` |
| <a id="enablestaticserve"></a> `enableStaticServe?` | `boolean` |
| <a id="enableviewerstartpage"></a> `enableViewerStartPage?` | `boolean` |
| <a id="executablebrowser"></a> `executableBrowser?` | `string` |
| <a id="host"></a> `host?` | `string` \| `boolean` |
| <a id="ignorehttpserrors"></a> `ignoreHttpsErrors?` | `boolean` |
| <a id="image"></a> `image?` | `string` |
| <a id="input"></a> `input?` | `object` |
| `input.entry` | `string` |
| `input.format` | `InputFormat` |
| <a id="installdependencies"></a> `installDependencies?` | `boolean` |
| <a id="language-1"></a> `language` | `string` |
| <a id="logger"></a> `logger?` | `LoggerInterface` |
| <a id="loglevel"></a> `logLevel?` | `"info"` \| `"silent"` \| `"verbose"` \| `"debug"` |
| <a id="openviewer"></a> `openViewer?` | `boolean` |
| <a id="output"></a> `output?` | `object` & `object` & `object`[] |
| <a id="port"></a> `port?` | `number` |
| <a id="preflight"></a> `preflight?` | `"press-ready"` \| `"press-ready-local"` |
| <a id="preflightoption"></a> `preflightOption?` | `string`[] |
| <a id="pressready"></a> `pressReady?` | `boolean` |
| <a id="projectpath"></a> `projectPath` | `string` |
| <a id="proxybypass"></a> `proxyBypass?` | `string` |
| <a id="proxypass"></a> `proxyPass?` | `string` |
| <a id="proxyserver"></a> `proxyServer?` | `string` |
| <a id="proxyuser"></a> `proxyUser?` | `string` |
| <a id="quick"></a> `quick?` | `boolean` |
| <a id="readingprogression"></a> `readingProgression?` | `"ltr"` \| `"rtl"` |
| <a id="rendermode"></a> `renderMode?` | `"local"` \| `"docker"` |
| <a id="sandbox"></a> `sandbox?` | `boolean` |
| <a id="signal"></a> `signal?` | `AbortSignal` |
| <a id="singledoc"></a> `singleDoc?` | `boolean` |
| <a id="size"></a> `size?` | `string` |
| <a id="stderr"></a> `stderr?` | `Writable` |
| <a id="stdin"></a> `stdin?` | `Readable` |
| <a id="stdout"></a> `stdout?` | `Writable` |
| <a id="style-1"></a> `style?` | `string` |
| <a id="template"></a> `template?` | `string` |
| <a id="theme"></a> `theme?` | `string` \| `object` & `object` \| (`string` \| `object` & `object`)[] |
| <a id="themepackage"></a> `themePackage?` | `VivliostylePackageJson` |
| <a id="timeout"></a> `timeout?` | `number` |
| <a id="title-1"></a> `title` | `string` |
| <a id="userstyle"></a> `userStyle?` | `string` |
| <a id="viewer"></a> `viewer?` | `string` |
| <a id="viewerparam"></a> `viewerParam?` | `string` |
| <a id="vite"></a> `vite?` | `UserConfig` |
| <a id="viteconfigfile"></a> `viteConfigFile?` | `string` \| `boolean` |

## Type Aliases

### Metadata

> **Metadata** = `object`

Metadata from Frontmatter.

#### Properties

##### base?

> `optional` **base**: `Attribute`[]

Attributes of `<base>`.

##### body?

> `optional` **body**: `Attribute`[]

Attributes of `<body>`.

##### class?

> `optional` **class**: `string`

Value of `<html class="...">`.

##### custom?

> `optional` **custom**: `object`

A set of key-value pairs that are specified in `readMetadata` not to be processed as `<meta>`.
The data types converted from Frontmatter's YAML are retained.
Use this if want to add custom metadata with a third party tool.

###### Index Signature

\[`key`: `string`\]: `any`

##### dir?

> `optional` **dir**: `string`

Value of `<html dir="...">`. e.g. `ltr`, `rtl`, `auto`.

##### head?

> `optional` **head**: `string`

`<head>...</head>`, reserved for future use.

##### html?

> `optional` **html**: `Attribute`[]

Attributes of `<html>`.
The `id`,` lang`, `dir`, and` class` specified in the root take precedence over the value of this property.

##### id?

> `optional` **id**: `string`

Value of `<html id="...">`.

##### lang?

> `optional` **lang**: `string`

Value of `<html lang="...">`.

##### link?

> `optional` **link**: `Attribute`[][]

Attribute collection of `<link>`.

##### meta?

> `optional` **meta**: `Attribute`[][]

Attribute collection of `<meta>`.

##### script?

> `optional` **script**: `Attribute`[][]

Attribute collection of `<script>`.

##### style?

> `optional` **style**: `string`

`<style>...</style>`, reserved for future use.

##### title?

> `optional` **title**: `string`

Value of `<title>...</title>`.

##### vfm?

> `optional` **vfm**: `VFMSettings`

VFM settings.

***

### StructuredDocument

> **StructuredDocument** = `object`

#### See

https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md

#### Properties

##### children

> **children**: [`StructuredDocument`](#structureddocument)[]

##### href

> **href**: `string`

##### sections?

> `optional` **sections**: [`StructuredDocumentSection`](#structureddocumentsection)[]

##### title

> **title**: `string`

***

### StructuredDocumentSection

> **StructuredDocumentSection** = `object`

#### See

https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md

#### Properties

##### children

> **children**: [`StructuredDocumentSection`](#structureddocumentsection)[]

##### headingHtml

> **headingHtml**: `string`

##### headingText

> **headingText**: `string`

##### href?

> `optional` **href**: `string`

##### id?

> `optional` **id**: `string`

##### level

> **level**: `number`

***

### VivliostyleConfigSchema

> **VivliostyleConfigSchema** = `BuildTask`[] \| `BuildTask`

#### See

https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md

***

### VivliostylePackageMetadata

> **VivliostylePackageMetadata** = `SchemaWithPipe`\<readonly \[`Omit`\<`ObjectSchema`\<\{ `template`: `SchemaWithPipe`\<readonly \[`RecordSchema`\<`SchemaWithPipe`\<readonly \[..., ..., ...\]\>, `ObjectSchema`\<\{ `description`: ...; `name`: ...; `prompt`: ...; `source`: ...; \}, `undefined`\>, `undefined`\>, `TitleAction`\<\{[`key`: `string`]: `object`; \}, `"VivliostyleTemplateMetadata"`\>\]\>; `theme`: `SchemaWithPipe`\<readonly \[`ObjectSchema`\<\{ `author`: `SchemaWithPipe`\<...\>; `category`: `SchemaWithPipe`\<...\>; `name`: `SchemaWithPipe`\<...\>; `style`: `SchemaWithPipe`\<...\>; `topics`: `SchemaWithPipe`\<...\>; \}, `undefined`\>, `TitleAction`\<\{ `author?`: ... \| ...; `category?`: ... \| ...; `name?`: ... \| ...; `style?`: ... \| ...; `topics?`: ... \| ...; \}, `"VivliostyleThemeMetadata"`\>\]\>; \}, `undefined`\>, `"entries"` \| `"~types"` \| `"~run"` \| `"~standard"`\> & `object`, `TitleAction`\<\{ `template?`: \{[`key`: `string`]: `object`; \}; `theme?`: \{ `author?`: `string`; `category?`: `string`; `name?`: `string`; `style?`: `string`; `topics?`: `string`[]; \}; \}, `"VivliostylePackageMetadata"`\>\]\>

***

### VivliostylePackageMetadata

> **VivliostylePackageMetadata** = `v.InferInput`\<*typeof* [`VivliostylePackageMetadata`](#vivliostylepackagemetadata)\>

## Variables

### readMetadata()

> `const` **readMetadata**: (`md`, `customKeys?`) => [`Metadata`](#metadata)

Read metadata from Markdown frontmatter.

Keys that are not defined as VFM are treated as `meta`. If you specify a key name in `customKeys`, the key and its data type will be preserved and stored in `custom` instead of `meta`.

#### Parameters

##### md

`string`

Markdown.

##### customKeys?

`string`[]

A collection of key names to be ignored by meta processing.

#### Returns

[`Metadata`](#metadata)

Metadata.

<!-- END JavaScript API -->
