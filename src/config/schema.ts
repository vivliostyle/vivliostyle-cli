import type { Metadata, StringifyMarkdownOptions } from '@vivliostyle/vfm';
import { satisfies as semverSatisfies } from 'semver';
import type { Processor } from 'unified';
import upath from 'upath';
import * as v from 'valibot';
import { cliVersion, CONTAINER_URL } from '../const.js';
import type { LoggerInterface } from '../logger.js';

const $ = (strings: TemplateStringsArray, ...values: any[]) => {
  const lines = String.raw({ raw: strings }, ...values).split('\n');
  const indent = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/)?.[0].length ?? 0)
    .reduce((min, len) => Math.min(min, len), Infinity);
  return lines
    .map((line) => line.slice(indent))
    .join('\n')
    .trim();
};

/**
 * @see https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md
 */
export type StructuredDocument = {
  title: string;
  href: string;
  children: StructuredDocument[];
  sections?: StructuredDocumentSection[];
};
/** @hidden */
export const StructuredDocument: v.GenericSchema<StructuredDocument> = v.pipe(
  v.object({
    title: v.string(),
    href: v.string(),
    children: v.array(v.lazy(() => StructuredDocument)),
    sections: v.optional(v.array(v.lazy(() => StructuredDocumentSection))),
  }),
  v.title('StructuredDocument'),
);

/**
 * @see https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md
 */
export type StructuredDocumentSection = {
  headingHtml: string;
  headingText: string;
  level: number;
  children: StructuredDocumentSection[];
  href?: string;
  id?: string;
};
/** @hidden */
export const StructuredDocumentSection: v.GenericSchema<StructuredDocumentSection> =
  v.pipe(
    v.object({
      headingHtml: v.string(),
      headingText: v.string(),
      level: v.number(),
      children: v.array(v.lazy(() => StructuredDocumentSection)),
      href: v.optional(v.string()),
      id: v.optional(v.string()),
    }),
    v.title('StructuredDocumentSection'),
  );

export const ValidString = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, 'At least one character is required'),
);

export const DocumentProcessorSchema = v.pipe(
  v.function() as v.GenericSchema<
    (option: StringifyMarkdownOptions, metadata: Metadata) => Processor
  >,
  v.metadata({
    typeString:
      '(option: import("@vivliostyle/vfm").StringifyMarkdownOptions, metadata: import("@vivliostyle/vfm").Metadata) => import("unified").Processor',
  }),
  v.description($`
    Custom function to provide a unified Processor for converting the source document to HTML.
  `),
);

export const DocumentMetadataReaderSchema = v.pipe(
  v.function() as v.GenericSchema<(content: string) => Metadata>,
  v.metadata({
    typeString: '(content: string) => import("@vivliostyle/vfm").Metadata',
  }),
  v.description($`
    Custom function to extract metadata from the source document content.
  `),
);

export const ThemeConfig = v.pipe(
  v.intersect([
    v.required(
      v.object({
        specifier: v.pipe(
          ValidString,
          v.description($`
          The specifier name for importing the theme package or the path to a CSS file.
          - An npm-style package argument is allowed (e.g., \`@vivliostyle/theme-academic@1\`, \`./local-pkg\`).
          - A URL or a local path to a CSS file is allowed (e.g., \`./style.css\`, \`https://example.com/style.css\`).
        `),
        ),
      }),
      'Missing required field: specifier',
    ),
    v.partial(
      v.object({
        import: v.pipe(
          v.union([v.array(ValidString), ValidString]),
          v.transform((input) => [input].flat()),
          v.description($`
          The path(s) to the CSS file(s) to import from the package.
          Specify this if you want to import files other than the default.
        `),
        ),
      }),
    ),
  ]),
  v.title('ThemeConfig'),
);
export type ThemeConfig = v.InferInput<typeof ThemeConfig>;

export const ThemeSpecifier = v.pipe(
  v.union([
    v.array(v.union([ThemeConfig, ValidString])),
    ThemeConfig,
    ValidString,
  ]),
  v.transform((input) =>
    [input]
      .flat()
      .map((item) => (typeof item === 'string' ? { specifier: item } : item)),
  ),
);
export type ThemeSpecifier = v.InferInput<typeof ThemeSpecifier>;

export const ArticleEntryConfig = v.pipe(
  v.required(
    v.object({
      path: ValidString,
      output: v.optional(ValidString),
      title: v.optional(ValidString),
      theme: v.optional(ThemeSpecifier),
      encodingFormat: v.optional(ValidString),
      rel: v.optional(
        v.pipe(
          v.union([v.array(ValidString), ValidString]),
          v.transform((input) => [input].flat()),
        ),
      ),
      documentProcessor: v.optional(DocumentProcessorSchema),
      documentMetadataReader: v.optional(DocumentMetadataReaderSchema),
    }),
    ['path'],
    'Missing required field: path',
  ),
  v.title('ArticleEntryConfig'),
);
export type ArticleEntryConfig = v.InferInput<typeof ArticleEntryConfig>;

const PageBreak = v.union([
  v.literal('left'),
  v.literal('right'),
  v.literal('recto'),
  v.literal('verso'),
]);

export const ContentsEntryConfig = v.pipe(
  v.object({
    rel: v.literal('contents'),
    path: v.optional(ValidString),
    output: v.optional(ValidString),
    title: v.optional(ValidString),
    theme: v.optional(ThemeSpecifier),
    pageBreakBefore: v.pipe(
      v.optional(PageBreak),
      v.description($`
        Specifies the page break position before this document.
        Useful for determining which side the first page of the document should be placed on in a two-page spread.
      `),
    ),
    pageCounterReset: v.pipe(
      v.optional(v.pipe(v.number(), v.safeInteger())),
      v.description($`
        Resets the starting page number of this document to the specified integer.
        Useful for controlling page numbers when including a page.
      `),
    ),
  }),
  v.title('ContentsEntryConfig'),
);
export type ContentsEntryConfig = v.InferInput<typeof ContentsEntryConfig>;

