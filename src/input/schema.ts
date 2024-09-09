import * as v from 'valibot';

export type StructuredDocument = {
  title: string;
  href: string;
  sections?: StructuredDocumentSection[];
  children: StructuredDocument[];
};

export type StructuredDocumentSection = {
  headingHtml: string;
  headingText: string;
  level: number;
  href?: string;
  id?: string;
  children: StructuredDocumentSection[];
};

export const ValidString = v.string();

export const ThemeObject = v.intersect([
  v.required(
    v.object({
      /**
       * Specifier name of importing theme package or a path of CSS file.
       * - A npm-style package argument is allowed (ex: @vivliostyle/theme-academic@1 ./local-pkg)
       * - A URL or a local path of CSS is allowed (ex: ./style.css, https://example.com/style.css)
       */
      specifier: ValidString,
    }),
    'Missing required field: specifier',
  ),
  v.partial(
    v.object({
      /**
       * Importing CSS path(s) of the package. Specify this if you want to import other than the default file.
       */
      import: v.union([v.array(ValidString), ValidString]),
    }),
  ),
]);
export type ThemeObject = v.InferInput<typeof ThemeObject>;

export const ThemeSpecifier = v.union([
  v.array(v.union([ThemeObject, ValidString])),
  ThemeObject,
  ValidString,
]);
export type ThemeSpecifier = v.InferInput<typeof ThemeSpecifier>;

export const ArticleEntryObject = v.object({
  path: ValidString,
  output: v.optional(ValidString),
  title: v.optional(ValidString),
  theme: v.optional(ThemeSpecifier),
  encodingFormat: v.optional(ValidString),
  rel: v.optional(v.union([v.array(ValidString), ValidString])),
});
export type ArticleEntryObject = v.InferInput<typeof ArticleEntryObject>;

const PageBreak = v.union([
  v.literal('left'),
  v.literal('right'),
  v.literal('recto'),
  v.literal('verso'),
]);

export const ContentsEntryObject = v.object({
  rel: v.literal('contents'),
  path: v.optional(ValidString),
  output: v.optional(ValidString),
  title: v.optional(ValidString),
  theme: v.optional(ThemeSpecifier),
  /**
   * Specify the page break position before this document. It is useful when you want to specify which side a first page of the document should be placed on a two-page spread.
   */
  pageBreakBefore: v.optional(PageBreak),
  /**
   * Reset the starting page number of this document by the specified integer. It is useful when you want to control page numbers when including a
   *  page.
   */
  pageCounterReset: v.optional(v.pipe(v.number(), v.safeInteger())),
});
export type ContentsEntryObject = v.InferInput<typeof ContentsEntryObject>;

export const CoverEntryObject = v.object({
  rel: v.literal('cover'),
  path: v.optional(ValidString),
  output: v.optional(ValidString),
  title: v.optional(ValidString),
  theme: v.optional(ThemeSpecifier),
  imageSrc: v.optional(ValidString),
  imageAlt: v.optional(v.string()), // Allow empty string
  /**
   * Specify the page break position before this document. It is useful when you want to specify which side a first page of the document should be placed on a two-page spread.
   */
  pageBreakBefore: v.optional(PageBreak),
});
export type CoverEntryObject = v.InferInput<typeof CoverEntryObject>;

export const EntryObject = v.union([
  ContentsEntryObject,
  CoverEntryObject,
  v.required(ArticleEntryObject, ['path'], 'Missing required field: path'),
]);
export type EntryObject = v.InferInput<typeof EntryObject>;

