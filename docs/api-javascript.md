# JavaScript API

<!-- START JavaScript API -->
## Exported members

### Functions

- [`build`](#build)
- [`create`](#create)
- [`createVitePlugin`](#createviteplugin)
- [`preview`](#preview)

### Interfaces

- [`TemplateVariable`](#templatevariable)

### Type Aliases

- [`StructuredDocument`](#structureddocument)
- [`StructuredDocumentSection`](#structureddocumentsection)
- [`VivliostyleConfigSchema`](#vivliostyleconfigschema)
- [`VivliostylePackageMetadata`](#vivliostylepackagemetadata)
- [`VivliostylePackageMetadata`](#vivliostylepackagemetadata)

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

`"chromium"` \| `"firefox"` \| `"webkit"` = `...`

###### config?

`string` = `...`

###### configData?

`object` & `object` \| `object` & `object`[] \| `null` = `...`

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

`string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

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

`"chromium"` \| `"firefox"` \| `"webkit"` = `...`

###### config?

`string` = `...`

###### configData?

`object` & `object` \| `object` & `object`[] \| `null` = `...`

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

`string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

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

`"chromium"` \| `"firefox"` \| `"webkit"` = `...`

###### config?

`string` = `...`

###### configData?

`object` & `object` \| `object` & `object`[] \| `null` = `...`

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

`string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

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

`"chromium"` \| `"firefox"` \| `"webkit"` = `...`

###### config?

`string` = `...`

###### configData?

`object` & `object` \| `object` & `object`[] \| `null` = `...`

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

`string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

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

## Interfaces

### TemplateVariable

#### Extends

- `Omit`\<`ParsedVivliostyleInlineConfig`, `"theme"`\>

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="author"></a> `author` | `string` |
| <a id="bleed"></a> `bleed?` | `string` |
| <a id="browser"></a> `browser?` | `"chromium"` \| `"firefox"` \| `"webkit"` |
| <a id="cliversion"></a> `cliVersion` | `string` |
| <a id="config"></a> `config?` | `string` |
| <a id="configdata"></a> `configData?` | `object` & `object` \| `object` & `object`[] \| `null` |
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
| <a id="language"></a> `language` | `string` |
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
| <a id="style"></a> `style?` | `string` |
| <a id="template"></a> `template?` | `string` |
| <a id="theme"></a> `theme?` | `string` \| `object` & `object` \| (`string` \| `object` & `object`)[] |
| <a id="themepackage"></a> `themePackage?` | `VivliostylePackageJson` |
| <a id="timeout"></a> `timeout?` | `number` |
| <a id="title"></a> `title` | `string` |
| <a id="userstyle"></a> `userStyle?` | `string` |
| <a id="viewer"></a> `viewer?` | `string` |
| <a id="viewerparam"></a> `viewerParam?` | `string` |
| <a id="vite"></a> `vite?` | `UserConfig` |
| <a id="viteconfigfile"></a> `viteConfigFile?` | `string` \| `boolean` |

## Type Aliases

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

> **VivliostyleConfigSchema** = `v.InferInput`\<*typeof* [`VivliostyleConfigSchema`](#vivliostyleconfigschema)\>

#### See

https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md

***

### VivliostylePackageMetadata

> **VivliostylePackageMetadata** = `SchemaWithPipe`\<readonly \[`Omit`\<`ObjectSchema`\<\{ `template`: `SchemaWithPipe`\<readonly \[`RecordSchema`\<`SchemaWithPipe`\<readonly \[..., ..., ...\]\>, `ObjectSchema`\<\{ `description`: ...; `name`: ...; `prompt`: ...; `source`: ...; \}, `undefined`\>, `undefined`\>, `TitleAction`\<\{[`key`: `string`]: `object`; \}, `"VivliostyleTemplateMetadata"`\>\]\>; `theme`: `SchemaWithPipe`\<readonly \[`ObjectSchema`\<\{ `author`: `SchemaWithPipe`\<...\>; `category`: `SchemaWithPipe`\<...\>; `name`: `SchemaWithPipe`\<...\>; `style`: `SchemaWithPipe`\<...\>; `topics`: `SchemaWithPipe`\<...\>; \}, `undefined`\>, `TitleAction`\<\{ `author?`: ... \| ...; `category?`: ... \| ...; `name?`: ... \| ...; `style?`: ... \| ...; `topics?`: ... \| ...; \}, `"VivliostyleThemeMetadata"`\>\]\>; \}, `undefined`\>, `"entries"` \| `"~types"` \| `"~run"` \| `"~standard"`\> & `object`, `TitleAction`\<\{ `template?`: \{[`key`: `string`]: `object`; \}; `theme?`: \{ `author?`: `string`; `category?`: `string`; `name?`: `string`; `style?`: `string`; `topics?`: `string`[]; \}; \}, `"VivliostylePackageMetadata"`\>\]\>

***

### VivliostylePackageMetadata

> **VivliostylePackageMetadata** = `v.InferInput`\<*typeof* [`VivliostylePackageMetadata`](#vivliostylepackagemetadata)\>

<!-- END JavaScript API -->