export const CoverEntryConfig = v.pipe(
  v.object({
    rel: v.literal('cover'),
    path: v.optional(ValidString),
    output: v.optional(ValidString),
    title: v.optional(ValidString),
    theme: v.optional(ThemeSpecifier),
    imageSrc: v.optional(ValidString),
    imageAlt: v.optional(v.string()), // Allow empty string
    pageBreakBefore: v.pipe(
      v.optional(PageBreak),
      v.description($`
        Specifies the page break position before this document.
        Useful for determining which side the first page of the document should be placed on in a two-page spread.
      `),
    ),
  }),
  v.title('CoverEntryConfig'),
);
export type CoverEntryConfig = v.InferInput<typeof CoverEntryConfig>;

export const EntryConfig = v.union([
  ContentsEntryConfig,
  CoverEntryConfig,
  ArticleEntryConfig,
]);
export type EntryConfig = v.InferInput<typeof EntryConfig>;

export const OutputFormat = v.union([
  v.literal('pdf'),
  v.literal('epub'),
  v.literal('webpub'),
]);
export type OutputFormat = v.InferInput<typeof OutputFormat>;

export const RenderMode = v.union([v.literal('local'), v.literal('docker')]);
export type RenderMode = v.InferInput<typeof RenderMode>;

const RGBValueSchema = v.pipe(
  v.object({
    r: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
    g: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
    b: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
  }),
  v.title('RGBValue'),
);

const CMYKValueSchema = v.pipe(
  v.object({
    c: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
    m: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
    y: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
    k: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
  }),
  v.title('CMYKValue'),
);

const CmykOverrideEntrySchema = v.tuple([RGBValueSchema, CMYKValueSchema]);

const CmykConfigSchema = v.pipe(
  v.partial(
    v.object({
      overrideMap: v.pipe(
        v.array(CmykOverrideEntrySchema),
        v.description($`
          Custom RGB to CMYK color mapping.
          Each entry is a tuple of [{r, g, b}, {c, m, y, k}] where values are integers (0-10000).
        `),
      ),
      warnUnmapped: v.pipe(
        v.boolean(),
        v.description($`
          Warn when RGB colors not mapped to CMYK are encountered. (default: true)
        `),
      ),
      mapOutput: v.pipe(
        ValidString,
        v.description($`
          Output the CMYK color map to a JSON file at the specified path.
        `),
      ),
    }),
  ),
  v.title('CmykConfig'),
);

const CmykSchema = v.pipe(
  v.union([v.boolean(), CmykConfigSchema]),
  v.description($`
    Convert device-cmyk() colors to CMYK in the output PDF.
    Can be a boolean or a config object with overrideMap and warnUnmapped options.
  `),
);

const ReplaceImageEntrySchema = v.pipe(
  v.object({
    source: v.pipe(
      v.union([ValidString, v.instance(RegExp)]),
      v.description(
        'Path to the source image file, or a RegExp pattern to match multiple files.',
      ),
    ),
    replacement: v.pipe(
      ValidString,
      v.description(
        'Path to the replacement image file. When source is a RegExp, supports $1, $2, etc. for captured groups.',
      ),
    ),
  }),
  v.title('ReplaceImageEntry'),
);

const ReplaceImageSchema = v.pipe(
  v.array(ReplaceImageEntrySchema),
  v.description($`
    Replace images in the output PDF.
    Each entry specifies a source image path and its replacement image path.
    Useful for replacing RGB images with CMYK versions.
  `),
);

const PdfPostprocessConfigSchema = v.pipe(
  v.partial(
    v.object({
      pressReady: v.pipe(
        v.boolean(),
        v.description($`
          Generate a press-ready PDF compatible with PDF/X-1a. (default: \`false\`)
          This option is equivalent to setting \`"preflight": "press-ready"\`.
        `),
      ),
      preflight: v.pipe(
        v.union([v.literal('press-ready'), v.literal('press-ready-local')]),
        v.description($`
          Apply the process to generate a print-ready PDF.
        `),
      ),
      preflightOption: v.pipe(
        v.array(ValidString),
        v.description($`
          Options for the preflight process (e.g., \`gray-scale\`, \`enforce-outline\`).
          Refer to the press-ready documentation for more information: [press-ready](https://github.com/vibranthq/press-ready)
        `),
      ),
      cmyk: CmykSchema,
      replaceImage: ReplaceImageSchema,
    }),
  ),
  v.title('PdfPostprocessConfig'),
  v.description($`
    PDF post-processing options.
    When both pdfPostprocess and legacy options (pressReady, preflight, etc.) are specified,
    pdfPostprocess takes precedence.
  `),
);
export type PdfPostprocessConfig = v.InferInput<
  typeof PdfPostprocessConfigSchema
>;

export const OutputConfig = v.pipe(
  v.intersect([
    v.required(
      v.object({
        path: v.pipe(
          ValidString,
          v.description($`
            Specifies the output file name or directory. (default: \`<title>.pdf\`)
          `),
        ),
      }),
      'Missing required field: path',
    ),
    v.partial(
      v.object({
        format: v.pipe(
          OutputFormat,
          v.description($`
            Specifies the output format.
          `),
        ),
        renderMode: v.pipe(
          RenderMode,
          v.description($`
            If set to \`docker\`, Vivliostyle will render the PDF using a Docker container. (default: \`local\`)
          `),
        ),
        preflight: v.pipe(
          v.union([v.literal('press-ready'), v.literal('press-ready-local')]),
          v.description($`
            Apply the process to generate a print-ready PDF.
          `),
        ),
        preflightOption: v.pipe(
          v.array(ValidString),
          v.description($`
            Options for the preflight process (e.g., \`gray-scale\`, \`enforce-outline\`).
            Refer to the press-ready documentation for more information: [press-ready](https://github.com/vibranthq/press-ready)
          `),
        ),
        pdfPostprocess: PdfPostprocessConfigSchema,
      }),
    ),
  ]),
  v.title('OutputConfig'),
);
export type OutputConfig = v.InferInput<typeof OutputConfig>;

