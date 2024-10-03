[**@vivliostyle/cli**](../README.md) • **Docs**

***

[@vivliostyle/cli](../globals.md) / build

# Function: build()

> **build**(`cliFlags`): `Promise`\<`void`\>

Build publication file(s) from the given configuration.

```ts
import { build } from '@vivliostyle/cli';
build({
  configPath: './vivliostyle.config.js',
  logLevel: 'silent',
});
```

## Parameters

• **cliFlags**: [`BuildCliFlags`](../interfaces/BuildCliFlags.md)

## Returns

`Promise`\<`void`\>

## Defined in

[src/build.ts:75](https://github.com/vivliostyle/vivliostyle-savepdf/blob/2a28cf527bdb70b5c2c3aa9c32dc6540578a48a8/src/build.ts#L75)
