import path from 'upath';
import {
  BuildCliFlags,
  setupBuildParserProgram,
} from '../src/commands/build.parser';
import { collectVivliostyleConfig, mergeConfig } from '../src/config';

const rootPath = path.resolve(__dirname, '..');
const program = setupBuildParserProgram().parse([]);
const emptyCliFlags: BuildCliFlags = {
  ...program,
  input: program.args?.[0],
  configPath: program.config,
};
const getMergedConfig = async (test: string) => {
  const configPath = path.resolve(__dirname, test);
  const vivliostyleConfig = collectVivliostyleConfig(configPath);
  const config = await mergeConfig(
    emptyCliFlags,
    vivliostyleConfig,
    path.dirname(configPath),
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
  const validConfig1 = await getMergedConfig(
    'fixtures/config/valid.1.config.js',
  );
  expect(validConfig1).toMatchSnapshot('valid.1.config.js');

  const validConfig2 = await getMergedConfig(
    'fixtures/config/valid.2.config.js',
  );
  expect(validConfig2).toMatchSnapshot('valid.2.config.js');

  const validConfig3 = await getMergedConfig(
    'fixtures/config/valid.3.config.js',
  );
  expect(validConfig3).toMatchSnapshot('valid.3.config.js');
});

it('override option by CLI command', async () => {
  const configPath = path.resolve(
    __dirname,
    'fixtures/config/valid.1.config.js',
  );
  const program = setupBuildParserProgram().parse([
    '-c',
    configPath,
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
  const cliFlags: BuildCliFlags = {
    ...program,
    input: program.args?.[0],
    configPath: program.config,
  };
  const vivliostyleConfig = collectVivliostyleConfig(configPath);
  const config = await mergeConfig(
    cliFlags,
    vivliostyleConfig,
    path.dirname(configPath),
    path.resolve('/tmp/vs-cli/dummy'),
  );
  maskConfig(config);
  expect(config).toMatchSnapshot('valid.1.config.js');
});

it('deny invalid config', () => {
  expect(
    getMergedConfig('fixtures/config/invalid.1.config.js'),
  ).rejects.toThrow();
});