// Use v.looseObject to allow unknown keys in future VFM versions
export const VfmReplaceRule = v.looseObject({
  test: v.instance(RegExp),
  match: v.pipe(
    v.function() as v.GenericSchema<
      (result: RegExpMatchArray, h: any) => Object | string
    >,
    // https://github.com/fabian-hiller/valibot/issues/243
    v.metadata({
      typeString: '(result: RegExpMatchArray, h: any) => Object | string',
    }),
  ),
});
export type VfmReplaceRule = v.InferInput<typeof VfmReplaceRule>;

export const BrowserType = v.union([
  v.literal('chrome'),
  v.literal('chromium'),
  v.literal('firefox'),
]);
export type BrowserType = v.InferInput<typeof BrowserType>;

export const ReadingProgression = v.union([v.literal('ltr'), v.literal('rtl')]);
export type ReadingProgression = v.InferInput<typeof ReadingProgression>;

export const LogLevel = v.union([
  v.literal('silent'),
  v.literal('info'),
  v.literal('verbose'),
  v.literal('debug'),
]);
export type LogLevel = v.InferInput<typeof LogLevel>;

const notAllowedPatternRe = /(^\s*[/\\]|^(.*[/\\])?\s*\.\.\s*([/\\].*)?$)/g;
const validateAssetPatternSettings = (propName: string) =>
  v.check<string[], string>(
    (input) => input.every((pattern) => !notAllowedPatternRe.test(pattern)),
    `Invalid pattern was found in copyAsset.${propName} option`,
  );

