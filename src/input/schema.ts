import * as v from 'valibot';

export type StructuredDocument = {
  title: string;
  href: string;
  children: StructuredDocument[];
  sections?: StructuredDocumentSection[];
};
export const StructuredDocument: v.GenericSchema<StructuredDocument> = v.pipe(
  v.object({
    title: v.string(),
    href: v.string(),
    children: v.array(v.lazy(() => StructuredDocument)),
    sections: v.optional(v.array(v.lazy(() => StructuredDocumentSection))),
  }),
  v.title('StructuredDocument'),
);

export type StructuredDocumentSection = {
  headingHtml: string;
  headingText: string;
  level: number;
  children: StructuredDocumentSection[];
  href?: string;
  id?: string;
};
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

export const ThemeObject = v.pipe(
  v.intersect([
    v.required(
      v.object({
        specifier: v.pipe(
          ValidString,
          v.description(`
          Specifier name of importing theme package or a path of CSS file.
          - A npm-style package argument is allowed (ex: \`@vivliostyle/theme-academic@1\` \`./local-pkg\`)
          - A URL or a local path of CSS is allowed (ex: \`./style.css\`, \`https://example.com/style.css\`)
        `),
        ),
      }),
      'Missing required field: specifier',
    ),
    v.partial(
      v.object({
        import: v.pipe(
          v.union([v.array(ValidString), ValidString]),
          v.description(`
          Importing CSS path(s) of the package.
          Specify this if you want to import other than the default file.
        `),
        ),
      }),
    ),
  ]),
  v.title('ThemeObject'),
);
export type ThemeObject = v.InferInput<typeof ThemeObject>;

export const ThemeSpecifier = v.union([
  v.array(v.union([ThemeObject, ValidString])),
  ThemeObject,
  ValidString,
]);
export type ThemeSpecifier = v.InferInput<typeof ThemeSpecifier>;

export const ArticleEntryObject = v.pipe(
  v.required(
    v.object({
      path: ValidString,
      output: v.optional(ValidString),
      title: v.optional(ValidString),
      theme: v.optional(ThemeSpecifier),
      encodingFormat: v.optional(ValidString),
      rel: v.optional(v.union([v.array(ValidString), ValidString])),
    }),
    ['path'],
    'Missing required field: path',
  ),
  v.title('ArticleEntryObject'),
);
export type ArticleEntryObject = v.InferInput<typeof ArticleEntryObject>;

const PageBreak = v.union([
  v.literal('left'),
  v.literal('right'),
  v.literal('recto'),
  v.literal('verso'),
]);

export const ContentsEntryObject = v.pipe(
  v.object({
    rel: v.literal('contents'),
    path: v.optional(ValidString),
    output: v.optional(ValidString),
    title: v.optional(ValidString),
    theme: v.optional(ThemeSpecifier),
    pageBreakBefore: v.pipe(
      v.optional(PageBreak),
      v.description(`
        Specify the page break position before this document.
        It is useful when you want to specify which side a first page of the document should be placed on a two-page spread.
      `),
    ),
    pageCounterReset: v.pipe(
      v.optional(v.pipe(v.number(), v.safeInteger())),
      v.description(`
        Reset the starting page number of this document by the specified integer.
        It is useful when you want to control page numbers when including a page.
      `),
    ),
  }),
  v.title('ContentsEntryObject'),
);
export type ContentsEntryObject = v.InferInput<typeof ContentsEntryObject>;

export const CoverEntryObject = v.pipe(
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
      v.description(`
      Specify the page break position before this document.
      It is useful when you want to specify which side a first page of the document should be placed on a two-page spread.
    `),
    ),
  }),
  v.title('CoverEntryObject'),
);
export type CoverEntryObject = v.InferInput<typeof CoverEntryObject>;

export const EntryObject = v.union([
  ContentsEntryObject,
  CoverEntryObject,
  ArticleEntryObject,
]);
export type EntryObject = v.InferInput<typeof EntryObject>;

