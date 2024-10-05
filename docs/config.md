# Config Reference

The configuration files `vivliostyle.config.js` and `vivliostyle.config.json` accept the [`VivliostyleConfigSchema`](#vivliostyleconfigschema) for configuring the Vivliostyle CLI. You can also refer to the type schema of the configuration from TypeScript files.

```ts
import { VivliostyleConfigSchema } from '@vivliostyle/cli';
```

## Config API

<!-- START config API -->
### VivliostyleConfigSchema

#### Type definition

```ts
type VivliostyleConfigSchema =
  | VivliostyleConfigEntry[]
  | VivliostyleConfigEntry;
```

### VivliostyleConfigEntry

#### Properties

- `VivliostyleConfigEntry`
  - `entry` (Array | Object | string)
    - Entry file(s) of document.
  - `title` string
    - Title
  - `author` string
    - Author
  - `theme` (Array | Object | string)
    - Theme package path(s) or URL(s) of css file.
  - `entryContext` string
    - Directory of referencing entry file(s).
  - `output` (Array | Object | string)
    - Options about outputs.
  - `workspaceDir` string
    - Specify the directory where the intermediate files (manuscript HTMLs, publication.json, etc.) are saved.
      If not specified, theses files are saved in the same directory as the input file.
  - ~~`includeAssets`~~ _Deprecated_
    - Use `copyAsset.includes` instead
  - `copyAsset` Object
    - Options about asset files to be copied when exporting output.
  - `size` string
    - Output pdf size. (default: `letter`)
      - preset: `A5`, `A4`, `A3`, `B5`, `B4`, `JIS-B5`, `JIS-B4`, `letter`, `legal`, `ledger`
      - custom(comma separated): `182mm,257mm` or `8.5in,11in`
  - `pressReady` boolean
    - Make generated PDF compatible with press ready PDF/X-1a. (default: `false`)
      This option is equivalent with `"preflight": "press-ready"`
  - `language` string
    - Language
  - `readingProgression` ("ltr" | "rtl")
    - Specify the reading progression of the document. This is typically determined automatically by the CSS writing-mode, so use this option only if you need to set it explicitly.
  - `toc` (Object | boolean | string)
    - Options about Table of Contents (ToC) documents.
  - ~~`tocTitle`~~ _Deprecated_
    - Use `toc.title` instead
  - `cover` (Object | string)
    - Options about cover images and cover page documents.
  - `timeout` number
    - Timeout limit for waiting Vivliostyle process (ms). (default: `120000`)
  - `documentProcessor` Function
    - Custom function to provide unified Processor from markdown into html
  - `vfm` Object
    - Option for convert Markdown to a stringify (HTML).
  - `image` string
    - Specify a docker image to render.
  - `http` boolean
    - Launch an HTTP server hosting contents instead of file protocol.
      It is useful that requires CORS such as external web fonts.
  - `viewer` string
    - Specify a URL of displaying viewer instead of vivliostyle-cli's one.
      It is useful that using own viewer that has staging features. (ex: `https://vivliostyle.vercel.app/`)
  - `viewerParam` string
    - specify viewer parameters. (ex: `allowScripts=false&pixelRatio=16`)
  - `browser` ("chromium" | "firefox" | "webkit")
    - EXPERIMENTAL SUPPORT: Specify a browser type to launch Vivliostyle viewer.
      Currently, Firefox and Webkit support preview command only!

#### Type definition

```ts
type VivliostyleConfigEntry = {
  entry:
    | (
        | string
        | ContentsEntryObject
        | CoverEntryObject
        | ArticleEntryObject
      )[]
    | ArticleEntryObject
    | string;
  title?: string;
  author?: string;
  theme?:
    | (ThemeObject | string)[]
    | ThemeObject
    | string;
  entryContext?: string;
  output?:
    | (OutputObject | string)[]
    | OutputObject
    | string;
  workspaceDir?: string;
  includeAssets?: string[] | string;
  copyAsset?: {
    includes?: string[];
    excludes?: string[];
    includeFileExtensions?: string[];
    excludeFileExtensions?: string[];
  };
  size?: string;
  pressReady?: boolean;
  language?: string;
  readingProgression?: "ltr" | "rtl";
  toc?:
    | {
        title?: string;
        htmlPath?: string;
        sectionDepth?: number;
        transformDocumentList?: (
          nodeList: StructuredDocument[],
        ) => (
          propsList: {
            children: any;
          }[],
        ) => any;
        transformSectionList?: (
          nodeList: StructuredDocumentSection[],
        ) => (
          propsList: {
            children: any;
          }[],
        ) => any;
      }
    | boolean
    | string;
  tocTitle?: string;
  cover?:
    | {
        src: string;
        name?: string;
        htmlPath?: string | boolean;
      }
    | string;
  timeout?: number;
  documentProcessor?: (
    option: import("@vivliostyle/vfm").StringifyMarkdownOptions,
    metadata: import("@vivliostyle/vfm").Metadata,
  ) => import("unified").Processor;
  vfm?: {
    style?: string[] | string;
    partial?: boolean;
    title?: string;
    language?: string;
    replace?: {
      test: RegExp;
      match: (
        result: RegExpMatchArray,
        h: any,
      ) => Object | string;
    }[];
    hardLineBreaks?: boolean;
    disableFormatHtml?: boolean;
    math?: boolean;
  };
  image?: string;
  http?: boolean;
  viewer?: string;
  viewerParam?: string;
  browser?:
    | "chromium"
    | "firefox"
    | "webkit";
};
```

### ContentsEntryObject

#### Properties

- `ContentsEntryObject`
  - `rel` "contents"
  - `path` string
  - `output` string
  - `title` string
  - `theme` (Array | Object | string)
  - `pageBreakBefore` ("left" | "right" | "recto" | "verso")
    - Specify the page break position before this document.
      It is useful when you want to specify which side a first page of the document should be placed on a two-page spread.
  - `pageCounterReset` number
    - Reset the starting page number of this document by the specified integer.
      It is useful when you want to control page numbers when including a page.

#### Type definition

```ts
type ContentsEntryObject = {
  rel: "contents";
  path?: string;
  output?: string;
  title?: string;
  theme?:
    | (ThemeObject | string)[]
    | ThemeObject
    | string;
  pageBreakBefore?:
    | "left"
    | "right"
    | "recto"
    | "verso";
  pageCounterReset?: number;
};
```

### ThemeObject

#### Properties

- `ThemeObject`
  - `specifier` string
    - Specifier name of importing theme package or a path of CSS file.
      - A npm-style package argument is allowed (ex: `@vivliostyle/theme-academic@1` `./local-pkg`)
      - A URL or a local path of CSS is allowed (ex: `./style.css`, `https://example.com/style.css`)
  - `import` (Array | string)
    - Importing CSS path(s) of the package.
      Specify this if you want to import other than the default file.

#### Type definition

```ts
type ThemeObject = {
  specifier: string;
  import?: string[] | string;
};
```

### CoverEntryObject

#### Properties

- `CoverEntryObject`
  - `rel` "cover"
  - `path` string
  - `output` string
  - `title` string
  - `theme` (Array | Object | string)
  - `imageSrc` string
  - `imageAlt` string
  - `pageBreakBefore` ("left" | "right" | "recto" | "verso")
    - Specify the page break position before this document.
      It is useful when you want to specify which side a first page of the document should be placed on a two-page spread.

#### Type definition

```ts
type CoverEntryObject = {
  rel: "cover";
  path?: string;
  output?: string;
  title?: string;
  theme?:
    | (ThemeObject | string)[]
    | ThemeObject
    | string;
  imageSrc?: string;
  imageAlt?: string;
  pageBreakBefore?:
    | "left"
    | "right"
    | "recto"
    | "verso";
};
```

### ArticleEntryObject

#### Properties

- `ArticleEntryObject`
  - `path` string
  - `output` string
  - `title` string
  - `theme` (Array | Object | string)
  - `encodingFormat` string
  - `rel` (Array | string)

#### Type definition

```ts
type ArticleEntryObject = {
  path: string;
  output?: string;
  title?: string;
  theme?:
    | (ThemeObject | string)[]
    | ThemeObject
    | string;
  encodingFormat?: string;
  rel?: string[] | string;
};
```

### OutputObject

#### Properties

- `OutputObject`
  - `path` string
    - Specify output file name or directory [`<title>.pdf`].
  - `format` string
    - Specify output format.
  - `renderMode` ("local" | "docker")
    - if `docker` is set, Vivliostyle try to render PDF on Docker container [`local`].
  - `preflight` ("press-ready" | "press-ready-local")
    - Apply the process to generate PDF for printing.
  - `preflightOption` Array
    - Options for preflight process (ex: `gray-scale`, `enforce-outline`).
      Please refer the document of press-ready for further information. https://github.com/vibranthq/press-ready

#### Type definition

```ts
type OutputObject = {
  path: string;
  format?: string;
  renderMode?: "local" | "docker";
  preflight?:
    | "press-ready"
    | "press-ready-local";
  preflightOption?: string[];
};
```

### StructuredDocument

#### Properties

- `StructuredDocument`
  - `title` string
  - `href` string
  - `children` Array
  - `sections` Array

#### Type definition

```ts
type StructuredDocument = {
  title: string;
  href: string;
  children: StructuredDocument[];
  sections?: StructuredDocumentSection[];
};
```

### StructuredDocumentSection

#### Properties

- `StructuredDocumentSection`
  - `headingHtml` string
  - `headingText` string
  - `level` number
  - `children` Array
  - `href` string
  - `id` string

#### Type definition

```ts
type StructuredDocumentSection = {
  headingHtml: string;
  headingText: string;
  level: number;
  children: StructuredDocumentSection[];
  href?: string;
  id?: string;
};
```
<!-- END config API -->
