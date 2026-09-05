import { VFM, readMetadata } from '@vivliostyle/vfm';
import * as v from 'valibot';
import { ValiError } from 'valibot';
import { expect, expectTypeOf, it, onTestFinished, vi } from 'vitest';

const mockedGlobSync = vi.hoisted(() =>
  vi.fn<typeof import('tinyglobby').globSync>(),
);

vi.mock('tinyglobby', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tinyglobby')>();
  mockedGlobSync.mockImplementation(actual.globSync);
  return { ...actual, globSync: mockedGlobSync };
});

import { warnDeprecatedConfig } from '../src/config/load.js';
import { mergeInlineConfig } from '../src/config/merge.js';
import {
  resolveTaskConfig,
  UseTemporaryServerRoot,
} from '../src/config/resolve.js';
import type {
  ReplaceFunction,
  ReplaceImageConfig,
} from '../src/config/schema.js';
import {
  ImageConversionReplacementSchema,
  VivliostyleConfigSchema,
  VivliostyleInlineConfig,
} from '../src/config/schema.js';
import {
  createBuiltinCmykConversionReplacement,
  createIccConversionReplacement,
} from '../src/image-replacement.js';
import { Logger } from '../src/logger.js';
import { getTaskConfig, maskConfig, resolveFixture } from './command-util.js';

const findFileEntry = (entries: any[], pathnameSuffix: string) =>
  entries.find(
    (e) =>
      'source' in e &&
      e.source?.type === 'file' &&
      e.source.pathname.endsWith(pathnameSuffix),
  );

const validConfigData = {
  title: 'title',
  author: 'author',
  theme: ['../themes/debug-theme'],
  entry: [
    'manuscript.md',
    {
      path: 'frontmatter.md',
      title: 'title',
      theme: {
        specifier: 'theme.css',
      },
    },
  ],
  entryContext: '.',
  output: [
    'output1.pdf',
    {
      path: 'output2.pdf',
      format: 'pdf',
    },
  ],
  size: 'size',
  pressReady: true,
  language: 'language',
  toc: {
    title: 'TOC',
    htmlPath: './toc.html',
    sectionDepth: 6,
  },
  cover: {
    src: './cover.png',
    name: 'Cover image alt',
    htmlPath: './mycover.html',
  },
  timeout: 1,
  workspaceDir: 'workspaceDir',
  vfm: {
    hardLineBreaks: true,
    disableFormatHtml: true,
  },
  readingProgression: 'rtl',
  browser: 'firefox@beta',
  viewerParam: 'foo=bar',
  copyAsset: {
    includes: ['xx/yy', '**/zz'],
    excludes: ['*a*'],
    includeFileExtensions: ['zip'],
    excludeFileExtensions: ['png', 'jpg'],
  },
  base: '/root/vvv/',
  server: {
    host: true,
    port: 9876,
    proxy: {
      '/api': 'http://localhost:6789',
    },
  },
  static: {
    '/static': 'path/to/static',
    '/': ['root1', 'root2'],
  },
  temporaryFilePrefix: 'vvv.',
} satisfies VivliostyleConfigSchema;

it('parse vivliostyle config', async () => {
  const validConfig1 = await getTaskConfig(
    ['build'],
    resolveFixture('config'),
    validConfigData,
  );
  maskConfig(validConfig1);
  expect(validConfig1).toMatchSnapshot('config');
});

it('override option by CLI command', async () => {
  const config = await getTaskConfig(
    [
      'build',
      '-o',
      'yuno.pdf',
      '-o',
      'yuno',
      '-f',
      'webpub',
      '-T',
      'https://myTheme.example.com',
      '-s',
      'JIS-B5',
      '--title',
      'myTitle',
      '--author',
      'myAuthor',
      '--language',
      'myLanguage',
      '--timeout',
      '42',
      '--ignore-https-errors',
      '--executable-browser',
      '/usr/bin/browser',
      '--browser',
      'chrome@canary',
      '--style',
      'https://vivlostyle.org',
      '--user-style',
      './theme.css',
      '--viewer',
      'https://vivliostyle.org/viewer/',
      '--viewer-param',
      'allowScripts=false&pixelRatio=16',
      '--proxy-server',
      'http://localhost:3128',
      '--proxy-bypass',
      '.example.com',
      '--proxy-user',
      'proxy-auth-user',
      '--proxy-pass',
      'proxy-auth-password',
      '--no-vite-config-file',
    ],
    resolveFixture('config'),
    validConfigData,
  );
  maskConfig(config);
  expect(config).toMatchSnapshot('config');
});