export const OutputObject = v.pipe(
  v.intersect([
    v.required(
      v.object({
        path: v.pipe(
          ValidString,
          v.description(
            `Specify output file name or directory [\`<title>.pdf\`].`,
          ),
        ),
      }),
      'Missing required field: path',
    ),
    v.partial(
      v.object({
        format: v.pipe(ValidString, v.description(`Specify output format.`)),
        renderMode: v.pipe(
          v.union([v.literal('local'), v.literal('docker')]),
          v.description(
            `if \`docker\` is set, Vivliostyle try to render PDF on Docker container [\`local\`].`,
          ),
        ),
        preflight: v.pipe(
          v.union([v.literal('press-ready'), v.literal('press-ready-local')]),
          v.description(`Apply the process to generate PDF for printing.`),
        ),
        preflightOption: v.pipe(
          v.array(ValidString),
          v.description(`
          Options for preflight process (ex: \`gray-scale\`, \`enforce-outline\`).
          Please refer the document of press-ready for further information. https://github.com/vibranthq/press-ready
        `),
        ),
      }),
    ),
  ]),
  v.title('OutputObject'),
);
export type OutputObject = v.InferInput<typeof OutputObject>;

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
  v.literal('chromium'),
  v.literal('firefox'),
  v.literal('webkit'),
]);
export type BrowserType = v.InferInput<typeof BrowserType>;