// See the special characters of glob pattern
// https://github.com/micromatch/picomatch
const notAllowedExtensionRe = /([\\/*?@+!|(){}[\]]|\.\.|^\s*\.)/g;
const validateAssetExtensionSettings = (propName: string) =>
  v.check<string[], string>(
    (input) => input.every((pattern) => !notAllowedExtensionRe.test(pattern)),
    `Invalid pattern was found in copyAsset.${propName} option`,
  );

const validateBrowserTagFormat = v.check<string, string>((input) => {
  const [type] = input.split('@');
  return v.is(BrowserType, type);
}, 'Unknown browser type');
const parseBrowserTagFormat = v.transform<
  string,
  { type: BrowserType; tag?: string }
>((input) => {
  const [type, tag] = input.split('@');
  return { type: v.parse(BrowserType, type), tag };
});

export const CopyAssetConfig = v.pipe(
  v.partial(
    v.object({
      includes: v.pipe(
        v.array(ValidString),
        validateAssetPatternSettings('includes'),
        v.description($`
          Directories and files to include as asset files. Supports wildcard characters for glob patterns.
        `),
      ),
      excludes: v.pipe(
        v.array(ValidString),
        validateAssetPatternSettings('excludes'),
        v.description($`
          Directories and files to exclude from asset files. Supports wildcard characters for glob patterns.
        `),
      ),
      includeFileExtensions: v.pipe(
        v.array(ValidString),
        validateAssetExtensionSettings('includeFileExtensions'),
        v.description($`
          File extensions to include as asset files. (default: \`[css, css.map, png, jpg, jpeg, svg, gif, webp, apng, ttf, otf, woff, woff2]\`)
        `),
      ),
      excludeFileExtensions: v.pipe(
        v.array(ValidString),
        validateAssetExtensionSettings('excludeFileExtensions'),
        v.description($`
          File extensions to exclude from asset files.
        `),
      ),
    }),
  ),
  v.title('CopyAssetConfig'),
);
export type CopyAssetConfig = v.InferInput<typeof CopyAssetConfig>;

export const TocConfig = v.pipe(
  v.partial(
    v.object({
      title: v.pipe(
        ValidString,
        v.description($`
          Title of the generated ToC document.
        `),
      ),
      htmlPath: v.pipe(
        ValidString,
        v.description($`
          Location where the generated ToC document will be saved. (default: \`index.html\`)
        `),
      ),
      sectionDepth: v.pipe(
        v.number(),
        v.integer(),
        v.minValue(0),
        v.maxValue(6),
        v.description($`
          Depth of sections to include in the ToC document. (default: \`0\`)
        `),
      ),
      transformDocumentList: v.pipe(
        v.function() as v.GenericSchema<
          (
            nodeList: StructuredDocument[],
          ) => (propsList: { children: any }[]) => any
        >,
        v.metadata({
          typeString:
            '(nodeList: StructuredDocument[]) => (propsList: { children: any }[]) => any',
          typeReferences: [StructuredDocument],
        }),
        v.description($`
          Function to transform the document list.
        `),
      ),
      transformSectionList: v.pipe(
        v.function() as v.GenericSchema<
          (
            nodeList: StructuredDocumentSection[],
          ) => (propsList: { children: any }[]) => any
        >,
        v.metadata({
          typeString:
            '(nodeList: StructuredDocumentSection[]) => (propsList: { children: any }[]) => any',
          typeReferences: [StructuredDocumentSection],
        }),
        v.description($`
          Function to transform the section list.
        `),
      ),
    }),
  ),
  v.title('TocConfig'),
);
export type TocConfig = v.InferInput<typeof TocConfig>;

export const CoverConfig = v.pipe(
  v.intersect([
    v.required(
      v.object({
        src: v.pipe(
          ValidString,
          v.description($`
            Path to the cover image for the cover page.
          `),
        ),
      }),
      'Missing required field: src',
    ),
    v.partial(
      v.object({
        name: v.pipe(
          v.string(), // Allow empty string
          v.description($`
            Alternative text for the cover image.
          `),
        ),
        htmlPath: v.pipe(
          v.union([ValidString, v.boolean()]),
          v.description($`
            Path where the generated cover document will be saved. (default: \`cover.html\`)
            If set to a falsy value, the cover document will not be generated.
          `),
        ),
      }),
    ),
  ]),
  v.title('CoverConfig'),
);
export type CoverConfig = v.InferInput<typeof CoverConfig>;

const VfmConfig = v.pipe(
  v.partial(
    // Use v.looseObject to allow unknown keys in future VFM versions
    v.looseObject({
      style: v.pipe(
        v.union([v.array(ValidString), ValidString]),

        v.transform((input) => [input].flat()),
        v.description($`
          Path(s) or URL(s) to custom stylesheets.
        `),
      ),
      partial: v.pipe(
        v.boolean(),
        v.description($`
          Output markdown fragments instead of a full document.
        `),
      ),
      title: v.pipe(
        ValidString,
        v.description($`
          Title of the document (ignored in partial mode).
        `),
      ),
      language: v.pipe(
        ValidString,
        v.description($`
          Language of the document (ignored in partial mode).
        `),
      ),
      replace: v.pipe(
        v.array(VfmReplaceRule),
        v.description($`
          Handlers for replacing matched HTML strings.
        `),
      ),
      hardLineBreaks: v.pipe(
        v.boolean(),
        v.description($`
          Insert \`<br>\` tags at hard line breaks without requiring spaces.
        `),
      ),
      disableFormatHtml: v.pipe(
        v.boolean(),
        v.description($`
          Disable automatic HTML formatting.
        `),
      ),
      math: v.pipe(
        v.boolean(),
        v.description($`
          Enable support for math syntax.
        `),
      ),
    }),
  ),
  v.title('VfmConfig'),
);
export type VfmConfig = v.InferInput<typeof VfmConfig>;

export const ServerConfig = v.pipe(
  v.partial(
    v.object({
      host: v.pipe(
        v.union([v.boolean(), ValidString]),
        v.description($`
          IP address the server should listen on.
          Set to \`true\` to listen on all addresses.
          (default: \`true\` if a PDF build with Docker render mode is required, otherwise \`false\`)
        `),
      ),
      port: v.pipe(
        v.number(),
        v.minValue(0),
        v.maxValue(65535),
        v.description($`
          Port the server should listen on. (default: \`13000\`)
        `),
      ),
      proxy: v.pipe(
        v.record(
          ValidString,
          v.union([
            v.pipe(
              v.custom<import('vite').ProxyOptions>((value) =>
                Boolean(value && typeof value === 'object'),
              ),
              v.metadata({
                typeString: 'import("vite").ProxyOptions',
              }),
            ),
            ValidString,
          ]),
        ),
        v.description($`
          Custom proxy rules for the Vivliostyle preview server.
        `),
      ),
      allowedHosts: v.pipe(
        v.union([v.array(ValidString), v.boolean()]),
        v.description($`
          The hostnames that are allowed to respond to.
          Set to \`true\` to allow all hostnames.
          See [\`server.allowedHosts\` option of Vite](https://vite.dev/config/server-options.html#server-allowedhosts) for more details.
        `),
      ),
    }),
  ),
  v.title('ServerConfig'),
);
export type ServerConfig = v.InferInput<typeof ServerConfig>;

export const BuildTask = v.pipe(
  v.intersect([
    v.required(
      v.object({
        entry: v.pipe(
          v.union([
            v.pipe(
              v.array(v.union([ValidString, EntryConfig])),
              v.minLength(1, 'At least one entry is required'),
            ),
            ArticleEntryConfig,
            ValidString,
          ]),
          v.transform((input) =>
            [input]
              .flat()
              .map((item) =>
                typeof item === 'string' ? { path: item } : item,
              ),
          ),
          v.description($`
            Entry file(s) of the document.
          `),
        ),
      }),
      'Missing required field: entry',
    ),
    v.partial(
      v.object({
        title: v.pipe(
          ValidString,
          v.description($`
            Title of the document.
          `),
        ),
        author: v.pipe(
          ValidString,
          v.description($`
            Author of the document.
          `),
        ),
        theme: v.pipe(
          ThemeSpecifier,
          v.description($`
            Theme package path(s) or URL(s) of the CSS file.
          `),
        ),
        entryContext: v.pipe(
          ValidString,
          v.description($`
            Directory containing the referenced entry file(s).
          `),
        ),
        output: v.pipe(
          v.union([
            v.array(v.union([OutputConfig, ValidString])),
            OutputConfig,
            ValidString,
          ]),
          v.transform((input): (OutputConfig & { format: OutputFormat })[] =>
            [input].flat().map((item) => {
              const obj = typeof item === 'string' ? { path: item } : item;
              const ext = upath.extname(obj.path).toLowerCase();
              return {
                ...obj,
                format:
                  obj.format ||
                  (ext === '.pdf'
                    ? 'pdf'
                    : ext === '.epub'
                      ? 'epub'
                      : 'webpub'),
              };
            }),
          ),
          v.description($`
            Output options.
          `),
        ),
        workspaceDir: v.pipe(
          ValidString,
          v.description($`
            Directory where intermediate files (e.g., manuscript HTMLs, publication.json) are saved. (default: \`.vivliostyle\`)
          `),
        ),
        /** @deprecated */
        includeAssets: v.pipe(
          v.union([v.array(ValidString), ValidString]),
          v.transform((input) => [input].flat()),
          v.metadata({ deprecated: true }),
          v.description($`
            Use \`copyAsset.includes\` instead.
          `),
        ),
        copyAsset: v.pipe(
          v.union([CopyAssetConfig]),
          v.description($`
            Options for asset files to be copied when exporting output.
          `),
        ),
        size: v.pipe(
          ValidString,
          v.description($`
            PDF output size. (default: \`letter\`)
            - Preset: \`A5\`, \`A4\`, \`A3\`, \`B5\`, \`B4\`, \`JIS-B5\`, \`JIS-B4\`, \`letter\`, \`legal\`, \`ledger\`
            - Custom (comma-separated): \`182mm,257mm\` or \`8.5in,11in\`
          `),
        ),
        pressReady: v.pipe(
          v.boolean(),
          v.description($`
            Generate a press-ready PDF compatible with PDF/X-1a. (default: \`false\`)
            This option is equivalent to setting \`"preflight": "press-ready"\`.
          `),
        ),
        pdfPostprocess: PdfPostprocessConfigSchema,
        language: v.pipe(
          ValidString,
          v.description($`
            Language of the document.
          `),
        ),
        readingProgression: v.pipe(
          ReadingProgression,
          v.description($`
            Specifies the reading progression of the document.
            This is typically determined automatically by the CSS writing-mode.
            Use this option only if explicit configuration is needed.
          `),
        ),
        toc: v.pipe(
          v.union([TocConfig, v.boolean(), ValidString]),
          v.transform((input) =>
            typeof input === 'string'
              ? { htmlPath: input }
              : input === true
                ? {}
                : input || undefined,
          ),
          v.description($`
            Options for Table of Contents (ToC) documents.
          `),
        ),
        /** @deprecated */
        tocTitle: v.pipe(
          ValidString,
          v.metadata({ deprecated: true }),
          v.description($`
            Use \`toc.title\` instead
          `),
        ),
        cover: v.pipe(
          v.union([CoverConfig, ValidString]),
          v.transform((input) =>
            typeof input === 'string' ? { src: input } : input,
          ),
          v.description($`
            Options for cover images and cover page documents.
          `),
        ),
        timeout: v.pipe(
          v.number(),
          v.minValue(0),
          v.description($`
            Timeout limit for waiting for the Vivliostyle process (in ms). (default: \`300000\`)
          `),
        ),
        documentProcessor: DocumentProcessorSchema,
        documentMetadataReader: DocumentMetadataReaderSchema,
        vfm: v.pipe(
          v.union([VfmConfig]),
          v.description($`
            Options for converting Markdown into a stringified format (HTML).
          `),
        ),
        image: v.pipe(
          ValidString,
          v.check((value) => {
            const [url, version] = value.split(':');
            if (url !== CONTAINER_URL || !/^\d+(\.\d+){0,2}$/.test(version)) {
              return true;
            }
            return semverSatisfies(cliVersion, version);
          }, `The specified image is not compatible with the CLI version ${cliVersion}. Please check the image version.`),
          v.description($`
            Docker image used for rendering.
          `),
        ),
        /** @deprecated */
        http: v.pipe(
          v.boolean(),
          v.metadata({ deprecated: true }),
          v.description($`
            This option is enabled by default, and the file protocol is no longer supported.
          `),
        ),
        viewer: v.pipe(
          ValidString,
          v.description($`
            URL of a custom viewer to display content instead of the default Vivliostyle CLI viewer.
            Useful for using a custom viewer with staging features (e.g., \`https://vivliostyle.vercel.app/\`).
          `),
        ),
        viewerParam: v.pipe(
          ValidString,
          v.description($`
            Parameters for the Vivliostyle viewer (e.g., \`allowScripts=false&pixelRatio=16\`).
          `),
        ),
        browser: v.pipe(
          ValidString,
          validateBrowserTagFormat,
          parseBrowserTagFormat,
          v.description($`
            Specify a browser type and version to launch the Vivliostyle viewer.
          `),
        ),
        base: v.pipe(
          ValidString,
          v.regex(/^\//, 'Base path must start with a slash'),
          v.check((value) => value !== '/', 'Base path must not be root'),
          v.transform((value) => value.replace(/(?!^)\/+$/, '')),
          v.description($`
            Base path of the served documents. (default: \`/vivliostyle\`)
          `),
        ),
        server: v.pipe(
          v.union([ServerConfig]),
          v.description($`
            Options for the preview server.
          `),
        ),
        static: v.pipe(
          v.record(
            v.pipe(
              ValidString,
              v.regex(/^\//, 'Base path must start with a slash'),
              v.transform((value) => value.replace(/(?!^)\/+$/, '')),
            ),
            v.pipe(
              v.union([v.array(ValidString), ValidString]),
              v.transform((input) => [input].flat()),
            ),
          ),
          v.description($`
            Specifies static files to be served by the preview server.
            \`\`\`js
            export default {
              static: {
                '/static': 'path/to/static',
                '/': ['root1', 'root2'],
              },
            };
            \`\`\`
          `),
          v.transform((input) => {
            return input;
          }),
        ),
        temporaryFilePrefix: v.pipe(
          ValidString,
          v.description($`
            Prefix for temporary file names.
          `),
        ),
        vite: v.pipe(
          v.custom<import('vite').UserConfig>(() => true),
          v.metadata({
            typeString: 'import("vite").UserConfig',
          }),
          v.description($`
            Configuration options for the Vite server.
          `),
        ),
        viteConfigFile: v.pipe(
          v.union([ValidString, v.boolean()]),
          v.description($`
            Path to the Vite config file.
            If a falsy value is provided, Vivliostyle CLI ignores the existing Vite config file.
          `),
        ),
      }),
    ),
  ]),
  v.title('BuildTask'),
);
export type BuildTask = v.InferInput<typeof BuildTask>;
export type ParsedBuildTask = v.InferOutput<typeof BuildTask>;

