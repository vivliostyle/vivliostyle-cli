# JavaScript API

<!-- START JavaScript API -->
## Exported members

### Functions

- [`build`](#build)
- [`builtinCmykConversion`](#builtincmykconversion)
- [`builtinCmykReplacement`](#builtincmykreplacement)
- [`builtinGrayConversion`](#builtingrayconversion)
- [`builtinGrayReplacement`](#builtingrayreplacement)
- [`create`](#create)
- [`createVitePlugin`](#createviteplugin)
- [`defineConfig`](#defineconfig)
- [`iccConversion`](#iccconversion)
- [`iccReplacement`](#iccreplacement)
- [`preview`](#preview)
- [`VFM`](#vfm)

### Interfaces

- [`ImageContext`](#imagecontext)
- [`StringifyMarkdownOptions`](#stringifymarkdownoptions)
- [`TemplateVariable`](#templatevariable)

### Type Aliases

- [`CmykConvertFunction`](#cmykconvertfunction)
- [`Metadata`](#metadata)
- [`ReplaceFunction`](#replacefunction)
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

`boolean` \| \{ `ifUnmappedColorsFound?`: `"warn"` \| `"error"` \| `"ignore"`; `ifUnreplacedImagesFound?`: `"warn"` \| `"error"` \| `"ignore"`; `mapOutput?`: `string`; `overrideMap?`: (((`rgb`) => \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \} \| `Promise`\<\{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\>) \| \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\])[]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

### builtinCmykConversion()

> **builtinCmykConversion**(): [`CmykConvertFunction`](#cmykconvertfunction)

Returns a CmykConvertFunction for cmyk.overrideMap that converts RGB colors
to CMYK using mupdf's DeviceCMYK color space.

#### Returns

[`CmykConvertFunction`](#cmykconvertfunction)

***

### builtinCmykReplacement()

> **builtinCmykReplacement**(): [`ReplaceFunction`](#replacefunction)

Returns a ReplaceFunction that converts RGB images to CMYK
using mupdf's DeviceCMYK color space.

#### Returns

[`ReplaceFunction`](#replacefunction)

***

### builtinGrayConversion()

> **builtinGrayConversion**(): [`CmykConvertFunction`](#cmykconvertfunction)

Returns a CmykConvertFunction for cmyk.overrideMap that converts RGB colors
to grayscale, mapped to the K channel.

#### Returns

[`CmykConvertFunction`](#cmykconvertfunction)

***

### builtinGrayReplacement()

> **builtinGrayReplacement**(): [`ReplaceFunction`](#replacefunction)

Returns a ReplaceFunction that converts RGB images to grayscale
using mupdf's DeviceGray color space.

#### Returns

[`ReplaceFunction`](#replacefunction)

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

`boolean` \| \{ `ifUnmappedColorsFound?`: `"warn"` \| `"error"` \| `"ignore"`; `ifUnreplacedImagesFound?`: `"warn"` \| `"error"` \| `"ignore"`; `mapOutput?`: `string`; `overrideMap?`: (((`rgb`) => \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \} \| `Promise`\<\{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\>) \| \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\])[]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

`boolean` \| \{ `ifUnmappedColorsFound?`: `"warn"` \| `"error"` \| `"ignore"`; `ifUnreplacedImagesFound?`: `"warn"` \| `"error"` \| `"ignore"`; `mapOutput?`: `string`; `overrideMap?`: (((`rgb`) => \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \} \| `Promise`\<\{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\>) \| \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\])[]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

### iccConversion()

> **iccConversion**(`outputProfile`): [`CmykConvertFunction`](#cmykconvertfunction)

Returns a CmykConvertFunction for cmyk.overrideMap that converts RGB colors
through the given ICC profile. The profile alone determines the conversion;
the profile data is passed to mupdf without inspection. Profiles whose data
color space is CMYK yield full CMYK values, and grayscale profiles are
mapped to the K channel.

#### Parameters

##### outputProfile

`Uint8Array`

#### Returns

[`CmykConvertFunction`](#cmykconvertfunction)

***

### iccReplacement()

> **iccReplacement**(`outputProfile`): [`ReplaceFunction`](#replacefunction)

Returns a ReplaceFunction that converts RGB images to the color space
of the given ICC profile. The profile alone determines the output color
space; the profile data is passed to mupdf without inspection.
The conversion applies to pixel values only. The replaced image is stored
with mupdf's default profile for the resulting color space, not with the
given profile.

#### Parameters

##### outputProfile

`Uint8Array`

#### Returns

[`ReplaceFunction`](#replacefunction)

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

`boolean` \| \{ `ifUnmappedColorsFound?`: `"warn"` \| `"error"` \| `"ignore"`; `ifUnreplacedImagesFound?`: `"warn"` \| `"error"` \| `"ignore"`; `mapOutput?`: `string`; `overrideMap?`: (((`rgb`) => \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \} \| `Promise`\<\{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\>) \| \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\])[]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

### ImageContext

Access to the image being replaced. Only valid while the ReplaceFunction
invocation is running; do not retain it beyond the callback.

#### Methods

##### asPNG()

> **asPNG**(): `Uint8Array`

###### Returns

`Uint8Array`

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
| <a id="property-cmyk"></a> `cmyk?` | `boolean` \| \{ `ifUnmappedColorsFound?`: `"warn"` \| `"error"` \| `"ignore"`; `ifUnreplacedImagesFound?`: `"warn"` \| `"error"` \| `"ignore"`; `mapOutput?`: `string`; `overrideMap?`: (((`rgb`) => \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \} \| `Promise`\<\{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\>) \| \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\])[]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} |
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
| <a id="property-image"></a> `image?` | `string` |
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

> **CmykConvertFunction** = (`rgb`) => `CMYKValue` \| `Promise`\<`CMYKValue`\>

#### Parameters

##### rgb

###### b

`number`

###### g

`number`

###### r

`number`

#### Returns

`CMYKValue` \| `Promise`\<`CMYKValue`\>

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

> **ReplaceFunction** = (`image`) => `Uint8Array` \| `Promise`\<`Uint8Array`\>

#### Parameters

##### image

[`ImageContext`](#imagecontext)

#### Returns

`Uint8Array` \| `Promise`\<`Uint8Array`\>

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