it('override option by environment variable', async () => {
  vi.stubEnv('HTTP_PROXY', 'https://localhost:9001');
  vi.stubEnv('NOPROXY', 'bypass.example.com');
  onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  const validConfig1 = await getTaskConfig(
    ['build'],
    resolveFixture('config'),
    validConfigData,
  );
  expect(validConfig1.proxy?.server).toBe('https://localhost:9001');
  expect(validConfig1.proxy?.bypass).toBe('bypass.example.com');
});

it('deny invalid config', async () => {
  await expect(
    getTaskConfig(
      ['build'],
      resolveFixture('config'),
      // @ts-expect-error -- intentionally invalid output format for testing
      {
        output: {
          path: 'output',
          format: 'invalidFormat',
        },
      },
    ),
  ).rejects.toThrow(ValiError);
});

it('deny config which has no entry', async () => {
  await expect(
    getTaskConfig(['build'], resolveFixture('config'), { entry: [] }),
  ).rejects.toThrow(ValiError);
});

it('deny if any config file or input file is not set', async () => {
  await expect(
    getTaskConfig(['build'], resolveFixture('config/empty-dir')),
  ).rejects.toThrow(
    'No input is set. Please set an appropriate entry or a Vivliostyle config file.',
  );
});

it('deny if duplicate entry is set', async () => {
  await expect(
    getTaskConfig(['build'], resolveFixture('config'), {
      entry: ['index.md'],
      toc: true,
    }),
  ).rejects.toThrow(
    'The output path "index.html" will overwrite existing content. Please choose a different name for the source file:',
  );
});

it('yields a config with single markdown', async () => {
  const config = await getTaskConfig(
    ['build', 'sample.md'],
    resolveFixture('config'),
  );
  maskConfig(config);
  expect(config).toMatchObject({
    entries: [
      {
        target:
          '__WORKSPACE__/tests/fixtures/config/__TEMPORARY_FILE_PREFIX__sample.html',
      },
    ],
    viewerInput: {
      type: 'webpub',
      manifestPath:
        '__WORKSPACE__/tests/fixtures/config/__TEMPORARY_FILE_PREFIX__publication.json',
      needToGenerateManifest: true,
    },
    exportAliases: expect.arrayContaining([
      {
        source:
          '__WORKSPACE__/tests/fixtures/config/__TEMPORARY_FILE_PREFIX__sample.html',
        target: '__WORKSPACE__/tests/fixtures/config/sample.html',
      },
      {
        source:
          '__WORKSPACE__/tests/fixtures/config/__TEMPORARY_FILE_PREFIX__publication.json',
        target: '__WORKSPACE__/tests/fixtures/config/publication.json',
      },
    ]),
  });
});

it('imports single html file', async () => {
  const config = await getTaskConfig(
    ['build', 'sample.html'],
    resolveFixture('config'),
  );
  maskConfig(config);
  expect(config).toMatchObject({
    viewerInput: {
      type: 'webbook',
      webbookEntryUrl: '/vivliostyle/sample.html',
    },
  });
});

it('yields a config with single input and vivliostyle config', async () => {
  const config = await getTaskConfig(
    ['build', 'nestedDir/01.md'],
    resolveFixture('config'),
    validConfigData,
  );
  maskConfig(config);
  expect(config).toMatchObject({
    entries: [
      {
        target: '__WORKSPACE__/tests/fixtures/config/nestedDir/vvv.01.html',
      },
    ],
    viewerInput: {
      type: 'webpub',
      manifestPath:
        '__WORKSPACE__/tests/fixtures/config/nestedDir/vvv.publication.json',
      needToGenerateManifest: true,
    },
  });
});

it('imports a EPUB file', async () => {
  const config = await getTaskConfig(
    ['build', 'adaptive.epub', '-o', 'epub.pdf'],
    resolveFixture('epubs'),
  );
  maskConfig(config);
  expect(config).toMatchObject({
    viewerInput: {
      type: 'epub',
      epubPath: '__WORKSPACE__/tests/fixtures/epubs/adaptive.epub',
      epubTmpOutputDir:
        '__WORKSPACE__/tests/fixtures/epubs/__TEMPORARY_FILE_PREFIX__adaptive.epub',
    },
  });
});