/**
 * @see https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md
 */
export type VivliostyleConfigSchema = BuildTask[] | BuildTask;
export type ParsedVivliostyleConfigSchema = {
  tasks: ParsedBuildTask[];
  inlineOptions: InlineOptions;
};
/** @hidden */
export const VivliostyleConfigSchema: v.GenericSchema<
  VivliostyleConfigSchema,
  ParsedVivliostyleConfigSchema
> = v.pipe(
  v.union([
    v.pipe(
      v.array(BuildTask),
      v.minLength(1, 'At least one config entry is required'),
    ),
    BuildTask,
  ]),
  v.transform(
    (input): ParsedVivliostyleConfigSchema => ({
      tasks: [input].flat(),
      inlineOptions: {},
    }),
  ),
  v.title('VivliostyleConfigSchema'),
);

export type InputFormat =
  | 'markdown'
  | 'webbook'
  | 'pub-manifest'
  | 'epub'
  | 'epub-opf';

export const VivliostyleInlineConfigWithoutChecks = v.partial(
  v.object({
    cwd: v.pipe(
      ValidString,
      v.description($`
          Set a working directory.
        `),
    ),
    config: v.pipe(
      ValidString,
      v.description($`
          Path to vivliostyle.config.js.
        `),
    ),
    configData: v.pipe(
      v.custom<VivliostyleConfigSchema | null | undefined>(() => true),
      v.metadata({
        typeString: 'VivliostyleConfigSchema',
      }),
      v.description($`
          Vivliostyle config object.
        `),
    ),
    input: v.pipe(
      ValidString,
      v.transform((input): { format: InputFormat; entry: string } => {
        const ext = upath.extname(input).toLowerCase();
        if (/^(https?|data):/.test(input)) {
          return { format: 'webbook', entry: input };
        } else if (ext === '.md' || ext === '.markdown') {
          return { format: 'markdown', entry: input };
        } else if (ext === '.json' || ext === '.jsonld') {
          return { format: 'pub-manifest', entry: input };
        } else if (ext === '.epub') {
          return { format: 'epub', entry: input };
        } else if (ext === '.opf') {
          return { format: 'epub-opf', entry: input };
        } else if (['.html', '.htm', '.xhtml', '.xht'].includes(ext)) {
          return { format: 'webbook', entry: input };
        }
        throw new Error(`Cannot detect an input format: ${input}`);
      }),
      v.description($`
          Input file of document.
        `),
    ),
    output: v.pipe(
      v.union([
        v.array(v.union([OutputConfig, ValidString])),
        OutputConfig,
        ValidString,
      ]),
      v.transform((input): (OutputConfig & { format: OutputFormat })[] =>
        [input].flat().map((item) => {
          const obj = typeof item === 'string' ? { path: item } : item;
          const ext = upath.extname(obj.path).toLowerCase();
          return {
            ...obj,
            format:
              obj.format ||
              (ext === '.pdf' ? 'pdf' : ext === '.epub' ? 'epub' : 'webpub'),
          };
        }),
      ),
      v.description($`
          Output file name or directory.
        `),
    ),
    theme: v.pipe(
      ThemeSpecifier,
      v.description($`
          Theme path or package name.
        `),
    ),
    size: v.pipe(
      ValidString,
      v.description($`
          Output pdf size.
          preset: A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger
          custom(comma separated): 182mm,257mm or 8.5in,11in
        `),
    ),
    cropMarks: v.pipe(
      v.boolean(),
      v.description($`
          Print crop marks.
        `),
    ),
    bleed: v.pipe(
      ValidString,
      v.description($`
          Extent of the bleed area for printing with crop marks. [3mm]
        `),
    ),
    cropOffset: v.pipe(
      ValidString,
      v.description($`
          Distance between the edge of the trim size and the edge of the media size. [auto (13mm + bleed)]
        `),
    ),
    css: v.pipe(
      ValidString,
      v.description($`
          Custom style CSS code. (ex: ":root {--my-color: lime;}")
        `),
    ),
    style: v.pipe(
      ValidString,
      v.description($`
          Additional stylesheet URL or path.
        `),
    ),
    userStyle: v.pipe(
      ValidString,
      v.description($`
          User stylesheet URL or path.
        `),
    ),
    singleDoc: v.pipe(
      v.boolean(),
      v.description($`
          Single HTML document input.
        `),
    ),
    quick: v.pipe(
      v.boolean(),
      v.description($`
          Quick loading with rough page count.
        `),
    ),
    pressReady: v.pipe(
      v.boolean(),
      v.description($`
          Make generated PDF compatible with press ready PDF/X-1a.
          This option is equivalent with "preflight": "press-ready"
        `),
    ),
    title: v.pipe(ValidString, v.description($`Title`)),
    author: v.pipe(ValidString, v.description($`Author`)),
    language: v.pipe(ValidString, v.description($`Language`)),
    readingProgression: v.pipe(
      ReadingProgression,
      v.description($`
          Direction of reading progression.
        `),
    ),
    timeout: v.pipe(
      v.number(),
      v.minValue(0),
      v.description($`
          Timeout limit for waiting Vivliostyle process (ms).
        `),
    ),
    renderMode: v.pipe(
      RenderMode,
      v.description($`
          If docker is set, Vivliostyle try to render PDF on Docker container. [local]
        `),
    ),
    preflight: v.pipe(
      v.union([v.literal('press-ready'), v.literal('press-ready-local')]),
      v.description($`
          Apply the process to generate PDF for printing.
        `),
    ),
    preflightOption: v.pipe(
      v.union([v.array(ValidString), ValidString]),
      v.transform((input) => [input].flat()),
      v.description($`
          Options for preflight process (ex: gray-scale, enforce-outline).
          Please refer the document of press-ready for further information.
        `),
    ),
    cmyk: CmykSchema,
    sandbox: v.pipe(v.boolean(), v.description($`Launch chrome with sandbox.`)),
    executableBrowser: v.pipe(
      ValidString,
      v.description($`
          Specify a path of executable browser you installed.
        `),
    ),
    image: v.pipe(
      ValidString,
      v.description($`
          Specify a docker image to render.
        `),
    ),
    viewer: v.pipe(
      ValidString,
      v.description($`
          Specify a URL of displaying viewer instead of vivliostyle-cli's one.
          It is useful that using own viewer that has staging features. (ex: https://vivliostyle.vercel.app/)
        `),
    ),
    viewerParam: v.pipe(
      ValidString,
      v.description($`
          Specify viewer parameters. (ex: "allowScripts=false&pixelRatio=16")
        `),
    ),
    browser: v.pipe(
      ValidString,
      validateBrowserTagFormat,
      parseBrowserTagFormat,
      v.description($`
          Specify a browser type and version to launch the Vivliostyle viewer. [chrome]
        `),
    ),
    proxyServer: v.pipe(
      ValidString,
      v.description($`
          HTTP/SOCK proxy server url for underlying Playwright.
        `),
    ),
    proxyBypass: v.pipe(
      ValidString,
      v.description($`
          Optional comma-separated domains to bypass proxy.
        `),
    ),
    proxyUser: v.pipe(
      ValidString,
      v.description($`
          Optional username for HTTP proxy authentication.
        `),
    ),
    proxyPass: v.pipe(
      ValidString,
      v.description($`
          Optional password for HTTP proxy authentication.
        `),
    ),
    logLevel: v.pipe(
      LogLevel,
      v.description($`
          Specify a log level of console outputs.
        `),
    ),
    ignoreHttpsErrors: v.pipe(
      v.boolean(),
      v.description($`
          true to ignore HTTPS errors when Playwright browser opens a new page.
        `),
    ),
    openViewer: v.pipe(
      v.boolean(),
      v.description($`
          Open a browser to display the document preview.
        `),
    ),
    enableStaticServe: v.pipe(
      v.boolean(),
      v.description($`
          Enable static file serving as configured in the Vivliostyle config file.
        `),
    ),
    enableViewerStartPage: v.pipe(
      v.boolean(),
      v.description($`
          Open a start page of the viewer when the input file is not specified.
        `),
    ),
    vite: v.pipe(
      v.custom<import('vite').UserConfig>(() => true),
      v.metadata({
        typeString: 'import("vite").UserConfig',
      }),
      v.description($`
          Configuration options for the Vite server.
        `),
    ),
    viteConfigFile: v.pipe(
      v.union([ValidString, v.boolean()]),
      v.description($`
          Path to the Vite config file.
          If a falsy value is provided, Vivliostyle CLI ignores the existing Vite config file.
        `),
    ),
    host: v.pipe(
      v.union([v.boolean(), ValidString]),
      v.description($`
          IP address the server should listen on.
          Set to \`true\` to listen on all addresses.
          (default: \`true\` if a PDF build with Docker render mode is required, otherwise \`false\`)
        `),
    ),
    port: v.pipe(
      v.number(),
      v.minValue(0),
      v.maxValue(65535),
      v.description($`
          Port the server should listen on. (default: \`13000\`)
        `),
    ),
    logger: v.pipe(
      v.custom<LoggerInterface>(() => true),
      v.metadata({
        typeString: 'LoggerInterface',
      }),
      v.description($`
          Custom logger interface.
        `),
    ),
    disableServerStartup: v.pipe(
      v.boolean(),
      v.description($`
          Disable the startup of the preview server during the build process.
        `),
    ),
    projectPath: v.pipe(
      ValidString,
      v.description($`
        Path of the Vivliostyle project to create.
      `),
    ),
    template: v.pipe(
      ValidString,
      v.description($`
        Template source in format of \`[provider]:repo[/subpath][#ref]\`.
      `),
    ),
    createConfigFileOnly: v.pipe(
      v.boolean(),
      v.description($`
        Create a Vivliostyle config file without generating project template files.
      `),
    ),
    stdin: v.pipe(
      v.custom<import('node:stream').Readable>(() => true),
      v.metadata({
        typeString: 'import("node:stream").Readable',
      }),
      v.description($`
        Readable stream for stdin input.
          `),
    ),
    stdout: v.pipe(
      v.custom<import('node:stream').Writable>(() => true),
      v.metadata({
        typeString: 'import("node:stream").Writable',
      }),
      v.description($`
        Writable stream for stdout output.
      `),
    ),
    stderr: v.pipe(
      v.custom<import('node:stream').Writable>(() => true),
      v.metadata({
        typeString: 'import("node:stream").Writable',
      }),
      v.description($`
        Writable stream for stderr output.
      `),
    ),
    signal: v.pipe(
      v.custom<AbortSignal>(() => true),
      v.description($`
        AbortSignal to cancel the operation.
      `),
    ),
  }),
);

