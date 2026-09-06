import {
  type Metadata,
  type StringifyMarkdownOptions,
  StringifyMarkdownOptionsSchema,
} from '@vivliostyle/vfm';
import type * as mupdfType from 'mupdf';
import { satisfies as semverSatisfies } from 'semver';
import upath from 'upath';
import * as v from 'valibot';

import { CONTAINER_URL } from '../constants.js';
import type { CMYKValue } from '../global-viewer.js';
import type { LoggerInterface } from '../logger.js';
import { cliVersion } from '../util.js';

const $ = (strings: TemplateStringsArray, ...values: unknown[]) => {
  const lines = String.raw({ raw: strings }, ...values).split('\n');
  const indent = lines
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*/v)?.[0].length ?? 0)
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

type HastElement = import('hast').ElementContent | import('hast').Root;
export type HastTransformFunction<T> = (
  nodeList: T[],
) => (propsList: { children: HastElement | HastElement[] }[]) => HastElement;
export type TocCompose = ({ h }: { h: typeof import('hastscript').h }) => ({
  heading,
  content,
}: {
  heading: import('hast').Element & {
    tagName: 'h2';
    children: [import('hast').Text];
  };
  content: import('hast').Element;
}) => import('hast').ElementContent[];

export const ValidString = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, 'At least one character is required'),
);

export const DocumentProcessorSchema = v.pipe(
  v.function() as v.GenericSchema<
    // tsdown cannot bundle old unified Processor type, so we use any here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (option: StringifyMarkdownOptions, metadata: Metadata) => any
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
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
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
    // Allow empty string
    imageAlt: v.optional(v.string()),
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

const RGBValueObjectSchema = v.pipe(
  v.object({
    r: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
    g: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
    b: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
  }),
  v.title('RGBValue'),
);

const HexColorSchema = v.pipe(
  v.string(),
  v.regex(
    /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/v,
    'Must be a hex color (e.g. "#ff0000", "#f00", "#ff000080", "#f008")',
  ),
  v.title('HexColor'),
);

const RGBValueSchema = v.union([RGBValueObjectSchema, HexColorSchema]);

const CMYKValueSchema = v.pipe(
  v.object({
    c: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
    m: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
    y: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
    k: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000)),
  }),
  v.title('CMYKValue'),
);

const CmykMapEntrySchema = v.tuple([RGBValueSchema, CMYKValueSchema]);

export function isValidCMYKValue(
  value: unknown,
): value is v.InferOutput<typeof CMYKValueSchema> {
  return v.is(CMYKValueSchema, value);
}

/**
 * Converts an unmapped RGB color on a 0-10000 scale to CMYK, or returns `null`
 * to leave it unmapped.
 */
export type CmykConvertFunction = (rgb: {
  r: number;
  g: number;
  b: number;
}) => CMYKValue | null | Promise<CMYKValue | null>;

const CmykConvertFunctionSchema = v.pipe(
  v.custom<CmykConvertFunction>((input) => typeof input === 'function'),
  v.metadata({
    typeString: 'import("@vivliostyle/cli").CmykConvertFunction',
  }),
  v.description($`
    Custom conversion applied to RGB colors not covered by the regular mapping.
    RGB and CMYK channel values are integers on a 0-10000 scale.
    Return null to leave the color unmapped.
    Exceptions and invalid return values fail the build.
  `),
);

