import { Metadata, StringifyMarkdownOptions } from '@vivliostyle/vfm';
import { type Processor } from 'unified';
import upath from 'upath';
import * as v from 'valibot';

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
          v.transform((input) => [input].flat()),
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

export const ThemeSpecifier = v.pipe(
  v.union([
    v.array(v.union([ThemeObject, ValidString])),
    ThemeObject,
    ValidString,
  ]),
  v.transform((input) =>
    [input]
      .flat()
      .map((item) => (typeof item === 'string' ? { specifier: item } : item)),
  ),
);
export type ThemeSpecifier = v.InferInput<typeof ThemeSpecifier>;

export const ArticleEntryObject = v.pipe(
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

export const OutputFormat = v.union([
  v.literal('pdf'),
  v.literal('epub'),
  v.literal('webpub'),
]);
export type OutputFormat = v.InferInput<typeof OutputFormat>;

export const RenderMode = v.union([v.literal('local'), v.literal('docker')]);
export type RenderMode = v.InferInput<typeof RenderMode>;

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
        format: v.pipe(OutputFormat, v.description(`Specify output format.`)),
        renderMode: v.pipe(
          RenderMode,
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

export const BuildTask = v.pipe(
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
          v.transform((input) =>
            [input]
              .flat()
              .map((item) =>
                typeof item === 'string' ? { path: item } : item,
              ),
          ),
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
          v.transform((input): (OutputObject & { format: OutputFormat })[] =>
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
          v.transform((input) => [input].flat()),
          v.metadata({ deprecated: true }),
          v.description(`Use \`copyAsset.includes\` instead`),
        ),
        copyAsset: v.pipe(
          v.partial(
            v.object({
              includes: v.pipe(
                v.array(ValidString),
                validateAssetPatternSettings('includes'),
                v.description(`
                  Specify directories and files you want to include as asset files.
                  This option supports wildcard characters to make glob patterns.
                `),
              ),
              excludes: v.pipe(
                v.array(ValidString),
                validateAssetPatternSettings('excludes'),
                v.description(`
                  Specify directories and files you want to exclude from the asset file.
                  This option supports wildcard characters to make glob patterns.
                `),
              ),
              includeFileExtensions: v.pipe(
                v.array(ValidString),
                validateAssetExtensionSettings('includeFileExtensions'),
                v.description(
                  `Specify extensions of the file you want to include as an asset file. (default: \`[png, jpg, jpeg, svg, gif, webp, apng, ttf, otf, woff, woff2]\`)`,
                ),
              ),
              excludeFileExtensions: v.pipe(
                v.array(ValidString),
                validateAssetExtensionSettings('excludeFileExtensions'),
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
          ReadingProgression,
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
          v.transform((input) =>
            typeof input === 'string'
              ? { htmlPath: input }
              : typeof input === 'boolean'
                ? {}
                : input,
          ),
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
          v.transform((input) =>
            typeof input === 'string' ? { src: input } : input,
          ),
          v.description(`Options about cover images and cover page documents.`),
        ),
        timeout: v.pipe(
          v.number(),
          v.description(
            `Timeout limit for waiting Vivliostyle process (ms). (default: \`120000\`)`,
          ),
        ),
        documentProcessor: v.pipe(
          v.function() as v.GenericSchema<
            (option: StringifyMarkdownOptions, metadata: Metadata) => Processor
          >,
          v.metadata({
            typeString:
              '(option: import("@vivliostyle/vfm").StringifyMarkdownOptions, metadata: import("@vivliostyle/vfm").Metadata) => import("unified").Processor',
          }),
          v.description(
            'Custom function to provide unified Processor from markdown into html',
          ),
        ),
        vfm: v.pipe(
          v.partial(
            // Use v.looseObject to allow unknown keys in future VFM versions
            v.looseObject({
              style: v.pipe(
                v.union([v.array(ValidString), ValidString]),

                v.transform((input) => [input].flat()),
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
        base: v.pipe(
          ValidString,
          v.regex(/^\//, 'Base path must start with a slash'),
          v.check((value) => value !== '/', 'Base path must not be root'),
          v.transform((value) => value.replace(/\/+$/, '')),
          v.description(
            `Specify the base path of the document. (default: \`/vivliostyle\`)`,
          ),
        ),
        server: v.pipe(
          v.partial(
            v.object({
              host: v.pipe(
                v.union([v.boolean(), ValidString]),
                v.description(
                  `Specify which IP address the server should listen on.
                  Set this to \`true\` to listen on all addresses.
                  (default: \`true\` if a PDF build with docker render mode is required, otherwise \`false\`)`,
                ),
              ),
              port: v.pipe(
                v.number(),
                v.minValue(0),
                v.maxValue(65535),
                v.description(
                  `Specify which port the server should listen on. (default: \`13000\`)`,
                ),
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
                v.description(
                  `Specify custom proxy rules for the Vivliostyle preview server.`,
                ),
              ),
            }),
          ),
          v.description(`Options for the preview server.`),
        ),
        static: v.pipe(
          v.record(
            v.pipe(
              ValidString,
              v.regex(/^\//, 'Base path must start with a slash'),
              v.transform((value) => value.replace(/\/+$/, '')),
            ),
            v.pipe(
              v.union([v.array(ValidString), ValidString]),
              v.transform((input) => [input].flat()),
            ),
          ),
          v.description(`
            Specify static files to be served by the Vivliostyle preview server.
            \`\`\`js
            export default {
              static: {
                '/static': 'path/to/static',
                '/': ['root1', 'root2'],
              },
            };
            \`\`\`
          `),
        ),
        temporaryFilePrefix: v.pipe(
          ValidString,
          v.description(`Specify the prefix of the temporary file names.`),
        ),
        vite: v.pipe(
          v.custom<import('vite').UserConfig>(() => true),
          v.metadata({
            typeString: 'import("vite").UserConfig',
          }),
          v.description(`Options for Vite server.`),
        ),
        viteConfigFile: v.pipe(
          v.union([ValidString, v.boolean()]),
          v.description(`
            Specify a path of Vite config file.
            If falsy value is set, Vivliostyle CLI ignores the existing Vite config file.
          `),
        ),
      }),
    ),
  ]),
  v.title('BuildTask'),
);
export type BuildTask = v.InferInput<typeof BuildTask>;
export type ParsedBuildTask = v.InferOutput<typeof BuildTask>;

/** @hidden */
export const VivliostyleConfigSchema = v.pipe(
  v.union([
    v.pipe(
      v.array(BuildTask),
      v.minLength(1, 'At least one config entry is required'),
    ),
    BuildTask,
  ]),
  v.transform(
    (
      input,
    ): {
      tasks: ParsedBuildTask[];
      inlineOptions: InlineOptions;
    } => ({
      tasks: [input].flat(),
      inlineOptions: {},
    }),
  ),
  v.title('VivliostyleConfigSchema'),
);
/**
 * @see https://github.com/vivliostyle/vivliostyle-cli/blob/main/docs/config.md
 */
export type VivliostyleConfigSchema = v.InferInput<
  typeof VivliostyleConfigSchema
>;
export type ParsedVivliostyleConfigSchema = v.InferOutput<
  typeof VivliostyleConfigSchema
>;

export type InputFormat =
  | 'markdown'
  | 'webbook'
  | 'pub-manifest'
  | 'epub'
  | 'epub-opf';

export const VivliostyleInlineConfig = v.pipe(
  v.partial(
    v.object({
      cwd: v.pipe(ValidString, v.description(`Set a working directory.`)),
      config: v.pipe(
        ValidString,
        v.description(`Path to vivliostyle.config.js.`),
      ),
      input: v.pipe(
        ValidString,
        v.transform((input): { format: InputFormat; entry: string } => {
          const ext = upath.extname(input).toLowerCase();
          if (/^https?:/.test(input)) {
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
        v.description(`Input file of document.`),
      ),
      output: v.pipe(
        v.union([
          v.array(v.union([OutputObject, ValidString])),
          OutputObject,
          ValidString,
        ]),
        v.transform((input): (OutputObject & { format: OutputFormat })[] =>
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
        v.description(`Output file name or directory.`),
      ),
      theme: v.pipe(
        ThemeSpecifier,
        v.description(`Theme path or package name.`),
      ),
      size: v.pipe(
        ValidString,
        v.description(`
          Output pdf size.
          preset: A5, A4, A3, B5, B4, JIS-B5, JIS-B4, letter, legal, ledger
          custom(comma separated): 182mm,257mm or 8.5in,11in
        `),
      ),
      cropMarks: v.pipe(v.boolean(), v.description(`Print crop marks.`)),
      bleed: v.pipe(
        ValidString,
        v.description(
          `Extent of the bleed area for printing with crop marks. [3mm]`,
        ),
      ),
      cropOffset: v.pipe(
        ValidString,
        v.description(
          `Distance between the edge of the trim size and the edge of the media size. [auto (13mm + bleed)]`,
        ),
      ),
      css: v.pipe(
        ValidString,
        v.description(
          `Custom style CSS code. (ex: ":root {--my-color: lime;}")`,
        ),
      ),
      style: v.pipe(
        ValidString,
        v.description(`Additional stylesheet URL or path.`),
      ),
      userStyle: v.pipe(
        ValidString,
        v.description(`User stylesheet URL or path.`),
      ),
      singleDoc: v.pipe(
        v.boolean(),
        v.description(`Single HTML document input.`),
      ),
      quick: v.pipe(
        v.boolean(),
        v.description(`Quick loading with rough page count.`),
      ),
      pressReady: v.pipe(
        v.boolean(),
        v.description(`
          Make generated PDF compatible with press ready PDF/X-1a.
          This option is equivalent with "preflight": "press-ready"
        `),
      ),
      title: v.pipe(ValidString, v.description(`Title`)),
      author: v.pipe(ValidString, v.description(`Author`)),
      language: v.pipe(ValidString, v.description(`Language`)),
      readingProgression: v.pipe(
        ReadingProgression,
        v.description(`Direction of reading progression.`),
      ),
      timeout: v.pipe(
        v.number(),
        v.description(`Timeout limit for waiting Vivliostyle process (ms).`),
      ),
      renderMode: v.pipe(
        RenderMode,
        v.description(
          `If docker is set, Vivliostyle try to render PDF on Docker container. [local]`,
        ),
      ),
      preflight: v.pipe(
        v.union([v.literal('press-ready'), v.literal('press-ready-local')]),
        v.description(`Apply the process to generate PDF for printing.`),
      ),
      preflightOption: v.pipe(
        v.union([v.array(ValidString), ValidString]),
        v.transform((input) => [input].flat()),
        v.description(`
          Options for preflight process (ex: gray-scale, enforce-outline).
          Please refer the document of press-ready for further information.
        `),
      ),
      sandbox: v.pipe(
        v.boolean(),
        v.description(`Launch chrome with sandbox.`),
      ),
      executableBrowser: v.pipe(
        ValidString,
        v.description(`Specify a path of executable browser you installed.`),
      ),
      image: v.pipe(
        ValidString,
        v.description(`Specify a docker image to render.`),
      ),
      viewer: v.pipe(
        ValidString,
        v.description(`
          Specify a URL of displaying viewer instead of vivliostyle-cli's one.
          It is useful that using own viewer that has staging features. (ex: https://vivliostyle.vercel.app/)
        `),
      ),
      viewerParam: v.pipe(
        ValidString,
        v.description(
          `Specify viewer parameters. (ex: "allowScripts=false&pixelRatio=16")`,
        ),
      ),
      browser: v.pipe(
        BrowserType,
        v.description(
          `Specify a browser type to launch Vivliostyle viewer [chromium].`,
        ),
      ),
      proxyServer: v.pipe(
        ValidString,
        v.description(`HTTP/SOCK proxy server url for underlying Playwright.`),
      ),
      proxyBypass: v.pipe(
        ValidString,
        v.description(`Optional comma-separated domains to bypass proxy.`),
      ),
      proxyUser: v.pipe(
        ValidString,
        v.description(`Optional username for HTTP proxy authentication.`),
      ),
      proxyPass: v.pipe(
        ValidString,
        v.description(`Optional password for HTTP proxy authentication.`),
      ),
      logLevel: v.pipe(
        LogLevel,
        v.description(`Specify a log level of console outputs.`),
      ),
      ignoreHttpsErrors: v.pipe(
        v.boolean(),
        v.description(
          `true to ignore HTTPS errors when Playwright browser opens a new page.`,
        ),
      ),
      openViewer: v.pipe(
        v.boolean(),
        v.description(`Open a browser to display the document preview.`),
      ),
      enableStaticServe: v.pipe(
        v.boolean(),
        v.description(
          `Enable static file serving as configured in the Vivliostyle config file.`,
        ),
      ),
    }),
  ),
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
>;