export const VivliostyleInlineConfig = v.pipe(
  VivliostyleInlineConfigWithoutChecks,
  v.check(
    (options) =>
      !options.input ||
      !options.output ||
      !['epub', 'epub-opf'].includes(options.input.format) ||
      options.output.every((o) => o.format !== 'webpub'),
    'Exporting webpub format from EPUB or OPF file is not supported.',
  ),
  v.check(
    (options) =>
      !options.input ||
      !options.output ||
      !['epub', 'epub-opf'].includes(options.input.format) ||
      options.output.every((o) => o.format !== 'epub'),
    'Exporting EPUB format from EPUB or OPF file is not supported.',
  ),
  v.title('VivliostyleInlineConfig'),
);

export type VivliostyleInlineConfig = v.InferInput<
  typeof VivliostyleInlineConfig
>;
export type ParsedVivliostyleInlineConfig = v.InferOutput<
  typeof VivliostyleInlineConfig
>;

export type InlineOptions = Pick<
  ParsedVivliostyleInlineConfig,
  | 'cwd'
  | 'config'
  | 'configData'
  | 'input'
  | 'cropMarks'
  | 'bleed'
  | 'cropOffset'
  | 'css'
  | 'style'
  | 'userStyle'
  | 'singleDoc'
  | 'quick'
  | 'sandbox'
  | 'executableBrowser'
  | 'proxyServer'
  | 'proxyBypass'
  | 'proxyUser'
  | 'proxyPass'
  | 'logLevel'
  | 'ignoreHttpsErrors'
  | 'openViewer'
  | 'enableStaticServe'
  | 'enableViewerStartPage'
  | 'logger'
  | 'renderMode'
  | 'preflight'
  | 'preflightOption'
  | 'cmyk'
  | 'disableServerStartup'
  | 'projectPath'
  | 'template'
  | 'createConfigFileOnly'
  | 'stdin'
  | 'stdout'
  | 'stderr'
  | 'signal'