it('imports a EPUB OPF file', async () => {
  const config = await getTaskConfig(
    ['build', 'adaptive/OPS/content.opf', '-o', 'epub-opf.pdf'],
    resolveFixture('epubs'),
  );
  maskConfig(config);
  expect(config).toMatchObject({
    viewerInput: {
      type: 'epub-opf',
      epubOpfPath:
        '__WORKSPACE__/tests/fixtures/epubs/adaptive/OPS/content.opf',
    },
  });
});

it('imports a webbook compliant to W3C Web publication', async () => {
  const config = await getTaskConfig(
    ['build', 'w3c-webpub/publication.json', '-o', 'w3c-webpub-out'],
    resolveFixture('webbooks'),
  );
  maskConfig(config);
  expect(config).toMatchObject({
    viewerInput: {
      type: 'webpub',
      manifestPath:
        '__WORKSPACE__/tests/fixtures/webbooks/w3c-webpub/publication.json',
      needToGenerateManifest: false,
    },
  });
});

it('imports a webbook compliant to Readium Web publication', async () => {
  const config = await getTaskConfig(
    ['build', 'readium-webpub/manifest.jsonld', '-o', 'readium-webpub-out'],
    resolveFixture('webbooks'),
  );
  maskConfig(config);
  expect(config).toMatchObject({
    viewerInput: {
      type: 'webpub',
      manifestPath:
        '__WORKSPACE__/tests/fixtures/webbooks/readium-webpub/manifest.jsonld',
      needToGenerateManifest: false,
    },
  });
});

it('imports a https URL', async () => {
  const config = await getTaskConfig(
    [
      'build',
      'https://vivliostyle.github.io/vivliostyle_doc/ja/vivliostyle-user-group-vol1/',
    ],
    resolveFixture('config'),
  );
  maskConfig(config);
  expect(config).toMatchObject({
    viewerInput: {
      type: 'webbook',
      webbookEntryUrl:
        'https://vivliostyle.github.io/vivliostyle_doc/ja/vivliostyle-user-group-vol1/',
    },
  });
});

it('imports a HTML file with file protocol', async () => {
  const config = await getTaskConfig(
    ['build', `file://${resolveFixture('config')}/sample.html`],
    resolveFixture('config'),
  );
  maskConfig(config);
  expect(config).toMatchObject({
    viewerInput: {
      type: 'webbook',
      webbookEntryUrl: '/vivliostyle/sample.html',
    },
  });
});

it('yields a config from frontmatter', async () => {
  const config = await getTaskConfig(
    ['build', 'frontmatter.md'],
    resolveFixture('config'),
  );
  maskConfig(config);
  expect(config.entries[0].title).toBe('Frontmatter');
});

it('allow a loose specifier of a theme direcory', async () => {
  const validConfig = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output1.pdf',
    theme: 'themes/foo',
  });
  maskConfig(validConfig);
  expect(validConfig).toMatchObject({
    entries: [
      {
        themes: [
          {
            type: 'package',
            name: 'foo',
            specifier: '__WORKSPACE__/tests/fixtures/config/themes/foo',
            location:
              '__WORKSPACE__/tests/fixtures/config/.vivliostyle/themes/node_modules/foo',
          },
        ],
      },
    ],
  });
});

it('resolves server root dir for single input file', async () => {
  const config = await getTaskConfig(
    ['build', 'nestedDir/01.md'],
    resolveFixture('config'),
  );
  maskConfig(config);
  expect(config).toMatchObject({
    serverRootDir: '__WORKSPACE__/tests/fixtures/config/nestedDir',
    workspaceDir: '__WORKSPACE__/tests/fixtures/config/nestedDir',
  });
});

it('locates server root dir for EPUB OPF file', async () => {
  const config = await getTaskConfig(
    ['build', 'adaptive/OPS/content.opf'],
    resolveFixture('epubs'),
  );
  maskConfig(config);
  expect(config).toMatchObject({
    serverRootDir: '__WORKSPACE__/tests/fixtures/epubs/adaptive',
    workspaceDir: '__WORKSPACE__/tests/fixtures/epubs/adaptive',
  });
});

