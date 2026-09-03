# JavaScript API

<!-- START JavaScript API -->
## Exported members

### Functions

- [`build`](#build)
- [`create`](#create)
- [`createBuiltinCmykConversionReplacement`](#createbuiltincmykconversionreplacement)
- [`createBuiltinGrayConversionReplacement`](#createbuiltingrayconversionreplacement)
- [`createBuiltinRgbConversionReplacement`](#createbuiltinrgbconversionreplacement)
- [`createIccConversionReplacement`](#createiccconversionreplacement)
- [`createVitePlugin`](#createviteplugin)
- [`defineConfig`](#defineconfig)
- [`preview`](#preview)
- [`VFM`](#vfm)

### Interfaces

- [`CMYKValue`](#cmykvalue)
- [`ColorConversionOptions`](#colorconversionoptions)
- [`IccConversionOptions`](#iccconversionoptions)
- [`ReplaceFunctionContext`](#replacefunctioncontext)
- [`StringifyMarkdownOptions`](#stringifymarkdownoptions)
- [`TemplateVariable`](#templatevariable)

### Type Aliases

- [`CmykConvertFunction`](#cmykconvertfunction)
- [`ImageConversionReplacement`](#imageconversionreplacement)
- [`Metadata`](#metadata)
- [`ReplaceFunction`](#replacefunction)
- [`StructuredDocument`](#structureddocument)
- [`StructuredDocumentSection`](#structureddocumentsection)
- [`TocCompose`](#toccompose)
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

`boolean` \| \{ `fallback?`: [`CmykConvertFunction`](#cmykconvertfunction); `ifIncompatibleImagesFound?`: `"warn"` \| `"error"` \| `"ignore"`; `ifUnmappedColorsFound?`: `"warn"` \| `"error"` \| `"ignore"`; `mapOutput?`: `string`; `overrideMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

`boolean` \| \{ `fallback?`: [`CmykConvertFunction`](#cmykconvertfunction); `ifIncompatibleImagesFound?`: `"warn"` \| `"error"` \| `"ignore"`; `ifUnmappedColorsFound?`: `"warn"` \| `"error"` \| `"ignore"`; `mapOutput?`: `string`; `overrideMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

### createBuiltinCmykConversionReplacement()

> **createBuiltinCmykConversionReplacement**(`options?`): [`ImageConversionReplacement`](#imageconversionreplacement)

Creates a replacement that converts images to DeviceCMYK.

#### Parameters

##### options?

[`ColorConversionOptions`](#colorconversionoptions) = `{}`

#### Returns

[`ImageConversionReplacement`](#imageconversionreplacement)

***

### createBuiltinGrayConversionReplacement()

> **createBuiltinGrayConversionReplacement**(`options?`): [`ImageConversionReplacement`](#imageconversionreplacement)

Creates a replacement that converts images to DeviceGray.

#### Parameters

##### options?

[`ColorConversionOptions`](#colorconversionoptions) = `{}`

#### Returns

[`ImageConversionReplacement`](#imageconversionreplacement)

***

### createBuiltinRgbConversionReplacement()

> **createBuiltinRgbConversionReplacement**(`options?`): [`ImageConversionReplacement`](#imageconversionreplacement)

Creates a replacement that converts images to DeviceRGB.

#### Parameters

##### options?

[`ColorConversionOptions`](#colorconversionoptions) = `{}`

#### Returns

[`ImageConversionReplacement`](#imageconversionreplacement)

***

### createIccConversionReplacement()

> **createIccConversionReplacement**(`options`): [`ImageConversionReplacement`](#imageconversionreplacement)

Creates a replacement that converts images using a destination ICC
profile and returns an image in the corresponding Device color space.

#### Parameters

##### options

[`IccConversionOptions`](#iccconversionoptions)

#### Returns

[`ImageConversionReplacement`](#imageconversionreplacement)

***

### createVitePlugin()

> **createVitePlugin**(`inlineConfig?`): `Promise`\<`Plugin`\<`any`\>[]\>

#### Parameters

##### inlineConfig?

###### author?

`string` = `...`

###### bleed?

`string` = `...`

###### browser?

`string` = `...`

###### cmyk?

`boolean` \| \{ `fallback?`: [`CmykConvertFunction`](#cmykconvertfunction); `ifIncompatibleImagesFound?`: `"warn"` \| `"error"` \| `"ignore"`; `ifUnmappedColorsFound?`: `"warn"` \| `"error"` \| `"ignore"`; `mapOutput?`: `string`; `overrideMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

`boolean` \| \{ `fallback?`: [`CmykConvertFunction`](#cmykconvertfunction); `ifIncompatibleImagesFound?`: `"warn"` \| `"error"` \| `"ignore"`; `ifUnmappedColorsFound?`: `"warn"` \| `"error"` \| `"ignore"`; `mapOutput?`: `string`; `overrideMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

### CMYKValue

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-c"></a> `c` | `number` |
| <a id="property-k"></a> `k` | `number` |
| <a id="property-m"></a> `m` | `number` |
| <a id="property-y"></a> `y` | `number` |

***

### ColorConversionOptions

Options shared by image color conversion replacements.

#### Extended by

- [`IccConversionOptions`](#iccconversionoptions)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-inputprofile"></a> `inputProfile?` | `string` | Path to an ICC profile used to interpret an unprofiled DeviceGray, DeviceRGB, or DeviceCMYK input. It must use the same color space as the input image. Relative paths use the same entry context as `replaceImage` source and replacement paths. |

***

### IccConversionOptions

Options for conversion using a caller-provided destination ICC profile.

#### Extends

- [`ColorConversionOptions`](#colorconversionoptions)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-inputprofile-1"></a> `inputProfile?` | `string` | Path to an ICC profile used to interpret an unprofiled DeviceGray, DeviceRGB, or DeviceCMYK input. It must use the same color space as the input image. Relative paths use the same entry context as `replaceImage` source and replacement paths. |
| <a id="property-outputprofile"></a> `outputProfile` | `string` | Path to the destination ICC profile. Relative paths use the same entry context as `replaceImage` source and replacement paths. The converted image uses the corresponding Device color space; the profile itself is not embedded in the image. |

***

### ReplaceFunctionContext

Values available while a replacement function is running.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-image"></a> `image` | `Image` | The current PDF image as an owned reference scoped to this invocation. Its ownership is moved into the replacement function and Vivliostyle CLI destroys it when the function settles unless it is returned as the replacement. It must not be destroyed manually or retained after the function settles. Native objects returned by its methods are owned by the replacement function and must be destroyed before it settles unless that object is an image returned as the replacement. |
| <a id="property-mupdf"></a> `mupdf` | `__module` | The MuPDF module that owns the current image. |

***

### StringifyMarkdownOptions

Option for convert Markdown to a stringify (HTML).

Declared as `interface` so that downstream consumers (e.g.
vivliostyle-cli) see a stable nominal name instead of
`v.InferInput<typeof StringifyMarkdownOptionsSchema>`. The latter form
causes TypeScript to expand the schema's structural shape during
declaration emit and pulls non-portable `.pnpm/...` paths through pnpm
isolated installs (TS2742). The compile-time check below pins this
interface to the schema, so a drift in either direction is rejected.

#### Extends

- `InferInput`\<*typeof* `_stringifyMarkdownOptionsSchema`\>

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-assignidtofigcaption"></a> `assignIdToFigcaption?` | `boolean` |
| <a id="property-captionlessimagepolicy"></a> `captionlessImagePolicy?` | `"paragraph"` \| `"figure"` \| `"figure-with-figcaption"` |
| <a id="property-disableformathtml"></a> `disableFormatHtml?` | `boolean` |
| <a id="property-editplugins"></a> `editPlugins?` | `EditPlugins` |
| <a id="property-footnote"></a> `footnote?` | `"pandoc"` \| `"dpub"` \| `"gcpm"` \| \{ `mode`: `"pandoc"`; \} \| \{ `body?`: `Properties` \| `DpubBodyFactory`; `call?`: `Properties` \| `DpubCallFactory`; `mode`: `"dpub"`; \} \| \{ `body?`: `Properties` \| `GcpmBodyFactory`; `duplicatedCall?`: `Properties` \| `GcpmDuplicatedCallFactory`; `mode`: `"gcpm"`; \} |
| <a id="property-hardlinebreaks"></a> `hardLineBreaks?` | `boolean` |
| <a id="property-imgfigcaptionorder"></a> `imgFigcaptionOrder?` | `"img-figcaption"` \| `"figcaption-img"` |
| <a id="property-language"></a> `language?` | `string` |
| <a id="property-math"></a> `math?` | `boolean` |
| <a id="property-mathrenderer"></a> `mathRenderer?` | `"mathjax"` \| `"mathml"` |
| <a id="property-parsefigcaptionasinline"></a> `parseFigcaptionAsInline?` | `boolean` |
| <a id="property-partial"></a> `partial?` | `boolean` |
| <a id="property-replace"></a> `replace?` | `ReplaceRule`[] |
| <a id="property-rewriterelativehrefextensions"></a> `rewriteRelativeHrefExtensions?` | `boolean` \| readonly `string`[] |
| <a id="property-style"></a> `style?` | `string` \| `string`[] |
| <a id="property-table"></a> `table?` | `object` |
| `table.cell?` | `"align-attribute"` \| `"align-class"` \| `"align-style"` \| `TableCellHook` |
| <a id="property-title"></a> `title?` | `string` |

***

### TemplateVariable

#### Extends

- `Omit`\<`ParsedVivliostyleInlineConfig`, `"theme"`\>

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-author"></a> `author` | `string` |
| <a id="property-bleed"></a> `bleed?` | `string` |
| <a id="property-browser"></a> `browser?` | `object` |
| `browser.tag?` | `string` |
| `browser.type` | `"chrome"` \| `"chromium"` \| `"firefox"` |
| <a id="property-cliversion"></a> `cliVersion` | `string` |
| <a id="property-cmyk"></a> `cmyk?` | `boolean` \| \{ `fallback?`: [`CmykConvertFunction`](#cmykconvertfunction); `ifIncompatibleImagesFound?`: `"warn"` \| `"error"` \| `"ignore"`; `ifUnmappedColorsFound?`: `"warn"` \| `"error"` \| `"ignore"`; `mapOutput?`: `string`; `overrideMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} |
| <a id="property-config"></a> `config?` | `string` |
| <a id="property-configdata"></a> `configData?` | [`VivliostyleConfigSchema`](#vivliostyleconfigschema) \| `null` |
| <a id="property-coreversion"></a> `coreVersion` | `string` |
| <a id="property-createconfigfileonly"></a> `createConfigFileOnly?` | `boolean` |
| <a id="property-cropmarks"></a> `cropMarks?` | `boolean` |
| <a id="property-cropoffset"></a> `cropOffset?` | `string` |
| <a id="property-css"></a> `css?` | `string` |
| <a id="property-cwd"></a> `cwd?` | `string` |
| <a id="property-disableserverstartup"></a> `disableServerStartup?` | `boolean` |
| <a id="property-enablestaticserve"></a> `enableStaticServe?` | `boolean` |
| <a id="property-enableviewerstartpage"></a> `enableViewerStartPage?` | `boolean` |
| <a id="property-executablebrowser"></a> `executableBrowser?` | `string` |
| <a id="property-host"></a> `host?` | `string` \| `boolean` |
| <a id="property-ignorehttpserrors"></a> `ignoreHttpsErrors?` | `boolean` |
| <a id="property-image-1"></a> `image?` | `string` |
| <a id="property-input"></a> `input?` | `object` |
| `input.entry` | `string` |
| `input.format` | `InputFormat` |
| <a id="property-installdependencies"></a> `installDependencies?` | `boolean` |
| <a id="property-language-1"></a> `language` | `string` |
| <a id="property-logger"></a> `logger?` | `LoggerInterface` |
| <a id="property-loglevel"></a> `logLevel?` | `"info"` \| `"silent"` \| `"verbose"` \| `"debug"` |
| <a id="property-openviewer"></a> `openViewer?` | `boolean` |
| <a id="property-output"></a> `output?` | `object` & `object` & `object`[] |
| <a id="property-port"></a> `port?` | `number` |
| <a id="property-preflight"></a> `preflight?` | `"press-ready"` \| `"press-ready-local"` |
| <a id="property-preflightoption"></a> `preflightOption?` | `string`[] |
| <a id="property-pressready"></a> `pressReady?` | `boolean` |
| <a id="property-projectpath"></a> `projectPath` | `string` |
| <a id="property-proxybypass"></a> `proxyBypass?` | `string` |
| <a id="property-proxypass"></a> `proxyPass?` | `string` |
| <a id="property-proxyserver"></a> `proxyServer?` | `string` |
| <a id="property-proxyuser"></a> `proxyUser?` | `string` |
| <a id="property-quick"></a> `quick?` | `boolean` |
| <a id="property-readingprogression"></a> `readingProgression?` | `"ltr"` \| `"rtl"` |
| <a id="property-rendermode"></a> `renderMode?` | `"local"` \| `"docker"` |
| <a id="property-sandbox"></a> `sandbox?` | `boolean` |
| <a id="property-signal"></a> `signal?` | `AbortSignal` |
| <a id="property-singledoc"></a> `singleDoc?` | `boolean` |
| <a id="property-size"></a> `size?` | `string` |
| <a id="property-stderr"></a> `stderr?` | `Writable` |
| <a id="property-stdin"></a> `stdin?` | `Readable` |
| <a id="property-stdout"></a> `stdout?` | `Writable` |
| <a id="property-style-1"></a> `style?` | `string` |
| <a id="property-template"></a> `template?` | `string` |
| <a id="property-theme"></a> `theme?` | `string` \| `object` & `object` \| (`string` \| `object` & `object`)[] |
| <a id="property-themepackage"></a> `themePackage?` | `VivliostylePackageJson` |
| <a id="property-timeout"></a> `timeout?` | `number` |
| <a id="property-title-1"></a> `title` | `string` |
| <a id="property-userstyle"></a> `userStyle?` | `string` |
| <a id="property-viewer"></a> `viewer?` | `string` |
| <a id="property-viewerparam"></a> `viewerParam?` | `string` |
| <a id="property-vite"></a> `vite?` | `UserConfig` |
| <a id="property-viteconfigfile"></a> `viteConfigFile?` | `string` \| `boolean` |

## Type Aliases

### CmykConvertFunction

> **CmykConvertFunction** = (`rgb`) => [`CMYKValue`](#cmykvalue) \| `null` \| `Promise`\<[`CMYKValue`](#cmykvalue) \| `null`\>

Converts an unmapped RGB color on a 0-10000 scale to CMYK, or returns `null`
to leave it unmapped.

#### Parameters

##### rgb

###### b

`number`

###### g

`number`

###### r

`number`

#### Returns

[`CMYKValue`](#cmykvalue) \| `null` \| `Promise`\<[`CMYKValue`](#cmykvalue) \| `null`\>

***

### ImageConversionReplacement

> **ImageConversionReplacement** = `Readonly`\<`v.InferInput`\<*typeof* `ImageConversionReplacementSchema`\>\>

***

### Metadata

> **Metadata** = `object`

Metadata from Frontmatter.

#### Properties

##### base?

> `optional` **base?**: `Attribute`[]

Attributes of `<base>`.

##### body?

> `optional` **body?**: `Attribute`[]

Attributes of `<body>`.

##### class?

> `optional` **class?**: `string`

Value of `<html class="...">`.

##### custom?

> `optional` **custom?**: `object`

A set of key-value pairs that are specified in `readMetadata` not to be processed as `<meta>`.
The data types converted from Frontmatter's YAML are retained.
Use this if want to add custom metadata with a third party tool.

###### Index Signature

\[`key`: `string`\]: `any`

##### dir?

> `optional` **dir?**: `string`

Value of `<html dir="...">`. e.g. `ltr`, `rtl`, `auto`.

##### head?

> `optional` **head?**: `string`

`<head>...</head>`, reserved for future use.

##### html?

> `optional` **html?**: `Attribute`[]

Attributes of `<html>`.
The `id`,` lang`, `dir`, and` class` specified in the root take precedence over the value of this property.

##### id?

> `optional` **id?**: `string`

Value of `<html id="...">`.

##### lang?

> `optional` **lang?**: `string`

Value of `<html lang="...">`.

##### link?

> `optional` **link?**: `Attribute`[][]

Attribute collection of `<link>`.

##### meta?

> `optional` **meta?**: `Attribute`[][]

Attribute collection of `<meta>`.

##### script?

> `optional` **script?**: `Attribute`[][]

Attribute collection of `<script>`.

##### style?

> `optional` **style?**: `string`

`<style>...</style>`, reserved for future use.

##### title?

> `optional` **title?**: `string`

Value of `<title>...</title>`.

##### vfm?

> `optional` **vfm?**: `VFMSettings`

VFM settings.

***

### ReplaceFunction

> **ReplaceFunction** = (`context`) => `mupdfType.Image` \| `null` \| `Promise`\<`mupdfType.Image` \| `null`\>

Returns an owned replacement image, transferring its ownership to
Vivliostyle CLI, or `null` to decline the current match and continue to the
next replacement candidate. The returned image must be created with the
supplied `mupdf` module and must not be used or destroyed after it is
returned. The current `image` may be returned directly to use it as the
replacement.

#### Parameters

##### context

[`ReplaceFunctionContext`](#replacefunctioncontext)

#### Returns

`mupdfType.Image` \| `null` \| `Promise`\<`mupdfType.Image` \| `null`\>

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

> `optional` **sections?**: [`StructuredDocumentSection`](#structureddocumentsection)[]

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

> `optional` **href?**: `string`

##### id?

> `optional` **id?**: `string`

##### level

> **level**: `number`

***

### TocCompose

> **TocCompose** = (`{ h }`) => (`{
  heading,
  content,
}`) => `ElementContent`[]

#### Parameters

##### \{ h \}

###### h

`h`

#### Returns

(`{
  heading,
  content,
}`) => `ElementContent`[]

***

### VivliostyleConfigSchema

> **VivliostyleConfigSchema** = `BuildTask`[] \| `BuildTask`

#### See

https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md

***

### VivliostylePackageMetadata

> **VivliostylePackageMetadata** = `SchemaWithPipe`\<readonly \[`Omit`\<`ObjectSchema`\<\{ `template`: `SchemaWithPipe`\<readonly \[`RecordSchema`\<`SchemaWithPipe`\<readonly \[..., ..., ...\]\>, `ObjectSchema`\<\{ `description`: ...; `name`: ...; `prompt`: ...; `source`: ...; \}, `undefined`\>, `undefined`\>, `TitleAction`\<\{\[`key`: `string`\]: `object`; \}, `"VivliostyleTemplateMetadata"`\>\]\>; `theme`: `SchemaWithPipe`\<readonly \[`ObjectSchema`\<\{ `author`: `SchemaWithPipe`\<...\>; `category`: `SchemaWithPipe`\<...\>; `name`: `SchemaWithPipe`\<...\>; `style`: `SchemaWithPipe`\<...\>; `topics`: `SchemaWithPipe`\<...\>; \}, `undefined`\>, `TitleAction`\<\{ `author?`: ... \| ...; `category?`: ... \| ...; `name?`: ... \| ...; `style?`: ... \| ...; `topics?`: ... \| ...; \}, `"VivliostyleThemeMetadata"`\>\]\>; \}, `undefined`\>, `"entries"` \| `"~types"` \| `"~run"` \| `"~standard"`\> & `object`, `TitleAction`\<\{ `template?`: \{\[`key`: `string`\]: `object`; \}; `theme?`: \{ `author?`: `string`; `category?`: `string`; `name?`: `string`; `style?`: `string`; `topics?`: `string`[]; \}; \}, `"VivliostylePackageMetadata"`\>\]\>

***

### VivliostylePackageMetadata

> **VivliostylePackageMetadata** = `v.InferInput`\<*typeof* [`VivliostylePackageMetadata`](#vivliostylepackagemetadata)\>

## Variables

### readMetadata

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