>;

export const VivliostyleThemeMetadata = v.pipe(
  v.object({
    name: v.pipe(
      v.optional(ValidString),
      v.description($`
        Name of the theme.
      `),
    ),
    author: v.pipe(
      v.optional(ValidString),
      v.description($`
        Author of the theme.
      `),
    ),
    style: v.pipe(
      v.optional(ValidString),
      v.description($`
        This property specifies the main CSS file in the theme.
      `),
    ),
    category: v.pipe(
      v.optional(ValidString),
      v.description($`
        This property provides a hint to users about the primary use of your theme when they use it for the first time.
        Choose the category that best fits your theme from the following list:
        - \`"novel"\`
        - \`"magazine"\`
        - \`"journal"\`
        - \`"report"\`
        - \`"misc"\`
      `),
    ),
    topics: v.pipe(
      v.optional(v.array(ValidString)),
      v.description($`
        If you want more specific descriptions of the theme's use than the category property,
        you can list and describe them here.
      `),
    ),
  }),
  v.title('VivliostyleThemeMetadata'),
);

const basePromptOptions = {
  name: ValidString,
  required: v.optional(v.boolean()),
};

const TextPrompt = v.object({
  ...basePromptOptions,
  type: v.literal('text'),
  message: ValidString,
  placeholder: v.optional(ValidString),
  defaultValue: v.optional(ValidString),
  initialValue: v.optional(ValidString),
});

