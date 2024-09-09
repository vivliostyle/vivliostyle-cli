import { expect, it } from 'vitest';
import {
  assertArray,
  assertSingleItem,
  getMergedConfig,
  maskConfig,
  resolveFixture,
} from './commandUtil.js';

const configFiles = [
  'valid.1',
  'valid.2',
  'valid.3',
  'valid.4',
  'valid.5',
  'invalid.1',
  'invalid.2',
] as const;
const configFilePath = configFiles.reduce(
  (p, v) => ({
    ...p,
    [v]: resolveFixture(`config/vivliostyle.config.${v}.cjs`),
  }),
  {} as { [k in (typeof configFiles)[number]]: string },
);

it('parse vivliostyle config', async () => {
  const validConfig1 = await getMergedConfig(['-c', configFilePath['valid.1']]);
  maskConfig(validConfig1);
  expect(validConfig1).toMatchSnapshot('valid.1.config.js');

  const validConfig2 = await getMergedConfig(['-c', configFilePath['valid.2']]);
  maskConfig(validConfig2);
  expect(validConfig2).toMatchSnapshot('valid.2.config.js');

  const validConfig3 = await getMergedConfig(['-c', configFilePath['valid.3']]);
  maskConfig(validConfig3);
  expect(validConfig3).toMatchSnapshot('valid.3.config.js');
});

it('override option by CLI command', async () => {
  const config = await getMergedConfig([
    '-c',
    configFilePath['valid.1'],
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
    '--executable-browser',
    'myFirefox',
    // '--browser',
    // 'webkit',
    '--style',
    'https://vivlostyle.org',
    '--user-style',
    './user/style/dummy.css',
    '--http',
    '--viewer',
    'https://vivliostyle.org/viewer/',
    '--viewer-param',
    'allowScripts=false&pixelRatio=16',
  ]);
  maskConfig(config);
  expect(config).toMatchSnapshot('valid.1.config.js');
});

it('deny invalid config', () => {
  expect(
    getMergedConfig(['-c', configFilePath['invalid.1']]),
  ).rejects.toThrow();
});

it('deny config which has no entry', () => {
  expect(
    getMergedConfig(['-c', configFilePath['invalid.2']]),
  ).rejects.toThrow();
});

it('deny if any config file or input file is not set', () => {
  expect(getMergedConfig([])).rejects.toThrow();
});

it('Loads same config file on each way', async () => {
  const config1 = await getMergedConfig(['-c', configFilePath['valid.1']]);
  maskConfig(config1);
  const config2 = await getMergedConfig([configFilePath['valid.1']]);
  maskConfig(config2);
  expect(config1).toEqual(config2);
});

it('yields a config with single markdown', async () => {
  const config = await getMergedConfig([resolveFixture('config/sample.md')]);
  maskConfig(config);
  assertSingleItem(config);
  expect(config.entries[0].target).toMatch(
    /^__WORKSPACE__\/tests\/fixtures\/config\/\.vs-.+\.sample\.html$/,
  );
  expect(config.manifestPath).toMatch(
    /^__WORKSPACE__\/tests\/fixtures\/config\/\.vs-.+\.publication\.json$/,
  );
  const entryAlias = config.exportAliases.find(
    ({ source }) => source === config.entries[0].target,
  );
  expect(entryAlias?.target).toMatch(
    '__WORKSPACE__/tests/fixtures/config/sample.html',
  );
  const manifestAlias = config.exportAliases.find(
    ({ source }) => source === config.manifestPath,
  );
  expect(manifestAlias?.target).toMatch(
    '__WORKSPACE__/tests/fixtures/config/publication.json',
  );
  config.manifestPath = '__SNIP__';
  config.entries[0].target = '__SNIP__';
  (config.exportAliases as unknown) = '__SNIP__';
  expect(config).toMatchSnapshot();
});

it('imports single html file', async () => {
  const config = await getMergedConfig([resolveFixture('config/sample.html')]);
  maskConfig(config);
  expect(config).toMatchSnapshot();
});

it('yields a config with single input and vivliostyle config', async () => {
  const config = await getMergedConfig([
    resolveFixture('config/nestedDir/01.md'),
    '-c',
    configFilePath['valid.1'],
  ]);
  maskConfig(config);
  assertSingleItem(config);
  expect(config.entries[0].target).toMatch(
    /^__WORKSPACE__\/tests\/fixtures\/config\/workspaceDir\/nestedDir\/\.vs-.+\.01\.html$/,
  );
  expect(config.manifestPath).toMatch(
    /^__WORKSPACE__\/tests\/fixtures\/config\/workspaceDir\/\.vs-.+\.publication\.json$/,
  );
  config.exportAliases.forEach((alias) => {
    alias.source = alias.source
      .replace(config.entries[0].target as string, '__SNIP__')
      .replace(config.manifestPath as string, '__SNIP__');
  });
  config.manifestPath = '__SNIP__';
  config.entries[0].target = '__SNIP__';
  expect(config).toMatchSnapshot();
});

it('imports a EPUB file', async () => {
  const config = await getMergedConfig([
    resolveFixture('epubs/adaptive.epub'),
    '-o',
    'epub.pdf',
  ]);
  maskConfig(config);
  assertSingleItem(config);
  expect(config.epubOpfPath).toMatch(/OPS\/content\.opf$/);
  config.epubOpfPath = '__SNIP__';
  expect(config).toMatchSnapshot();
});

it('imports a EPUB OPF file', async () => {
  const config = await getMergedConfig([
    resolveFixture('epubs/adaptive/OPS/content.opf'),
    '-o',
    'epub-opf.pdf',
  ]);
  maskConfig(config);
  expect(config).toMatchSnapshot();
});

it('imports a webbook compliant to W3C Web publication', async () => {
  const config = await getMergedConfig([
    resolveFixture('webbooks/w3c-webpub/publication.json'),
    '-o',
    'w3c-webpub',
  ]);
  maskConfig(config);
  expect(config).toMatchSnapshot();
});

it('imports a webbook compliant to Readium Web publication', async () => {
  const config = await getMergedConfig([
    resolveFixture('webbooks/readium-webpub/manifest.jsonld'),
    '-o',
    'readium-webpub',
  ]);
  maskConfig(config);
  expect(config).toMatchSnapshot();
});

it('imports a https URL', async () => {
  const config = await getMergedConfig([
    'https://vivliostyle.github.io/vivliostyle_doc/ja/vivliostyle-user-group-vol1/',
  ]);
  maskConfig(config);
  expect(config).toMatchSnapshot();
});

it('yields a config from frontmatter', async () => {
  const config = await getMergedConfig([
    resolveFixture('config/frontmatter.md'),
  ]);
  maskConfig(config);
  assertSingleItem(config);
  expect(config.entries[0].title).toBe('Frontmatter');
});

it('parse array of config', async () => {
  const validConfig = await getMergedConfig(['-c', configFilePath['valid.4']]);
  maskConfig(validConfig);
  assertArray(validConfig);
  expect(validConfig).toHaveLength(3);
  expect(validConfig[0]).toMatchSnapshot('valid.1.config.js');
  expect(validConfig[1]).toMatchSnapshot('valid.2.config.js');
  expect(validConfig[2]).toMatchSnapshot('valid.3.config.js');
});

it('allow a loose specifier of a theme direcory', async () => {
  const validConfig = await getMergedConfig(['-c', configFilePath['valid.5']]);
  maskConfig(validConfig);
  expect(validConfig).toMatchSnapshot('valid.5.config.js');
});
