# JavaScript API

<!-- START JavaScript API -->
## Exported members

### Functions

- [`build`](#build)
- [`create`](#create)
- [`createDefaultWslMirroredRenderMode`](#createdefaultwslmirroredrendermode)
- [`createDefaultWslNatRenderMode`](#createdefaultwslnatrendermode)
- [`createVitePlugin`](#createviteplugin)
- [`createWslPathTransformer`](#createwslpathtransformer)
- [`defineConfig`](#defineconfig)
- [`getWslHostIp`](#getwslhostip)
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

`boolean` \| \{ `mapOutput?`: `string`; `overrideMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

`"docker"` \| \{ `extraRunArgs?`: `string`[] \| readonly `string`[]; `hostGateway?`: `string`; `mode`: `"docker"`; `pathTransformer?`: (`hostPath`) => `string`; \} \| `"local"` \| \{ `mode`: `"local"`; \} = `...`

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

`boolean` \| \{ `mapOutput?`: `string`; `overrideMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

`"docker"` \| \{ `extraRunArgs?`: `string`[] \| readonly `string`[]; `hostGateway?`: `string`; `mode`: `"docker"`; `pathTransformer?`: (`hostPath`) => `string`; \} \| `"local"` \| \{ `mode`: `"local"`; \} = `...`

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

### createDefaultWslMirroredRenderMode()

> **createDefaultWslMirroredRenderMode**(`options`): `object`

Build the conventional default `renderMode` fields (without `mode`) for
the WSL hybrid + mirrored networking case. Spread into a `renderMode`
literal:

```ts
renderMode: { mode: 'docker', ...createDefaultWslMirroredRenderMode() }
```

`options` is forwarded to [createWslPathTransformer](#createwslpathtransformer); pass
`{ automountRoot }` if the target WSL distro has changed `automount.root`
in `/etc/wsl.conf`.

#### Parameters

##### options

`WslPathTransformerOptions` = `{}`

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `extraRunArgs` | readonly \[`"--network=host"`\] |
| `hostGateway` | `"127.0.0.1"` |
| `pathTransformer()` | (`hostPath`) => `string` |

***

### createDefaultWslNatRenderMode()

> **createDefaultWslNatRenderMode**(`options`): `object`

Build the conventional default `renderMode` fields (without `mode`) for
the WSL hybrid + NAT networking case. Spread into a `renderMode` literal:

```ts
renderMode: { mode: 'docker', ...createDefaultWslNatRenderMode() }
```

`options` is forwarded to [createWslPathTransformer](#createwslpathtransformer); pass
`{ automountRoot }` if the target WSL distro has changed `automount.root`
in `/etc/wsl.conf`.

It's a factory so `getWslHostIp()` runs at the call site; the WSL default
gateway can change across VM restarts.

#### Parameters

##### options

`WslPathTransformerOptions` = `{}`

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `hostGateway` | `string` |
| `pathTransformer()` | (`hostPath`) => `string` |

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

`boolean` \| \{ `mapOutput?`: `string`; `overrideMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

`"docker"` \| \{ `extraRunArgs?`: `string`[] \| readonly `string`[]; `hostGateway?`: `string`; `mode`: `"docker"`; `pathTransformer?`: (`hostPath`) => `string`; \} \| `"local"` \| \{ `mode`: `"local"`; \} = `...`

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

### createWslPathTransformer()

> **createWslPathTransformer**(`__namedParameters`): (`hostPath`) => `string`

Build a `renderMode.pathTransformer` that translates Windows drive-letter
absolute paths to their WSL drvfs automount counterpart (default
`/mnt/<drive>/...`). Useful when the docker daemon is upstream moby
running inside a WSL distro.

Example:
```ts
renderMode: {
  mode: 'docker',
  pathTransformer: createWslPathTransformer(),
  // ...
}
```

Contract of the returned transformer:
  The input is expected to be an absolute path produced by `upath.resolve()`
  (the canonical resolver used in `src/config/resolve.ts` for `workspaceDir`,
  `target.path`, etc.). Under that contract the input is one of:
    - POSIX absolute (`/foo/bar`) on Linux/macOS hosts: passed through
    - Drive-letter + forward slash (`C:/Users/foo`) on Windows hosts: translated

  Drive-letter + backslash (`C:\Users\foo`) is handled defensively for paths
  that bypass `upath`. Anything else (relative paths, UNC `\\server\share\...`,
  empty input) violates the contract and throws.

Pass `{ automountRoot }` if the target WSL distro has changed
`automount.root` in `/etc/wsl.conf` (see WslPathTransformerOptions).
Override does not apply to POSIX inputs; those pass through unchanged.

#### Parameters

##### \_\_namedParameters

`WslPathTransformerOptions` = `{}`

#### Returns

> (`hostPath`): `string`

##### Parameters

###### hostPath

`string`

##### Returns

`string`

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

### getWslHostIp()

> **getWslHostIp**(): `string`

Returns the IP at which the Windows host is reachable from inside WSL
(the default gateway of WSL's eth0). Useful as `renderMode.hostGateway`
for the NAT networking mode (the WSL default).

Windows host only. Caller is responsible for gating on `process.platform`.

#### Returns

`string`

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

`boolean` \| \{ `mapOutput?`: `string`; `overrideMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} = `CmykSchema`

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

`"docker"` \| \{ `extraRunArgs?`: `string`[] \| readonly `string`[]; `hostGateway?`: `string`; `mode`: `"docker"`; `pathTransformer?`: (`hostPath`) => `string`; \} \| `"local"` \| \{ `mode`: `"local"`; \} = `...`

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
| <a id="assignidtofigcaption"></a> `assignIdToFigcaption?` | `boolean` |
| <a id="captionlessimagepolicy"></a> `captionlessImagePolicy?` | `"paragraph"` \| `"figure"` \| `"figure-with-figcaption"` |
| <a id="disableformathtml"></a> `disableFormatHtml?` | `boolean` |
| <a id="editplugins"></a> `editPlugins?` | `EditPlugins` |
| <a id="footnote"></a> `footnote?` | `"pandoc"` \| `"dpub"` \| `"gcpm"` \| \{ `mode`: `"pandoc"`; \} \| \{ `body?`: `Properties` \| `DpubBodyFactory`; `call?`: `Properties` \| `DpubCallFactory`; `mode`: `"dpub"`; \} \| \{ `body?`: `Properties` \| `GcpmBodyFactory`; `duplicatedCall?`: `Properties` \| `GcpmDuplicatedCallFactory`; `mode`: `"gcpm"`; \} |
| <a id="hardlinebreaks"></a> `hardLineBreaks?` | `boolean` |
| <a id="imgfigcaptionorder"></a> `imgFigcaptionOrder?` | `"img-figcaption"` \| `"figcaption-img"` |
| <a id="language"></a> `language?` | `string` |
| <a id="math"></a> `math?` | `boolean` |
| <a id="partial"></a> `partial?` | `boolean` |
| <a id="replace"></a> `replace?` | `ReplaceRule`[] |
| <a id="style"></a> `style?` | `string` \| `string`[] |
| <a id="title"></a> `title?` | `string` |

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
| <a id="cmyk"></a> `cmyk?` | `boolean` \| \{ `mapOutput?`: `string`; `overrideMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `reserveMap?`: \[`string` \| \{ `b`: `number`; `g`: `number`; `r`: `number`; \}, \{ `c`: `number`; `k`: `number`; `m`: `number`; `y`: `number`; \}\][]; `warnUnmapped?`: `boolean`; \} |
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
| <a id="rendermode"></a> `renderMode?` | `"docker"` \| \{ `extraRunArgs?`: `string`[] \| readonly `string`[]; `hostGateway?`: `string`; `mode`: `"docker"`; `pathTransformer?`: (`hostPath`) => `string`; \} \| `"local"` \| \{ `mode`: `"local"`; \} |
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