export const SelectPromptOption = v.union([
  ValidString,
  v.object({
    value: v.union([
      v.string(), // Allow empty string
      v.number(),
      v.boolean(),
    ]),
    label: v.optional(ValidString),
    hint: v.optional(ValidString),
  }),
]);
export type SelectPromptOption = v.InferInput<typeof SelectPromptOption>;

const SelectPrompt = v.object({
  ...basePromptOptions,
  type: v.literal('select'),
  message: ValidString,
  options: v.array(SelectPromptOption),
  initialValue: v.optional(v.string()),
});

const MultiSelectPrompt = v.object({
  ...basePromptOptions,
  type: v.literal('multiSelect'),
  message: ValidString,
  options: v.array(SelectPromptOption),
  initialValues: v.optional(v.array(v.string())),
  cursorAt: v.optional(v.string()),
});

const AutocompletePrompt = v.object({
  ...basePromptOptions,
  type: v.literal('autocomplete'),
  message: ValidString,
  options: v.array(SelectPromptOption),
  placeholder: v.optional(ValidString),
  initialValue: v.optional(v.string()),
  initialUserInput: v.optional(ValidString),
});

const AutocompleteMultiSelectOptions = v.object({
  ...basePromptOptions,
  type: v.literal('autocompleteMultiSelect'),
  message: ValidString,
  options: v.array(SelectPromptOption),
  placeholder: v.optional(ValidString),
  initialValues: v.optional(v.array(v.string())),
});

export const PromptOption = v.variant('type', [
  TextPrompt,
  SelectPrompt,
  MultiSelectPrompt,
  AutocompletePrompt,
  AutocompleteMultiSelectOptions,
]);
export type PromptOption = v.InferInput<typeof PromptOption>;

export const VivliostyleTemplateMetadata = v.pipe(
  v.record(
    ValidString,
    v.object({
      name: v.pipe(
        v.optional(ValidString),
        v.description($`
          Name of the template.
        `),
      ),
      description: v.pipe(
        v.optional(ValidString),
        v.description($`
          Description of the template.
        `),
      ),
      source: v.pipe(
        ValidString,
        v.description($`
          Template source in the format of \`[provider]:repo[/subpath][#ref]\` or as a local directory to copy from.
          See the [giget](https://github.com/unjs/giget) documentation for more details of the source format.
        `),
      ),
      prompt: v.pipe(
        v.optional(v.array(PromptOption)),
        v.description($`
          Extra prompt options for the template.
          This is used to prompt users for additional information when applying the template.
          See the [@clack/prompts](https://github.com/bombshell-dev/clack) documentation for more details on the prompt options.
          Available prompt types: \`text\`, \`select\`, \`multiSelect\`, \`autocomplete\`, \`autocompleteMultiSelect\`.
        `),
      ),
    }),
  ),
  v.title('VivliostyleTemplateMetadata'),
);

export const VivliostylePackageMetadata = v.pipe(
  v.partial(
    v.object({
      theme: VivliostyleThemeMetadata,
      template: VivliostyleTemplateMetadata,
    }),
  ),
  v.title('VivliostylePackageMetadata'),
);
export type VivliostylePackageMetadata = v.InferInput<
  typeof VivliostylePackageMetadata
>;