export const OutputObject = v.intersect([
  v.required(
    v.object({
      /**
       * Specify output file name or directory [<title>.pdf].
       */
      path: ValidString,
    }),
    'Missing required field: path',
  ),
  v.partial(
    v.object({
      /**
       * Specify output format.
       */
      format: ValidString,
      /**
       * if docker is set, Vivliostyle try to render PDF on Docker container [local].
       */
      renderMode: v.union([v.literal('local'), v.literal('docker')]),
      /**
       * Apply the process to generate PDF for printing.
       */
      preflight: v.union([
        v.literal('press-ready'),
        v.literal('press-ready-local'),
      ]),
      /**
       * Options for preflight process (ex: gray-scale, enforce-outline). Please refer the document of press-ready for further information. https://github.com/vibranthq/press-ready
       */
      preflightOption: v.array(ValidString),
    }),
  ),
]);
export type OutputObject = v.InferInput<typeof OutputObject>;

// Use v.looseObject to allow unknown keys in future VFM versions
export const VfmReplaceRule = v.looseObject({
  test: v.instance(RegExp),
  match: v.function() as v.GenericSchema<
    (result: RegExpMatchArray, h: any) => Object | string
  >,
});
export type VfmReplaceRule = v.InferInput<typeof VfmReplaceRule>;

export const BrowserType = v.union([
  v.literal('chromium'),
  v.literal('firefox'),
  v.literal('webkit'),
]);
export type BrowserType = v.InferInput<typeof BrowserType>;