it('uses temporary dir for server root dir', async () => {
  const config = await getTaskConfig(
    ['build', 'https://example.com'],
    resolveFixture('config'),
  );
  maskConfig(config);
  expect(config).toMatchObject({
    serverRootDir: UseTemporaryServerRoot,
    workspaceDir: '__WORKSPACE__/tests/fixtures/config',
  });
});

it('deny config which has incompatible image', async () => {
  await expect(
    getTaskConfig(['build'], resolveFixture('config'), {
      ...validConfigData,
      image: 'ghcr.io/vivliostyle/cli:0.0.0',
    }),
  ).rejects.toThrow(
    'The specified image is not compatible with the CLI version',
  );
});

it('allows per-entry documentProcessor and documentMetadataReader', async () => {
  const customProcessor = () => {
    throw new Error('should not be called in config parsing');
  };
  const customMetadataReader = () => ({ title: 'Custom Title' });

  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: [
      'manuscript.md',
      {
        path: 'frontmatter.md',
        documentProcessor: customProcessor,
        documentMetadataReader: customMetadataReader,
      },
    ],
  });

  // frontmatter.md should have per-entry settings
  const frontmatterEntry = findFileEntry(config.entries, 'frontmatter.md');
  expect(frontmatterEntry).toBeDefined();
  expect(
    (frontmatterEntry as any).source.documentProcessor.processorFactory,
  ).toBe(customProcessor);
  expect(
    (frontmatterEntry as any).source.documentProcessor.metadataReader,
  ).toBe(customMetadataReader);
  // Title should be extracted using custom metadata reader
  expect(frontmatterEntry?.title).toBe('Custom Title');

  // manuscript.md should have global settings (VFM and readMetadata)
  const manuscriptEntry = findFileEntry(config.entries, 'manuscript.md');
  expect(manuscriptEntry).toBeDefined();
  expect(
    (manuscriptEntry as any).source.documentProcessor.processorFactory,
  ).toBe(VFM);
  expect((manuscriptEntry as any).source.documentProcessor.metadataReader).toBe(
    readMetadata,
  );
});

it('allows non-markdown extensions when documentProcessor is provided', async () => {
  const customProcessor = () => {
    throw new Error('should not be called in config parsing');
  };
  const customMetadataReader = () => ({ title: 'Custom Format Title' });

  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: [
      {
        path: 'sample.xyz',
        documentProcessor: customProcessor,
        documentMetadataReader: customMetadataReader,
      },
    ],
  });

  // sample.xyz should be accepted with custom processor
  const xyzEntry = findFileEntry(config.entries, 'sample.xyz');
  expect(xyzEntry).toBeDefined();
  // contentType should be 'text/x-vivliostyle-custom' for unknown extensions
  expect((xyzEntry as any).contentType).toBe('text/x-vivliostyle-custom');
  // Target should have .html extension
  expect((xyzEntry as any).target).toMatch(/sample\.html$/v);
  // Title should be extracted using custom metadata reader
  expect(xyzEntry?.title).toBe('Custom Format Title');
});

it('preserves HTML processing when a root documentProcessor is provided', async () => {
  const customProcessor = () => {
    throw new Error('should not be called for HTML');
  };

  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: ['sample.html'],
    documentProcessor: customProcessor,
  });

  const htmlEntry = findFileEntry(config.entries, 'sample.html');
  expect(htmlEntry).toBeDefined();
  expect((htmlEntry as any).source.contentType).toBe('text/html');
  expect((htmlEntry as any).source.documentProcessor).toBeUndefined();
  expect(htmlEntry?.title).toBe('Miyako');
});

it('preserves XHTML processing when a root documentProcessor is provided', async () => {
  const customProcessor = () => {
    throw new Error('should not be called for XHTML');
  };

  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: ['sample.xhtml'],
    documentProcessor: customProcessor,
  });

  const xhtmlEntry = findFileEntry(config.entries, 'sample.xhtml');
  expect(xhtmlEntry).toBeDefined();
  expect((xhtmlEntry as any).source.contentType).toBe('application/xhtml+xml');
  expect((xhtmlEntry as any).source.documentProcessor).toBeUndefined();
  expect(xhtmlEntry?.title).toBe('Sample XHTML');
});

it('rejects text/plain files without documentProcessor', async () => {
  // .txt files are recognized as text/plain, which requires documentProcessor
  await expect(
    getTaskConfig(['build'], resolveFixture('config'), {
      entry: ['sample.txt'],
    }),
  ).rejects.toThrow('Invalid manuscript type');
});