export const VivliostyleConfigEntry = v.pipe(
  v.intersect([
    v.required(
      v.object({
        entry: v.pipe(
          v.union([
            v.pipe(
              v.array(v.union([ValidString, EntryObject])),
              v.minLength(1, 'At least one entry is required'),
            ),
            ArticleEntryObject,
            ValidString,
          ]),
          v.description(`Entry file(s) of document.`),
        ),
      }),
      'Missing required field: entry',
    ),
    v.partial(
      v.object({
        title: v.pipe(ValidString, v.description(`Title`)),
        author: v.pipe(ValidString, v.description(`Author`)),
        theme: v.pipe(
          ThemeSpecifier,
          v.description(`Theme package path(s) or URL(s) of css file.`),
        ),
        entryContext: v.pipe(
          ValidString,
          v.description(`Directory of referencing entry file(s).`),
        ),
        output: v.pipe(
          v.union([
            v.array(v.union([OutputObject, ValidString])),
            OutputObject,
            ValidString,
          ]),
          v.description(`Options about outputs.`),
        ),
        workspaceDir: v.pipe(
          ValidString,
          v.description(`
            Specify the directory where the intermediate files (manuscript HTMLs, publication.json, etc.) are saved.
            If not specified, theses files are saved in the same directory as the input file.
          `),
        ),
        /** @deprecated */
        includeAssets: v.pipe(
          v.union([v.array(ValidString), ValidString]),
          v.metadata({ deprecated: true }),
          v.description(`Use \`copyAsset.includes\` instead`),
        ),
        copyAsset: v.pipe(
          v.partial(
            v.object({
              includes: v.pipe(
                v.array(ValidString),
                v.description(`
                  Specify directories and files you want to include as asset files.
                  This option supports wildcard characters to make glob patterns.
                `),
              ),
              excludes: v.pipe(
                v.array(ValidString),
                v.description(`
                  Specify directories and files you want to exclude from the asset file.
                  This option supports wildcard characters to make glob patterns.
                `),
              ),
              includeFileExtensions: v.pipe(
                v.array(ValidString),
                v.description(
                  `Specify extensions of the file you want to include as an asset file. (default: \`[png, jpg, jpeg, svg, gif, webp, apng, ttf, otf, woff, woff2]\`)`,
                ),
              ),
              excludeFileExtensions: v.pipe(
                v.array(ValidString),
                v.description(
                  `Specify extensions of the file you want to exclude as an asset file.`,
                ),
              ),
            }),
          ),
          v.description(
            `Options about asset files to be copied when exporting output.`,
          ),
        ),
        size: v.pipe(
          ValidString,
          v.description(`
            Output pdf size. (default: \`letter\`)
            - preset: \`A5\`, \`A4\`, \`A3\`, \`B5\`, \`B4\`, \`JIS-B5\`, \`JIS-B4\`, \`letter\`, \`legal\`, \`ledger\`
            - custom(comma separated): \`182mm,257mm\` or \`8.5in,11in\`
          `),
        ),
        pressReady: v.pipe(
          v.boolean(),
          v.description(`
            Make generated PDF compatible with press ready PDF/X-1a. (default: \`false\`)
            This option is equivalent with \`"preflight": "press-ready"\`
          `),
        ),
        language: v.pipe(ValidString, v.description(`Language`)),
        readingProgression: v.pipe(
          v.union([v.literal('ltr'), v.literal('rtl')]),
          v.description(
            `Specify the reading progression of the document. This is typically determined automatically by the CSS writing-mode, so use this option only if you need to set it explicitly.`,
          ),
        ),
        toc: v.pipe(
          v.union([
            v.partial(
              v.object({
                title: v.pipe(
                  ValidString,
                  v.description(
                    `Specify the title of the generated ToC document.`,
                  ),
                ),
                htmlPath: v.pipe(
                  ValidString,
                  v.description(
                    `Specify the location where the generated ToC document will be saved. (default: \`index.html\`)`,
                  ),
                ),
                sectionDepth: v.pipe(
                  v.number(),
                  v.integer(),
                  v.minValue(0),
                  v.maxValue(6),
                  v.description(
                    `Specify the depth of the section to be included in the ToC document. (default: \`0\`)`,
                  ),
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
                  v.description(
                    `Specify the transform function for the document list.`,
                  ),
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
                  v.description(
                    `Specify the transform function for the section list.`,
                  ),
                ),
              }),
            ),
            v.boolean(),
            ValidString,
          ]),
          v.description(`Options about Table of Contents (ToC) documents.`),
        ),
        /** @deprecated */
        tocTitle: v.pipe(
          ValidString,
          v.metadata({ deprecated: true }),
          v.description(`Use \`toc.title\` instead`),
        ),
        cover: v.pipe(
          v.union([
            v.intersect([
              v.required(
                v.object({
                  src: v.pipe(
                    ValidString,
                    v.description(
                      `Specify the cover image to be used for the cover page.`,
                    ),
                  ),
                }),
                'Missing required field: src',
              ),
              v.partial(
                v.object({
                  name: v.pipe(
                    v.string(), // Allow empty string
                    v.description(
                      `Specify alternative text for the cover image.`,
                    ),
                  ),
                  htmlPath: v.pipe(
                    v.union([ValidString, v.boolean()]),
                    v.description(`
                      Specify the location where the generated cover document will be saved. (default: cover.html)
                      If falsy value is set, the cover document won't be generated.
                    `),
                  ),
                }),
              ),
            ]),
            ValidString,
          ]),
          v.description(`Options about cover images and cover page documents.`),
        ),
        timeout: v.pipe(
          v.number(),
          v.description(
            `Timeout limit for waiting Vivliostyle process (ms). (default: \`120000\`)`,
          ),
        ),
        vfm: v.pipe(
          v.partial(
            // Use v.looseObject to allow unknown keys in future VFM versions
            v.looseObject({
              style: v.pipe(
                v.union([v.array(ValidString), ValidString]),
                v.description(`Custom stylesheet path/URL.`),
              ),
              partial: v.pipe(
                v.boolean(),
                v.description(`Output markdown fragments.`),
              ),
              title: v.pipe(
                ValidString,
                v.description(`Document title (ignored in partial mode).`),
              ),
              language: v.pipe(
                ValidString,
                v.description(`Document language (ignored in partial mode).`),
              ),
              replace: v.pipe(
                v.array(VfmReplaceRule),
                v.description(`Replacement handler for HTML string.`),
              ),
              hardLineBreaks: v.pipe(
                v.boolean(),
                v.description(
                  `Add \`<br>\` at the position of hard line breaks, without needing spaces.`,
                ),
              ),
              disableFormatHtml: v.pipe(
                v.boolean(),
                v.description(`Disable automatic HTML format.`),
              ),
              math: v.pipe(v.boolean(), v.description(`Enable math syntax.`)),
            }),
          ),
          v.description(`Option for convert Markdown to a stringify (HTML).`),
        ),
        image: v.pipe(
          ValidString,
          v.description(`Specify a docker image to render.`),
        ),
        http: v.pipe(
          v.boolean(),
          v.description(`
            Launch an HTTP server hosting contents instead of file protocol.
            It is useful that requires CORS such as external web fonts.
          `),
        ),
        viewer: v.pipe(
          ValidString,
          v.description(`
            Specify a URL of displaying viewer instead of vivliostyle-cli's one.
            It is useful that using own viewer that has staging features. (ex: \`https://vivliostyle.vercel.app/\`)
          `),
        ),
        viewerParam: v.pipe(
          ValidString,
          v.description(
            `specify viewer parameters. (ex: \`allowScripts=false&pixelRatio=16\`)`,
          ),
        ),
        browser: v.pipe(
          BrowserType,
          v.description(`
            EXPERIMENTAL SUPPORT: Specify a browser type to launch Vivliostyle viewer.
            Currently, Firefox and Webkit support preview command only!
          `),
        ),
      }),
    ),
  ]),
  v.title('VivliostyleConfigEntry'),
);
export type VivliostyleConfigEntry = v.InferInput<
  typeof VivliostyleConfigEntry
>;

export const VivliostyleConfigSchema = v.pipe(
  v.union([
    v.pipe(
      v.array(VivliostyleConfigEntry),
      v.minLength(1, 'At least one config entry is required'),
    ),
    VivliostyleConfigEntry,
  ]),
  v.title('VivliostyleConfigSchema'),
);
export type VivliostyleConfigSchema = v.InferInput<
  typeof VivliostyleConfigSchema
>;