export const VivliostyleConfigEntry = v.intersect([
  v.required(
    v.object({
      /**
       * Entry file(s) of document.
       */
      entry: v.union([
        v.pipe(
          v.array(v.union([ValidString, EntryObject])),
          v.minLength(1, 'At least one entry is required'),
        ),
        v.required(
          ArticleEntryObject,
          ['path'],
          'Missing required field: path',
        ),
        ValidString,
      ]),
    }),
    'Missing required field: entry',
  ),
  v.partial(
    v.object({
      /**
       * Title
       */
      title: ValidString,
      /**
       * Author
       */
      author: ValidString,
      /**
       * Theme package path(s) or URL(s) of css file.
       */
      theme: ThemeSpecifier,
      /**
       * Directory of referencing entry file(s).
       */
      entryContext: ValidString,
      /**
       * Options about outputs.
       */
      output: v.union([
        v.array(v.union([OutputObject, ValidString])),
        OutputObject,
        ValidString,
      ]),
      /**
       * Specify the directory where the intermediate files (manuscript HTMLs, publication.json, etc.) are saved.
       * If not specified, theses files are saved in the same directory as the input file.
       */
      workspaceDir: ValidString,
      /**
       * @deprecated Use 'copyAsset.includes' instead
       */
      includeAssets: v.union([v.array(ValidString), ValidString]),
      /**
       * Options about asset files to be copied when exporting output.
       */
      copyAsset: v.partial(
        v.object({
          /**
           * Specify directories and files you want to include as asset files. This option supports wildcard characters to make glob patterns.
           */
          includes: v.array(ValidString),
          /**
           * Specify directories and files you want to exclude from the asset file. This option supports wildcard characters to make glob patterns.
           */
          excludes: v.array(ValidString),
          /**
           * Specify extensions of the file you want to include as an asset file. (default: [png, jpg, jpeg, svg, gif, webp, apng, ttf, otf, woff, woff2])
           */
          includeFileExtensions: v.array(ValidString),
          /**
           * Specify extensions of the file you want to exclude as an asset file.
           */
          excludeFileExtensions: v.array(ValidString),
        }),
      ),
      /**
       * Output pdf size [Letter]. preset: A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger. custom(comma separated): 182mm,257mm or 8.5in,11in.
       */
      size: ValidString,
      /**
       * Make generated PDF compatible with press ready PDF/X-1a [false]. This option is equivalent with "preflight": "press-ready"
       */
      pressReady: v.boolean(),
      /**
       * Language
       */
      language: ValidString,
      readingProgression: v.union([v.literal('ltr'), v.literal('rtl')]),
      /**
       * Options about Table of Contents (ToC) documents.
       */
      toc: v.union([
        v.partial(
          v.object({
            /**
             * Specify the title of the generated ToC document.
             */
            title: ValidString,
            /**
             * Specify the location where the generated ToC document will be saved. (default: index.html)
             */
            htmlPath: ValidString,
            /**
             * Specify the depth of the section to be included in the ToC document. (default: 0)
             */
            sectionDepth: v.pipe(
              v.number(),
              v.integer(),
              v.minValue(0),
              v.maxValue(6),
            ),
            /**
             * Specify the transform function for the document list.
             */
            transformDocumentList: v.function() as v.GenericSchema<
              (
                nodeList: StructuredDocument[],
              ) => (propsList: { children: any }[]) => any
            >,
            /**
             * Specify the transform function for the section list.
             */
            transformSectionList: v.function() as v.GenericSchema<
              (
                nodeList: StructuredDocumentSection[],
              ) => (propsList: { children: any }[]) => any
            >,
          }),
        ),
        v.boolean(),
        ValidString,
      ]),
      /**
       * @deprecated Use 'toc.title' instead
       */
      tocTitle: ValidString,
      /**
       * Options about cover images and cover page documents
       */
      cover: v.union([
        v.intersect([
          v.required(
            v.object({
              /**
               * Specify the cover image to be used for the cover page.
               */
              src: ValidString,
            }),
            'Missing required field: src',
          ),
          v.partial(
            v.object({
              /**
               * Specify alternative text for the cover image.
               */
              name: v.string(), // Allow empty string
              /**
               * Specify the location where the generated cover document will be saved. (default: cover.html) If falsy value is set, the cover document won't be generated.
               */
              htmlPath: v.union([ValidString, v.boolean()]),
            }),
          ),
        ]),
        ValidString,
      ]),
      /**
       * Timeout limit for waiting Vivliostyle process [120000]
       */
      timeout: v.number(),
      /**
       * Option for convert Markdown to a stringify (HTML).
       */
      vfm: v.partial(
        // Use v.looseObject to allow unknown keys in future VFM versions
        v.looseObject({
          /**
           * Custom stylesheet path/URL.
           */
          style: v.union([v.array(ValidString), ValidString]),
          /**
           * Output markdown fragments.
           */
          partial: v.boolean(),
          /**
           * Document title (ignored in partial mode).
           */
          title: ValidString,
          /**
           * Document language (ignored in partial mode).
           */
          language: ValidString,
          /**
           * Replacement handler for HTML string.
           */
          replace: v.array(VfmReplaceRule),
          /**
           * Add `<br>` at the position of hard line breaks, without needing spaces.
           */
          hardLineBreaks: v.boolean(),
          /**
           * Disable automatic HTML format.
           */
          disableFormatHtml: v.boolean(),
          /**
           * Enable math syntax.
           */
          math: v.boolean(),
        }),
      ),
      /**
       * Specify a docker image to render.
       */
      image: ValidString,
      /**
       * Launch an HTTP server hosting contents instead of file protocol. It is useful that requires CORS such as external web fonts.
       */
      http: v.boolean(),
      /**
       * Specify a URL of displaying viewer instead of vivliostyle-cli's one. It is useful that using own viewer that has staging features. (ex: https://vivliostyle.vercel.app/)
       */
      viewer: ValidString,
      /**
       * specify viewer parameters. (ex: "allowScripts=false&pixelRatio=16")
       */
      viewerParam: ValidString,
      /**
       * EXPERIMENTAL SUPPORT: Specify a browser type to launch Vivliostyle viewer. Currently, Firefox and Webkit support preview command only!
       */
      browser: BrowserType,
    }),
  ),
]);
export type VivliostyleConfigEntry = v.InferInput<
  typeof VivliostyleConfigEntry
>;

export const VivliostyleConfigSchema = v.union([
  v.pipe(
    v.array(VivliostyleConfigEntry),
    v.minLength(1, 'At least one config entry is required'),
  ),
  VivliostyleConfigEntry,
]);
export type VivliostyleConfigSchema = v.InferInput<
  typeof VivliostyleConfigSchema
>;