it('rejects unknown extensions without documentProcessor', async () => {
  await expect(
    getTaskConfig(['build'], resolveFixture('config'), {
      entry: ['sample.xyz'],
    }),
  ).rejects.toThrow('Invalid manuscript type');
});

const resolveReplaceImageEntries = async (
  source: RegExp,
): Promise<{ source: string; replacement: string }[]> => {
  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: {
      replaceImage: [{ source, replacement: 'img_cmyk.tiff' }],
    },
  });
  const output = config.outputs[0] as unknown as {
    replaceImage: { source: string; replacement: string }[];
  };
  return output.replaceImage;
};

it('supports pdfPostprocess configuration', async () => {
  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: {
      cmyk: true,
      replaceImage: [{ source: 'img.png', replacement: 'img_cmyk.tiff' }],
    },
  });
  maskConfig(config);
  expect(config.outputs[0]).toMatchObject({
    format: 'pdf',
    cmyk: {
      ifUnmappedColorsFound: 'warn',
      ifIncompatibleImagesFound: 'warn',
      overrideMap: [],
      reserveMap: [],
      mapOutput: undefined,
    },
    replaceImage: [
      {
        source: '__WORKSPACE__/tests/fixtures/config/img.png',
        replacement: '__WORKSPACE__/tests/fixtures/config/img_cmyk.tiff',
      },
    ],
  });
});

it('resolves replaceImage function entries', async () => {
  const bareFunction: ReplaceFunction = () => null;
  const replacementFunction: ReplaceFunction = () => null;
  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: {
      replaceImage: [
        bareFunction,
        { source: 'img.png', replacement: replacementFunction },
        {
          source: /^manuscript\.md$/v,
          replacement: replacementFunction,
        },
      ],
    },
  });
  maskConfig(config);
  const output = config.outputs[0] as unknown as {
    replaceImage: unknown[];
  };

  expect(output.replaceImage).toEqual([
    {
      replaceFunction: bareFunction,
      label: '[function#0]',
    },
    {
      source: '__WORKSPACE__/tests/fixtures/config/img.png',
      replacement: {
        replaceFunction: replacementFunction,
        label: '[function#1]',
      },
    },
    {
      source: '__WORKSPACE__/tests/fixtures/config/manuscript.md',
      replacement: {
        replaceFunction: replacementFunction,
        label: '[function#2]',
      },
    },
  ]);
});

it('preserves a function entry index across RegExp expansion', async () => {
  const replacementFunction: ReplaceFunction = () => null;
  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: {
      replaceImage: [
        { source: 'img.png', replacement: 'img_cmyk.tiff' },
        { source: /\.md$/v, replacement: replacementFunction },
      ],
    },
  });
  const output = config.outputs[0] as unknown as {
    replaceImage: {
      source: string;
      replacement:
        | string
        | {
            replaceFunction: ReplaceFunction;
            label: string;
          };
    }[];
  };
  const expandedEntries = output.replaceImage.slice(1);

  expect(expandedEntries.length).toBeGreaterThan(1);
  expect(expandedEntries.map(({ replacement }) => replacement)).toEqual(
    Array.from({ length: expandedEntries.length }, () => ({
      replaceFunction: replacementFunction,
      label: '[function#1]',
    })),
  );
});

it('enumerates the entry context only once when RegExp sources exist', async () => {
  await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: {
      replaceImage: [{ source: 'img.png', replacement: 'img_cmyk.tiff' }],
    },
  });
  expect(mockedGlobSync).not.toHaveBeenCalled();

  await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: {
      replaceImage: [
        { source: /\.md$/v, replacement: 'img_cmyk.tiff' },
        { source: /\.png$/v, replacement: 'img_cmyk.tiff' },
      ],
    },
  });

  expect(mockedGlobSync).toHaveBeenCalledTimes(1);
});

