import http from 'http';
import portfinder from 'portfinder';
import { getBrokerUrl, prepareServer, teardownServer } from '../src/server';
import { maskConfig } from './commandUtil';

jest.mock('http', () => ({
  __esModule: true,
  default: {
    createServer: jest.fn(() => ({
      listen: (port: number, host: string, callback: () => void) => {
        callback();
      },
      close: () => {},
    })),
  },
}));
const mockedCreateServer = http.createServer as jest.MockedFunction<
  typeof http.createServer
>;

jest.mock('portfinder', () => ({
  __esModule: true,
  default: {
    getPortPromise: jest.fn(async () => {
      return 33333;
    }),
  },
}));
const mockedGetPortPromise = portfinder.getPortPromise as jest.MockedFunction<
  typeof portfinder.getPortPromise
>;

afterEach(() => {
  teardownServer();
});

it('converts to valid broker url', async () => {
  const validOut1 = {
    url: getBrokerUrl(
      {
        input: '/absolute/path/to/manifest/file.json',
        workspaceDir: 'DUMMY',
        httpServer: false,
      },
      {},
    ),
  };
  maskConfig(validOut1);
  expect(validOut1.url).toBe(
    'file://__WORKSPACE__/node_modules/@vivliostyle/viewer/lib/index.html#src=file:///absolute/path/to/manifest/file.json&bookMode=true&renderAllPages=true',
  );

  const validOut2 = {
    url: getBrokerUrl(
      {
        input: '/absolute/path/to/something',
        workspaceDir: 'DUMMY',
        httpServer: false,
        singleDoc: true,
        quick: true,
        size: {
          width: '5in',
          height: '10in',
        },
        style:
          'data:,#test>p::before{content:"エスケープ チェック";display:block}',
        userStyle:
          'file://path/to/local/style/file/which/might/include/white space/&/special#?character.css',
      },
      {},
    ),
  };
  maskConfig(validOut2);
  expect(validOut2.url).toBe(
    'file://__WORKSPACE__/node_modules/@vivliostyle/viewer/lib/index.html#src=file:///absolute/path/to/something&bookMode=false&renderAllPages=false&style=data:,#test>p::before{content:"エスケープ チェック";display:block}&userStyle=file://path/to/local/style/file/which/might/include/white space/%26/special#?character.css&userStyle=data:,/*<viewer>*/%40page%7Bsize%3A5in%2010in!important%3B%7D/*</viewer>*/',
  );
});

it('starts up broker and source servers', async () => {
  mockedCreateServer.mockClear();
  mockedGetPortPromise.mockClear();

  const validOut1 = await prepareServer({
    input: '/absolute/path/to/manifest/file.json',
    workspaceDir: '/absolute/path',
    httpServer: true,
  });
  maskConfig(validOut1);
  expect(validOut1.brokerUrl).toBe(
    'http://localhost:33333/lib/index.html#src=http://localhost:33333/to/manifest/file.json&bookMode=true&renderAllPages=true',
  );
  expect(mockedCreateServer.mock.calls.length).toBe(2);
  expect(mockedGetPortPromise.mock.calls.length).toBe(2);
});

it('starts up a broker server', async () => {
  mockedCreateServer.mockClear();
  mockedGetPortPromise.mockClear();

  const validOut2 = await prepareServer({
    input:
      'https://vivliostyle.github.io/vivliostyle_doc/samples/gon/index.html',
    workspaceDir: '/absolute/path',
    httpServer: true,
  });
  maskConfig(validOut2);
  expect(validOut2.brokerUrl).toBe(
    'http://localhost:33333/lib/index.html#src=https://vivliostyle.github.io/vivliostyle_doc/samples/gon/index.html&bookMode=true&renderAllPages=true',
  );
  expect(mockedCreateServer.mock.calls.length).toBe(1);
  expect(mockedGetPortPromise.mock.calls.length).toBe(1);
});
