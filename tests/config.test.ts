import path from 'upath';
import { setupBuildParserProgram } from '../src/commands/build.parser';
import { collectVivliostyleConfig, mergeConfig } from '../src/config';

const configFiles = ['valid.1', 'valid.2', 'valid.3', 'invalid.1'] as const;
const configFilePath = configFiles.reduce(
  (p, v) => ({
    ...p,
    [v]: path.resolve(__dirname, `fixtures/config/${v}.config.js`),
  }),
  {} as { [k in typeof configFiles[number]]: string },
);

const rootPath = path.resolve(__dirname, '..');
const getMergedConfig = async (args: string[]) => {
  const program = setupBuildParserProgram().parse([
    'vivliostyle',
    'build',
    ...args,
  ]);
  const {
    vivliostyleConfig,
    vivliostyleConfigPath,
    cliFlags,
  } = collectVivliostyleConfig({
    ...program.opts(),
    input: program.args?.[0],
    configPath: program.config,
    targets: program.targets,
  });
  const context = vivliostyleConfig
    ? path.dirname(vivliostyleConfigPath)
    : __dirname;
  const config = await mergeConfig(
    cliFlags,
    vivliostyleConfig,
    context,
    path.resolve('/tmp/vs-cli/dummy'),
  );
  maskConfig(config);
  return config;
};

const maskConfig = (obj: any) => {
  Object.entries(obj).forEach(([k, v]) => {
    if (v && typeof v === 'object') {
      maskConfig(v);
    } else if (k === 'executableChromium') {
      obj[k] = '__EXECUTABLE_CHROMIUM_PATH__';
    } else if (typeof v === 'string') {
      obj[k] = v.replace(rootPath, '__WORKSPACE__');
    }
  });
};

it('parse vivliostyle config', async () => {
  const validConfig1 = await getMergedConfig(['-c', configFilePath['valid.1']]);
  expect(validConfig1).toMatchSnapshot('valid.1.config.js');

  const validConfig2 = await getMergedConfig(['-c', configFilePath['valid.2']]);
  expect(validConfig2).toMatchSnapshot('valid.2.config.js');

  const validConfig3 = await getMergedConfig(['-c', configFilePath['valid.3']]);
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
    'webbook',
    '-t',
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
    '--executable-chromium',
    'myChromium',
  ]);
  expect(config).toMatchSnapshot('valid.1.config.js');
});

it('deny invalid config', () => {
  expect(
    getMergedConfig(['-c', configFilePath['invalid.1']]),
  ).rejects.toThrow();
});

it('Loads same config file on each way', async () => {
  const config1 = await getMergedConfig(['-c', configFilePath['valid.1']]);
  const config2 = await getMergedConfig([configFilePath['valid.1']]);
  expect(config1).toEqual(config2);
});