it('resolves image conversion profile paths from the entry context', async () => {
  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: {
      replaceImage: [
        createIccConversionReplacement({
          inputProfile: ' profiles/input.icc ',
          outputProfile: ' profiles/output.icc ',
        }),
        {
          source: 'img.png',
          replacement: createBuiltinCmykConversionReplacement({
            inputProfile: 'profiles/input.icc',
          }),
        },
      ],
    },
  });
  maskConfig(config);

  expect(config.outputs[0]).toMatchObject({
    replaceImage: [
      {
        imageConversion: {
          kind: 'icc',
          inputProfile:
            '__WORKSPACE__/tests/fixtures/config/profiles/input.icc',
          outputProfile:
            '__WORKSPACE__/tests/fixtures/config/profiles/output.icc',
        },
        label: '[function#0]',
      },
      {
        source: '__WORKSPACE__/tests/fixtures/config/img.png',
        replacement: {
          imageConversion: {
            kind: 'builtin',
            destination: 'DeviceCMYK',
            inputProfile:
              '__WORKSPACE__/tests/fixtures/config/profiles/input.icc',
          },
          label: '[function#1]',
        },
      },
    ],
  });
});

it('rejects entry fields mixed into a bare image conversion', () => {
  const mixedReplacement = {
    source: 'only.png',
    ...createBuiltinCmykConversionReplacement(),
  };

  type MixedReplacementIsAccepted =
    typeof mixedReplacement extends ReplaceImageConfig[number] ? true : false;
  expectTypeOf<MixedReplacementIsAccepted>().toEqualTypeOf<false>();
  expect(v.is(ImageConversionReplacementSchema, mixedReplacement)).toBe(false);
  expect(
    v.safeParse(VivliostyleConfigSchema, {
      pdfPostprocess: { replaceImage: [mixedReplacement] },
    }).success,
  ).toBe(false);
});

it('matches every replaceImage source with a global RegExp', async () => {
  const expectedEntries = await resolveReplaceImageEntries(/\.md$/v);
  expect(expectedEntries.length).toBeGreaterThan(1);

  const globalSource = /\.md$/gv;
  expect(await resolveReplaceImageEntries(globalSource)).toEqual(
    expectedEntries,
  );
  expect(await resolveReplaceImageEntries(globalSource)).toEqual(
    expectedEntries,
  );
});

it('preserves sticky matching across independent source paths', async () => {
  const searchableEntries = await resolveReplaceImageEntries(/[^\/]+\.md$/v);
  const stickyEntries = await resolveReplaceImageEntries(/[^\/]+\.md$/vy);

  expect(stickyEntries.length).toBeGreaterThan(1);
  expect(stickyEntries.length).toBeLessThan(searchableEntries.length);
  expect(
    stickyEntries.every(({ replacement }) =>
      replacement.endsWith('img_cmyk.tiff'),
    ),
  ).toBe(true);
});

it('resolves CMYK issue policies and the deprecated warnUnmapped option', async () => {
  const defaulted = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: { cmyk: {} },
  });
  expect(defaulted.outputs[0]).toMatchObject({
    cmyk: {
      ifUnmappedColorsFound: 'warn',
      ifIncompatibleImagesFound: 'warn',
    },
  });

  const explicit = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: {
      cmyk: {
        ifUnmappedColorsFound: 'error',
        ifIncompatibleImagesFound: 'ignore',
      },
    },
  });
  expect(explicit.outputs[0]).toMatchObject({
    cmyk: {
      ifUnmappedColorsFound: 'error',
      ifIncompatibleImagesFound: 'ignore',
    },
  });

  const legacy = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: { cmyk: { warnUnmapped: false } },
  });
  expect(legacy.outputs[0]).toMatchObject({
    cmyk: { ifUnmappedColorsFound: 'ignore' },
  });

  const preferred = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: {
      cmyk: { warnUnmapped: false, ifUnmappedColorsFound: 'error' },
    },
  });
  expect(preferred.outputs[0]).toMatchObject({
    cmyk: { ifUnmappedColorsFound: 'error' },
  });
});

it('resolves a top-level CMYK config object', () => {
  const mergedConfig = mergeInlineConfig(
    v.parse(VivliostyleConfigSchema, {
      entry: 'manuscript.md',
      output: 'output.pdf',
    }),
    v.parse(VivliostyleInlineConfig, {
      cwd: resolveFixture('config'),
      cmyk: {
        ifUnmappedColorsFound: 'error',
        ifIncompatibleImagesFound: 'ignore',
      },
    }),
  );

  const config = resolveTaskConfig(
    mergedConfig.tasks[0],
    mergedConfig.inlineOptions,
  );

  expect(config.outputs[0]).toMatchObject({
    cmyk: {
      ifUnmappedColorsFound: 'error',
      ifIncompatibleImagesFound: 'ignore',
    },
  });
});

