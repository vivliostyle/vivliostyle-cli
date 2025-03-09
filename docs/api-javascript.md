# JavaScript API

<!-- START JavaScript API -->
## Exported members

### Functions

- [`build`](#build)
- [`createVitePlugin`](#createviteplugin)
- [`init`](#init)
- [`preview`](#preview)
- [`vsBrowserPlugin`](#vsbrowserplugin)
- [`vsDevServerPlugin`](#vsdevserverplugin)
- [`vsStaticServePlugin`](#vsstaticserveplugin)
- [`vsViewerPlugin`](#vsviewerplugin)

### Type Aliases

- [`StructuredDocument`](#structureddocument)
- [`StructuredDocumentSection`](#structureddocumentsection)
- [`VivliostyleConfigSchema`](#vivliostyleconfigschema)

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

• **options**

• **options.author?**: `string` = `...`

• **options.bleed?**: `string` = `...`

• **options.browser?**: `"chromium"` \| `"firefox"` \| `"webkit"` = `...`

• **options.config?**: `string` = `...`

• **options.configData?**: `null` \| `object` & `object` \| `object` & `object`[] = `...`

• **options.cropMarks?**: `boolean` = `...`

• **options.cropOffset?**: `string` = `...`

• **options.css?**: `string` = `...`

• **options.cwd?**: `string` = `...`

• **options.enableStaticServe?**: `boolean` = `...`

• **options.enableViewerStartPage?**: `boolean` = `...`

• **options.executableBrowser?**: `string` = `...`

• **options.host?**: `string` \| `boolean` = `...`

• **options.ignoreHttpsErrors?**: `boolean` = `...`

• **options.image?**: `string` = `...`

• **options.input?**: `string` = `...`

• **options.language?**: `string` = `...`

• **options.logger?**: `LoggerInterface` = `...`

• **options.logLevel?**: `"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

• **options.openViewer?**: `boolean` = `...`

• **options.output?**: `string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

• **options.port?**: `number` = `...`

• **options.preflight?**: `"press-ready"` \| `"press-ready-local"` = `...`

• **options.preflightOption?**: `string` \| `string`[] = `...`

• **options.pressReady?**: `boolean` = `...`

• **options.proxyBypass?**: `string` = `...`

• **options.proxyPass?**: `string` = `...`

• **options.proxyServer?**: `string` = `...`

• **options.proxyUser?**: `string` = `...`

• **options.quick?**: `boolean` = `...`

• **options.readingProgression?**: `"ltr"` \| `"rtl"` = `...`

• **options.renderMode?**: `"local"` \| `"docker"` = `...`

• **options.sandbox?**: `boolean` = `...`

• **options.singleDoc?**: `boolean` = `...`

• **options.size?**: `string` = `...`

• **options.style?**: `string` = `...`

• **options.theme?**: `string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

• **options.timeout?**: `number` = `...`

• **options.title?**: `string` = `...`

• **options.userStyle?**: `string` = `...`

• **options.viewer?**: `string` = `...`

• **options.viewerParam?**: `string` = `...`

• **options.vite?**: `UserConfig` = `...`

• **options.viteConfigFile?**: `string` \| `boolean` = `...`

#### Returns

`Promise`\<`void`\>

***

### createVitePlugin()

> **createVitePlugin**(`inlineConfig`): `Promise`\<`vite.Plugin`[]\>

#### Parameters

• **inlineConfig** = `{}`

• **inlineConfig.author?**: `string` = `...`

• **inlineConfig.bleed?**: `string` = `...`

• **inlineConfig.browser?**: `"chromium"` \| `"firefox"` \| `"webkit"` = `...`

• **inlineConfig.config?**: `string` = `...`

• **inlineConfig.configData?**: `null` \| `object` & `object` \| `object` & `object`[] = `...`

• **inlineConfig.cropMarks?**: `boolean` = `...`

• **inlineConfig.cropOffset?**: `string` = `...`

• **inlineConfig.css?**: `string` = `...`

• **inlineConfig.cwd?**: `string` = `...`

• **inlineConfig.enableStaticServe?**: `boolean` = `...`

• **inlineConfig.enableViewerStartPage?**: `boolean` = `...`

• **inlineConfig.executableBrowser?**: `string` = `...`

• **inlineConfig.host?**: `string` \| `boolean` = `...`

• **inlineConfig.ignoreHttpsErrors?**: `boolean` = `...`

• **inlineConfig.image?**: `string` = `...`

• **inlineConfig.input?**: `string` = `...`

• **inlineConfig.language?**: `string` = `...`

• **inlineConfig.logger?**: `LoggerInterface` = `...`

• **inlineConfig.logLevel?**: `"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

• **inlineConfig.openViewer?**: `boolean` = `...`

• **inlineConfig.output?**: `string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

• **inlineConfig.port?**: `number` = `...`

• **inlineConfig.preflight?**: `"press-ready"` \| `"press-ready-local"` = `...`

• **inlineConfig.preflightOption?**: `string` \| `string`[] = `...`

• **inlineConfig.pressReady?**: `boolean` = `...`

• **inlineConfig.proxyBypass?**: `string` = `...`

• **inlineConfig.proxyPass?**: `string` = `...`

• **inlineConfig.proxyServer?**: `string` = `...`

• **inlineConfig.proxyUser?**: `string` = `...`

• **inlineConfig.quick?**: `boolean` = `...`

• **inlineConfig.readingProgression?**: `"ltr"` \| `"rtl"` = `...`

• **inlineConfig.renderMode?**: `"local"` \| `"docker"` = `...`

• **inlineConfig.sandbox?**: `boolean` = `...`

• **inlineConfig.singleDoc?**: `boolean` = `...`

• **inlineConfig.size?**: `string` = `...`

• **inlineConfig.style?**: `string` = `...`

• **inlineConfig.theme?**: `string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

• **inlineConfig.timeout?**: `number` = `...`

• **inlineConfig.title?**: `string` = `...`

• **inlineConfig.userStyle?**: `string` = `...`

• **inlineConfig.viewer?**: `string` = `...`

• **inlineConfig.viewerParam?**: `string` = `...`

• **inlineConfig.vite?**: `UserConfig` = `...`

• **inlineConfig.viteConfigFile?**: `string` \| `boolean` = `...`

#### Returns

`Promise`\<`vite.Plugin`[]\>

***

### init()

> **init**(`options`): `Promise`\<`void`\>

Initialize a new vivliostyle.config.js file.

#### Parameters

• **options**

• **options.author?**: `string` = `...`

• **options.bleed?**: `string` = `...`

• **options.browser?**: `"chromium"` \| `"firefox"` \| `"webkit"` = `...`

• **options.config?**: `string` = `...`

• **options.configData?**: `null` \| `object` & `object` \| `object` & `object`[] = `...`

• **options.cropMarks?**: `boolean` = `...`

• **options.cropOffset?**: `string` = `...`

• **options.css?**: `string` = `...`

• **options.cwd?**: `string` = `...`

• **options.enableStaticServe?**: `boolean` = `...`

• **options.enableViewerStartPage?**: `boolean` = `...`

• **options.executableBrowser?**: `string` = `...`

• **options.host?**: `string` \| `boolean` = `...`

• **options.ignoreHttpsErrors?**: `boolean` = `...`

• **options.image?**: `string` = `...`

• **options.input?**: `string` = `...`

• **options.language?**: `string` = `...`

• **options.logger?**: `LoggerInterface` = `...`

• **options.logLevel?**: `"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

• **options.openViewer?**: `boolean` = `...`

• **options.output?**: `string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

• **options.port?**: `number` = `...`

• **options.preflight?**: `"press-ready"` \| `"press-ready-local"` = `...`

• **options.preflightOption?**: `string` \| `string`[] = `...`

• **options.pressReady?**: `boolean` = `...`

• **options.proxyBypass?**: `string` = `...`

• **options.proxyPass?**: `string` = `...`

• **options.proxyServer?**: `string` = `...`

• **options.proxyUser?**: `string` = `...`

• **options.quick?**: `boolean` = `...`

• **options.readingProgression?**: `"ltr"` \| `"rtl"` = `...`

• **options.renderMode?**: `"local"` \| `"docker"` = `...`

• **options.sandbox?**: `boolean` = `...`

• **options.singleDoc?**: `boolean` = `...`

• **options.size?**: `string` = `...`

• **options.style?**: `string` = `...`

• **options.theme?**: `string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

• **options.timeout?**: `number` = `...`

• **options.title?**: `string` = `...`

• **options.userStyle?**: `string` = `...`

• **options.viewer?**: `string` = `...`

• **options.viewerParam?**: `string` = `...`

• **options.vite?**: `UserConfig` = `...`

• **options.viteConfigFile?**: `string` \| `boolean` = `...`

#### Returns

`Promise`\<`void`\>

***

### preview()

> **preview**(`options`): `Promise`\<`ViteDevServer`\>

Open a browser for previewing the publication.

#### Parameters

• **options**

• **options.author?**: `string` = `...`

• **options.bleed?**: `string` = `...`

• **options.browser?**: `"chromium"` \| `"firefox"` \| `"webkit"` = `...`

• **options.config?**: `string` = `...`

• **options.configData?**: `null` \| `object` & `object` \| `object` & `object`[] = `...`

• **options.cropMarks?**: `boolean` = `...`

• **options.cropOffset?**: `string` = `...`

• **options.css?**: `string` = `...`

• **options.cwd?**: `string` = `...`

• **options.enableStaticServe?**: `boolean` = `...`

• **options.enableViewerStartPage?**: `boolean` = `...`

• **options.executableBrowser?**: `string` = `...`

• **options.host?**: `string` \| `boolean` = `...`

• **options.ignoreHttpsErrors?**: `boolean` = `...`

• **options.image?**: `string` = `...`

• **options.input?**: `string` = `...`

• **options.language?**: `string` = `...`

• **options.logger?**: `LoggerInterface` = `...`

• **options.logLevel?**: `"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

• **options.openViewer?**: `boolean` = `...`

• **options.output?**: `string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

• **options.port?**: `number` = `...`

• **options.preflight?**: `"press-ready"` \| `"press-ready-local"` = `...`

• **options.preflightOption?**: `string` \| `string`[] = `...`

• **options.pressReady?**: `boolean` = `...`

• **options.proxyBypass?**: `string` = `...`

• **options.proxyPass?**: `string` = `...`

• **options.proxyServer?**: `string` = `...`

• **options.proxyUser?**: `string` = `...`

• **options.quick?**: `boolean` = `...`

• **options.readingProgression?**: `"ltr"` \| `"rtl"` = `...`

• **options.renderMode?**: `"local"` \| `"docker"` = `...`

• **options.sandbox?**: `boolean` = `...`

• **options.singleDoc?**: `boolean` = `...`

• **options.size?**: `string` = `...`

• **options.style?**: `string` = `...`

• **options.theme?**: `string` \| `object` & `object` \| (`string` \| `object` & `object`)[] = `...`

• **options.timeout?**: `number` = `...`

• **options.title?**: `string` = `...`

• **options.userStyle?**: `string` = `...`

• **options.viewer?**: `string` = `...`

• **options.viewerParam?**: `string` = `...`

• **options.vite?**: `UserConfig` = `...`

• **options.viteConfigFile?**: `string` \| `boolean` = `...`

#### Returns

`Promise`\<`ViteDevServer`\>

***

### vsBrowserPlugin()

> **vsBrowserPlugin**(`__namedParameters`): `vite.Plugin`

#### Parameters

• **\_\_namedParameters**

• **\_\_namedParameters.config**: `ResolvedTaskConfig`

• **\_\_namedParameters.inlineConfig**

• **\_\_namedParameters.inlineConfig.author?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.bleed?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.browser?**: `"chromium"` \| `"firefox"` \| `"webkit"` = `...`

• **\_\_namedParameters.inlineConfig.config?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.configData?**: `null` \| `object` & `object` \| `object` & `object`[] = `...`

• **\_\_namedParameters.inlineConfig.cropMarks?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.cropOffset?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.css?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.cwd?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.enableStaticServe?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.enableViewerStartPage?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.executableBrowser?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.host?**: `string` \| `boolean` = `...`

• **\_\_namedParameters.inlineConfig.ignoreHttpsErrors?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.image?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.input?** = `...`

• **\_\_namedParameters.inlineConfig.input.entry**: `string`

• **\_\_namedParameters.inlineConfig.input.format**: `InputFormat`

• **\_\_namedParameters.inlineConfig.language?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.logger?**: `LoggerInterface` = `...`

• **\_\_namedParameters.inlineConfig.logLevel?**: `"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

• **\_\_namedParameters.inlineConfig.openViewer?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.output?**: `object` & `object` & `object`[] = `...`

• **\_\_namedParameters.inlineConfig.port?**: `number` = `...`

• **\_\_namedParameters.inlineConfig.preflight?**: `"press-ready"` \| `"press-ready-local"` = `...`

• **\_\_namedParameters.inlineConfig.preflightOption?**: `string`[] = `...`

• **\_\_namedParameters.inlineConfig.pressReady?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.proxyBypass?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.proxyPass?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.proxyServer?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.proxyUser?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.quick?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.readingProgression?**: `"ltr"` \| `"rtl"` = `...`

• **\_\_namedParameters.inlineConfig.renderMode?**: `"local"` \| `"docker"` = `...`

• **\_\_namedParameters.inlineConfig.sandbox?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.singleDoc?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.size?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.style?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.theme?**: `object` & `object`[] = `...`

• **\_\_namedParameters.inlineConfig.timeout?**: `number` = `...`

• **\_\_namedParameters.inlineConfig.title?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.userStyle?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.viewer?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.viewerParam?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.vite?**: `UserConfig` = `...`

• **\_\_namedParameters.inlineConfig.viteConfigFile?**: `string` \| `boolean` = `...`

#### Returns

`vite.Plugin`

***

### vsDevServerPlugin()

> **vsDevServerPlugin**(`__namedParameters`): `vite.Plugin`

#### Parameters

• **\_\_namedParameters**

• **\_\_namedParameters.config**: `ResolvedTaskConfig`

• **\_\_namedParameters.inlineConfig**

• **\_\_namedParameters.inlineConfig.author?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.bleed?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.browser?**: `"chromium"` \| `"firefox"` \| `"webkit"` = `...`

• **\_\_namedParameters.inlineConfig.config?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.configData?**: `null` \| `object` & `object` \| `object` & `object`[] = `...`

• **\_\_namedParameters.inlineConfig.cropMarks?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.cropOffset?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.css?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.cwd?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.enableStaticServe?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.enableViewerStartPage?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.executableBrowser?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.host?**: `string` \| `boolean` = `...`

• **\_\_namedParameters.inlineConfig.ignoreHttpsErrors?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.image?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.input?** = `...`

• **\_\_namedParameters.inlineConfig.input.entry**: `string`

• **\_\_namedParameters.inlineConfig.input.format**: `InputFormat`

• **\_\_namedParameters.inlineConfig.language?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.logger?**: `LoggerInterface` = `...`

• **\_\_namedParameters.inlineConfig.logLevel?**: `"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

• **\_\_namedParameters.inlineConfig.openViewer?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.output?**: `object` & `object` & `object`[] = `...`

• **\_\_namedParameters.inlineConfig.port?**: `number` = `...`

• **\_\_namedParameters.inlineConfig.preflight?**: `"press-ready"` \| `"press-ready-local"` = `...`

• **\_\_namedParameters.inlineConfig.preflightOption?**: `string`[] = `...`

• **\_\_namedParameters.inlineConfig.pressReady?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.proxyBypass?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.proxyPass?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.proxyServer?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.proxyUser?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.quick?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.readingProgression?**: `"ltr"` \| `"rtl"` = `...`

• **\_\_namedParameters.inlineConfig.renderMode?**: `"local"` \| `"docker"` = `...`

• **\_\_namedParameters.inlineConfig.sandbox?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.singleDoc?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.size?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.style?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.theme?**: `object` & `object`[] = `...`

• **\_\_namedParameters.inlineConfig.timeout?**: `number` = `...`

• **\_\_namedParameters.inlineConfig.title?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.userStyle?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.viewer?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.viewerParam?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.vite?**: `UserConfig` = `...`

• **\_\_namedParameters.inlineConfig.viteConfigFile?**: `string` \| `boolean` = `...`

#### Returns

`vite.Plugin`

***

### vsStaticServePlugin()

> **vsStaticServePlugin**(`__namedParameters`): `vite.Plugin`

#### Parameters

• **\_\_namedParameters**

• **\_\_namedParameters.config**: `ResolvedTaskConfig`

• **\_\_namedParameters.inlineConfig**

• **\_\_namedParameters.inlineConfig.author?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.bleed?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.browser?**: `"chromium"` \| `"firefox"` \| `"webkit"` = `...`

• **\_\_namedParameters.inlineConfig.config?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.configData?**: `null` \| `object` & `object` \| `object` & `object`[] = `...`

• **\_\_namedParameters.inlineConfig.cropMarks?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.cropOffset?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.css?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.cwd?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.enableStaticServe?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.enableViewerStartPage?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.executableBrowser?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.host?**: `string` \| `boolean` = `...`

• **\_\_namedParameters.inlineConfig.ignoreHttpsErrors?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.image?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.input?** = `...`

• **\_\_namedParameters.inlineConfig.input.entry**: `string`

• **\_\_namedParameters.inlineConfig.input.format**: `InputFormat`

• **\_\_namedParameters.inlineConfig.language?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.logger?**: `LoggerInterface` = `...`

• **\_\_namedParameters.inlineConfig.logLevel?**: `"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

• **\_\_namedParameters.inlineConfig.openViewer?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.output?**: `object` & `object` & `object`[] = `...`

• **\_\_namedParameters.inlineConfig.port?**: `number` = `...`

• **\_\_namedParameters.inlineConfig.preflight?**: `"press-ready"` \| `"press-ready-local"` = `...`

• **\_\_namedParameters.inlineConfig.preflightOption?**: `string`[] = `...`

• **\_\_namedParameters.inlineConfig.pressReady?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.proxyBypass?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.proxyPass?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.proxyServer?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.proxyUser?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.quick?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.readingProgression?**: `"ltr"` \| `"rtl"` = `...`

• **\_\_namedParameters.inlineConfig.renderMode?**: `"local"` \| `"docker"` = `...`

• **\_\_namedParameters.inlineConfig.sandbox?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.singleDoc?**: `boolean` = `...`

• **\_\_namedParameters.inlineConfig.size?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.style?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.theme?**: `object` & `object`[] = `...`

• **\_\_namedParameters.inlineConfig.timeout?**: `number` = `...`

• **\_\_namedParameters.inlineConfig.title?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.userStyle?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.viewer?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.viewerParam?**: `string` = `...`

• **\_\_namedParameters.inlineConfig.vite?**: `UserConfig` = `...`

• **\_\_namedParameters.inlineConfig.viteConfigFile?**: `string` \| `boolean` = `...`

#### Returns

`vite.Plugin`

***

### vsViewerPlugin()

> **vsViewerPlugin**(`_`?): `vite.Plugin`

#### Parameters

• **\_?**

• **\_.config?**: `ResolvedTaskConfig`

• **\_.inlineConfig?**

• **\_.inlineConfig.author?**: `string` = `...`

• **\_.inlineConfig.bleed?**: `string` = `...`

• **\_.inlineConfig.browser?**: `"chromium"` \| `"firefox"` \| `"webkit"` = `...`

• **\_.inlineConfig.config?**: `string` = `...`

• **\_.inlineConfig.configData?**: `null` \| `object` & `object` \| `object` & `object`[] = `...`

• **\_.inlineConfig.cropMarks?**: `boolean` = `...`

• **\_.inlineConfig.cropOffset?**: `string` = `...`

• **\_.inlineConfig.css?**: `string` = `...`

• **\_.inlineConfig.cwd?**: `string` = `...`

• **\_.inlineConfig.enableStaticServe?**: `boolean` = `...`

• **\_.inlineConfig.enableViewerStartPage?**: `boolean` = `...`

• **\_.inlineConfig.executableBrowser?**: `string` = `...`

• **\_.inlineConfig.host?**: `string` \| `boolean` = `...`

• **\_.inlineConfig.ignoreHttpsErrors?**: `boolean` = `...`

• **\_.inlineConfig.image?**: `string` = `...`

• **\_.inlineConfig.input?** = `...`

• **\_.inlineConfig.input.entry?**: `string`

• **\_.inlineConfig.input.format?**: `InputFormat`

• **\_.inlineConfig.language?**: `string` = `...`

• **\_.inlineConfig.logger?**: `LoggerInterface` = `...`

• **\_.inlineConfig.logLevel?**: `"info"` \| `"silent"` \| `"verbose"` \| `"debug"` = `...`

• **\_.inlineConfig.openViewer?**: `boolean` = `...`

• **\_.inlineConfig.output?**: `object` & `object` & `object`[] = `...`

• **\_.inlineConfig.port?**: `number` = `...`

• **\_.inlineConfig.preflight?**: `"press-ready"` \| `"press-ready-local"` = `...`

• **\_.inlineConfig.preflightOption?**: `string`[] = `...`

• **\_.inlineConfig.pressReady?**: `boolean` = `...`

• **\_.inlineConfig.proxyBypass?**: `string` = `...`

• **\_.inlineConfig.proxyPass?**: `string` = `...`

• **\_.inlineConfig.proxyServer?**: `string` = `...`

• **\_.inlineConfig.proxyUser?**: `string` = `...`

• **\_.inlineConfig.quick?**: `boolean` = `...`

• **\_.inlineConfig.readingProgression?**: `"ltr"` \| `"rtl"` = `...`

• **\_.inlineConfig.renderMode?**: `"local"` \| `"docker"` = `...`

• **\_.inlineConfig.sandbox?**: `boolean` = `...`

• **\_.inlineConfig.singleDoc?**: `boolean` = `...`

• **\_.inlineConfig.size?**: `string` = `...`

• **\_.inlineConfig.style?**: `string` = `...`

• **\_.inlineConfig.theme?**: `object` & `object`[] = `...`

• **\_.inlineConfig.timeout?**: `number` = `...`

• **\_.inlineConfig.title?**: `string` = `...`

• **\_.inlineConfig.userStyle?**: `string` = `...`

• **\_.inlineConfig.viewer?**: `string` = `...`

• **\_.inlineConfig.viewerParam?**: `string` = `...`

• **\_.inlineConfig.vite?**: `UserConfig` = `...`

• **\_.inlineConfig.viteConfigFile?**: `string` \| `boolean` = `...`

#### Returns

`vite.Plugin`

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