const CmykConfigSchema = v.pipe(
  v.partial(
    v.object({
      /** @deprecated */
      overrideMap: v.pipe(
        v.array(CmykMapEntrySchema),
        v.metadata({ deprecated: true }),
        v.description($`
          Use fallback instead.
          Each entry is a tuple of [rgb, {c, m, y, k}] that overrides the color mapping.
          RGB can be an object {r, g, b} with integers (0-10000) or a hex color string (e.g. "#ff0000").
        `),
      ),
      fallback: CmykConvertFunctionSchema,
      reserveMap: v.pipe(
        v.array(CmykMapEntrySchema),
        v.description($`
          Pre-register RGB to CMYK color mappings for use in SVG or other non-CSS contexts.
          Each entry is a tuple of [rgb, {c, m, y, k}].
          RGB can be an object {r, g, b} with integers (0-10000) or a hex color string (e.g. "#ff0000").
        `),
      ),
      /** @deprecated */
      warnUnmapped: v.pipe(
        v.boolean(),
        v.metadata({ deprecated: true }),
        v.description($`
          Use \`ifUnmappedColorsFound\` instead.
          \`true\` corresponds to \`"warn"\` and \`false\` to \`"ignore"\`.
          When both are specified, \`ifUnmappedColorsFound\` takes precedence.
        `),
      ),
      ifUnmappedColorsFound: v.pipe(
        v.picklist(['warn', 'error', 'ignore']),
        v.metadata({ typeString: '"warn" | "error" | "ignore"' }),
        v.description($`
          What to do when RGB colors not mapped to CMYK are encountered:
          log a warning, fail the build, or do nothing. (default: warn)
        `),
      ),
      ifIncompatibleImagesFound: v.pipe(
        v.picklist(['warn', 'error', 'ignore']),
        v.metadata({ typeString: '"warn" | "error" | "ignore"' }),
        v.description($`
          What to do when the replaceImage scan encounters images whose color
          spaces are not DeviceCMYK or DeviceGray: log a warning, fail the build,
          or do nothing. (default: warn)
        `),
      ),
      mapOutput: v.pipe(
        ValidString,
        v.description($`
          Output the CMYK color map to a JSON file at the specified path.
          Colors converted by the fallback function are not included.
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
    Can be a boolean or a config object with options such as reserveMap,
    fallback, ifUnmappedColorsFound, and ifIncompatibleImagesFound.
  `),
);

/** Values available while a replacement function is running. */
export interface ReplaceFunctionContext {
  /**
   * The current PDF image as an owned reference scoped to this invocation.
   * Its ownership is moved into the replacement function and Vivliostyle CLI
   * destroys it when the function settles unless it is returned as the
   * replacement. It must not be destroyed manually or retained after the
   * function settles. Native objects returned by its methods are owned by the
   * replacement function and must be destroyed before it settles unless that
   * object is an image returned as the replacement.
   */
  image: mupdfType.Image;
  /** The MuPDF module that owns the current image. */
  mupdf: typeof import('mupdf');
}

/**
 * Returns an owned replacement image, transferring its ownership to
 * Vivliostyle CLI, or `null` to decline the current match and continue to the
 * next replacement candidate. The returned image must be created with the
 * supplied `mupdf` module and must not be used or destroyed after it is
 * returned. The current `image` may be returned directly to use it as the
 * replacement.
 */
export type ReplaceFunction = (
  context: ReplaceFunctionContext,
) => mupdfType.Image | null | Promise<mupdfType.Image | null>;

const ReplaceFunctionSchema = v.pipe(
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  v.function() as v.GenericSchema<ReplaceFunction>,
  v.title('ReplaceFunction'),
  v.description(
    'Function that receives the current image and its MuPDF module, then returns an owned replacement image or null to decline the current match and continue to the next replacement candidate.',
  ),
);

export const ImageConversionReplacementSchema = v.pipe(
  v.variant('kind', [
    v.object({
      kind: v.literal('builtin'),
      destination: v.union([
        v.literal('DeviceGray'),
        v.literal('DeviceRGB'),
        v.literal('DeviceCMYK'),
      ]),
      inputProfile: v.optional(ValidString),
      source: v.exactOptional(v.never()),
      replacement: v.exactOptional(v.never()),
    }),
    v.object({
      kind: v.literal('icc'),
      inputProfile: v.optional(ValidString),
      outputProfile: ValidString,
      source: v.exactOptional(v.never()),
      replacement: v.exactOptional(v.never()),
    }),
  ]),
  v.title('ImageConversionReplacement'),
  v.description('Image color conversion created by a replacement factory.'),
);
export type ImageConversionReplacement = Readonly<
  v.InferInput<typeof ImageConversionReplacementSchema>
>;

const ReplaceImageEntrySchema = v.pipe(
  v.object({
    source: v.pipe(
      v.union([ValidString, v.instance(RegExp)]),
      v.description(
        'Path to the source image file, or a RegExp pattern to match multiple files.',
      ),
    ),
    replacement: v.pipe(
      v.union([
        ValidString,
        ReplaceFunctionSchema,
        ImageConversionReplacementSchema,
      ]),
      v.description(
        'Path to the replacement image file, a replacement function or color conversion, or when source is a RegExp with a string replacement, a pattern supporting $1, $2, etc. for captured groups.',
      ),
    ),
  }),
  v.title('ReplaceImageEntry'),
);
export type ReplaceImageEntry = v.InferInput<typeof ReplaceImageEntrySchema>;

const ReplaceImageSchema = v.pipe(
  v.array(
    v.union([
      ReplaceImageEntrySchema,
      ReplaceFunctionSchema,
      ImageConversionReplacementSchema,
    ]),
  ),
  v.description($`
    Replace images in the output PDF.
    Each entry specifies source and replacement paths, combines a source path
    with a replacement function or color conversion, or applies one to every
    replaceable image.
  `),
);
export type ReplaceImageConfig = v.InferInput<typeof ReplaceImageSchema>;

export interface ResolvedReplaceFunction {
  replaceFunction: ReplaceFunction;
  label: string;
}

export interface ResolvedImageConversionReplacement {
  imageConversion: ImageConversionReplacement;
  label: string;
}

export type ResolvedReplacement =
  | ResolvedReplaceFunction
  | ResolvedImageConversionReplacement;

export interface ResolvedReplaceImageEntry {
  source: string;
  replacement: string | ResolvedReplacement;
}

export type ResolvedReplaceImageConfig = (
  | ResolvedReplaceImageEntry
  | ResolvedReplacement
)[];

const PdfPostprocessConfigSchema = v.pipe(
  v.partial(
    v.object({
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
          v.metadata({ deprecated: true }),
          v.description($`
            If set to \`docker\`, Vivliostyle will render the PDF using a Docker container. (default: \`local\`)
            \`renderMode: docker\` is deprecated and may be removed in a future major release. See https://github.com/vivliostyle/vivliostyle-cli/issues/823
          `),
        ),
        /** @deprecated */
        preflight: v.pipe(
          v.union([v.literal('press-ready'), v.literal('press-ready-local')]),
          v.metadata({ deprecated: true }),
          v.description($`
            Use \`pdfPostprocess.preflight\` instead
          `),
        ),
        /** @deprecated */
        preflightOption: v.pipe(
          v.array(ValidString),
          v.metadata({ deprecated: true }),
          v.description($`
            Use \`pdfPostprocess.preflightOption\` instead
          `),
        ),
        pdfPostprocess: PdfPostprocessConfigSchema,
      }),
    ),
  ]),
  v.title('OutputConfig'),
);
export type OutputConfig = v.InferInput<typeof OutputConfig>;

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

const notAllowedPatternRe = /(^\s*[\/\\]|^(.*[\/\\])?\s*\.\.\s*([\/\\].*)?$)/gv;
const validateAssetPatternSettings = (propName: string) =>
  v.check<string[], string>(
    (input) => input.every((pattern) => !notAllowedPatternRe.test(pattern)),
    `Invalid pattern was found in copyAsset.${propName} option`,
  );

// See the special characters of glob pattern
// https://github.com/micromatch/picomatch
const notAllowedExtensionRe = /([\\\/*?@+!\|\(\)\{\}\[\]]|\.\.|^\s*\.)/gv;
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
          Title used for the generated ToC heading and publication manifest entry.
        `),
      ),
      compose: v.pipe(
        v.custom<TocCompose>((input) => typeof input === 'function'),
        v.metadata({
          typeString:
            '({ h }: { h: typeof import("hastscript").h }) => ({ heading, content }: { heading: import("hast").Element & { tagName: "h2"; children: [import("hast").Text] }; content: import("hast").Element }) => import("hast").ElementContent[]',
        }),
        v.description($`
          Function to compose the contents of the ToC navigation element.
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
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        v.function() as v.GenericSchema<
          HastTransformFunction<StructuredDocument>
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
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        v.function() as v.GenericSchema<
          HastTransformFunction<StructuredDocumentSection>
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
          // Allow empty string
          v.string(),
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

const VfmConfig = v.pipe(StringifyMarkdownOptionsSchema, v.title('VfmConfig'));
export type VfmConfig = StringifyMarkdownOptions;

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
              const format =
                obj.format ||
                (ext === '.pdf' ? 'pdf' : ext === '.epub' ? 'epub' : 'webpub');
              return Object.assign({}, obj, { format });
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
        /** @deprecated */
        pressReady: v.pipe(
          v.boolean(),
          v.metadata({ deprecated: true }),
          v.description($`
            Use \`pdfPostprocess.preflight: "press-ready"\` instead
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
            if (url !== CONTAINER_URL || !/^\d+(\.\d+){0,2}$/v.test(version)) {
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
          v.regex(/^\//v, 'Base path must start with a slash'),
          v.check((value) => value !== '/', 'Base path must not be root'),
          v.transform((value) => value.replace(/(?!^)\/+$/v, '')),
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
              v.regex(/^\//v, 'Base path must start with a slash'),
              v.transform((value) => value.replace(/(?!^)\/+$/v, '')),
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
        if (/^(https?|data):/v.test(input)) {
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
          const format =
            obj.format ||
            (ext === '.pdf' ? 'pdf' : ext === '.epub' ? 'epub' : 'webpub');
          return Object.assign({}, obj, { format });
        }),
      ),
      v.description($`
          Output file name or directory.
        `),
    ),
    theme: v.pipe(
      v.union([
        ThemeSpecifier,
        // Explicitly disable theme installation
        v.literal(false),
      ]),
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
          Additional stylesheet for Vivliostyle viewer.
        `),
    ),
    userStyle: v.pipe(
      ValidString,
      v.description($`
          Additional user stylesheet for Vivliostyle viewer.
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
          \`renderMode: docker\` is deprecated and may be removed in a future major release. See https://github.com/vivliostyle/vivliostyle-cli/issues/823
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
    installDependencies: v.pipe(
      v.boolean(),
      v.description($`
        Install dependencies after creating a project.
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
  | 'installDependencies'
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
      // Allow empty string
      v.string(),
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