it('preserves boolean CMYK config when the top-level API specifies false', () => {
  const mergedConfig = mergeInlineConfig(
    v.parse(VivliostyleConfigSchema, {
      entry: 'manuscript.md',
      output: 'output.pdf',
      pdfPostprocess: { cmyk: true },
    }),
    v.parse(VivliostyleInlineConfig, {
      cwd: resolveFixture('config'),
      cmyk: false,
    }),
  );

  const config = resolveTaskConfig(
    mergedConfig.tasks[0],
    mergedConfig.inlineOptions,
  );

  expect(config.outputs[0]).toMatchObject({
    cmyk: {
      ifUnmappedColorsFound: 'warn',
      ifIncompatibleImagesFound: 'warn',
    },
  });
});

it('gives a config-file CMYK object priority over the top-level API', () => {
  const mergedConfig = mergeInlineConfig(
    v.parse(VivliostyleConfigSchema, {
      entry: 'manuscript.md',
      output: 'output.pdf',
      pdfPostprocess: {
        cmyk: {
          ifUnmappedColorsFound: 'ignore',
          ifIncompatibleImagesFound: 'warn',
        },
      },
    }),
    v.parse(VivliostyleInlineConfig, {
      cwd: resolveFixture('config'),
      cmyk: {
        ifUnmappedColorsFound: 'error',
        ifIncompatibleImagesFound: 'ignore',
      },
    }),
  );

  const config = resolveTaskConfig(
    mergedConfig.tasks[0],
    mergedConfig.inlineOptions,
  );

  expect(config.outputs[0]).toMatchObject({
    cmyk: {
      ifUnmappedColorsFound: 'ignore',
      ifIncompatibleImagesFound: 'warn',
    },
  });
});

it('warns when build-level cmyk config uses warnUnmapped', () => {
  const warn = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  onTestFinished(() => warn.mockRestore());
  const config = v.parse(VivliostyleConfigSchema, {
    entry: 'manuscript.md',
    pdfPostprocess: { cmyk: { warnUnmapped: true } },
  });

  warnDeprecatedConfig(config);

  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('ifUnmappedColorsFound'),
  );
});

it('warns when output-level cmyk config uses warnUnmapped', () => {
  const warn = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  onTestFinished(() => warn.mockRestore());
  const config = v.parse(VivliostyleConfigSchema, {
    entry: 'manuscript.md',
    output: {
      path: 'output.pdf',
      pdfPostprocess: { cmyk: { warnUnmapped: false } },
    },
  });

  warnDeprecatedConfig(config);

  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('ifUnmappedColorsFound'),
  );
});

it('warns when top-level cmyk config uses warnUnmapped', () => {
  const warn = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  onTestFinished(() => warn.mockRestore());
  const config = v.parse(VivliostyleConfigSchema, {
    entry: 'manuscript.md',
  });
  const inlineConfig = v.parse(VivliostyleInlineConfig, {
    cmyk: { warnUnmapped: false },
  });

  warnDeprecatedConfig(config, inlineConfig);

  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('ifUnmappedColorsFound'),
  );
});

it('does not warn for current top-level preflight options', () => {
  const warn = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  onTestFinished(() => warn.mockRestore());
  const config = v.parse(VivliostyleConfigSchema, {
    entry: 'manuscript.md',
    output: 'output.pdf',
  });
  const inlineConfig = v.parse(VivliostyleInlineConfig, {
    preflight: 'press-ready',
    preflightOption: ['gray-scale'],
  });

  warnDeprecatedConfig(config, inlineConfig);

  expect(warn).not.toHaveBeenCalled();
});

it('pdfPostprocess takes precedence over legacy pressReady option', async () => {
  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    // legacy option (fallback)
    pressReady: true,
    pdfPostprocess: {
      // this takes precedence
      preflight: undefined,
    },
  });
  expect(config.outputs[0]).toMatchObject({
    format: 'pdf',
    preflight: undefined,
  });
});

it('legacy pressReady works as fallback when pdfPostprocess not specified', async () => {
  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    // used since pdfPostprocess.pressReady is not specified
    pressReady: true,
  });
  expect(config.outputs[0]).toMatchObject({
    format: 'pdf',
    preflight: 'press-ready',
  });
});

it('output-level pdfPostprocess overrides build-level', async () => {
  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    pdfPostprocess: { cmyk: false },
    output: [
      {
        path: 'output.pdf',
        pdfPostprocess: { cmyk: true },
      },
    ],
  });
  expect(config.outputs[0]).toMatchObject({
    format: 'pdf',
    cmyk: {
      ifUnmappedColorsFound: 'warn',
      ifIncompatibleImagesFound: 'warn',
      overrideMap: [],
      reserveMap: [],
      mapOutput: undefined,
    },
  });
});

it('cmyk overrideMap and reserveMap accept hex color strings', async () => {
  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: {
      cmyk: {
        overrideMap: [['#ff0000', { c: 0, m: 10000, y: 10000, k: 0 }]],
        reserveMap: [
          ['#00ff00', { c: 10000, m: 0, y: 10000, k: 0 }],
          ['#abc', { c: 1000, m: 2000, y: 3000, k: 4000 }],
          ['#abcd', { c: 1000, m: 2000, y: 3000, k: 5000 }],
          ['#ff000080', { c: 0, m: 10000, y: 10000, k: 500 }],
        ],
      },
    },
  });
  expect(config.outputs[0]).toMatchObject({
    format: 'pdf',
    cmyk: {
      overrideMap: [
        [
          { r: 10000, g: 0, b: 0 },
          { c: 0, m: 10000, y: 10000, k: 0 },
        ],
      ],
      reserveMap: [
        [
          { r: 0, g: 10000, b: 0 },
          { c: 10000, m: 0, y: 10000, k: 0 },
        ],
        [
          { r: 6667, g: 7333, b: 8000 },
          { c: 1000, m: 2000, y: 3000, k: 4000 },
        ],
        [
          { r: 6667, g: 7333, b: 8000 },
          { c: 1000, m: 2000, y: 3000, k: 5000 },
        ],
        [
          { r: 10000, g: 0, b: 0 },
          { c: 0, m: 10000, y: 10000, k: 500 },
        ],
      ],
    },
  });
});

it('cmyk overrideMap and reserveMap accept mixed hex and object entries', async () => {
  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: 'output.pdf',
    pdfPostprocess: {
      cmyk: {
        reserveMap: [
          ['#808080', { c: 0, m: 0, y: 0, k: 5000 }],
          [
            { r: 5020, g: 10000, b: 10000 },
            { c: 5000, m: 0, y: 0, k: 0 },
          ],
        ],
      },
    },
  });
  expect(config.outputs[0]).toMatchObject({
    format: 'pdf',
    cmyk: {
      reserveMap: [
        [
          { r: 5020, g: 5020, b: 5020 },
          { c: 0, m: 0, y: 0, k: 5000 },
        ],
        [
          { r: 5020, g: 10000, b: 10000 },
          { c: 5000, m: 0, y: 0, k: 0 },
        ],
      ],
    },
  });
});

it('output-level pdfPostprocess.preflight overrides output.preflight', async () => {
  const config = await getTaskConfig(['build'], resolveFixture('config'), {
    entry: 'manuscript.md',
    output: [
      {
        path: 'output.pdf',
        // legacy option (fallback)
        preflight: 'press-ready',
        pdfPostprocess: {
          // this takes precedence
          preflight: 'press-ready-local',
        },
      },
    ],
  });
  expect(config.outputs[0]).toMatchObject({
    format: 'pdf',
    preflight: 'press-ready-local',
  });
});

it('warns when output config uses deprecated renderMode: docker', () => {
  const warn = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  onTestFinished(() => warn.mockRestore());
  const config = v.parse(VivliostyleConfigSchema, {
    entry: 'manuscript.md',
    output: [{ path: 'output.pdf', renderMode: 'docker' }],
  });
  warnDeprecatedConfig(config);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('vivliostyle-cli/issues/823'),
  );
});

it('warns when --render-mode docker is passed as an inline option', () => {
  const warn = vi.spyOn(Logger, 'logWarn').mockImplementation(() => {});
  onTestFinished(() => warn.mockRestore());
  const config = v.parse(VivliostyleConfigSchema, { entry: 'manuscript.md' });
  config.inlineOptions.renderMode = 'docker';
  warnDeprecatedConfig(config);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('vivliostyle-cli/issues/823'),
  );
});
