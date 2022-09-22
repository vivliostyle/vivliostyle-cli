import http from 'http';
import portfinder from 'portfinder';
import path from 'upath';
import { pathToFileURL } from 'url';
import { getViewerFullUrl, prepareServer, teardownServer } from '../src/server';
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

beforeEach(() => {
  mockedCreateServer.mockClear();
  mockedGetPortPromise.mockClear();
});

afterEach(() => {
  teardownServer();
});

it('converts to valid broker url', async () => {
  const validOut1 = {
    url: getViewerFullUrl(
      {},
      {
        viewerUrl: pathToFileURL(
          path.resolve(
            __dirname,
            '../node_modules/@vivliostyle/viewer/lib/index.html',
          ),
        ),
        sourceUrl: pathToFileURL('/absolute/path/to/manifest/file.json'),
      },
    ),
  };
  maskConfig(validOut1);
  expect(validOut1.url).toBe(
    'file://__WORKSPACE__/node_modules/@vivliostyle/viewer/lib/index.html#src=file:///absolute/path/to/manifest/file.json&bookMode=true&renderAllPages=true',
  );

  const validOut2 = {
    url: getViewerFullUrl(
      {
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
      {
        viewerUrl: pathToFileURL(
          path.resolve(
            __dirname,
            '../node_modules/@vivliostyle/viewer/lib/index.html',
          ),
        ),
        sourceUrl: pathToFileURL('/absolute/path/to/something'),
      },
    ),
  };
  maskConfig(validOut2);
  expect(validOut2.url).toBe(
    'file://__WORKSPACE__/node_modules/@vivliostyle/viewer/lib/index.html#src=file:///absolute/path/to/something&bookMode=false&renderAllPages=false&style=data:,#test>p::before{content:\"エスケープ チェック\";display:block}&userStyle=file://path/to/local/style/file/which/might/include/white space/%26/special#?character.css&style=data:,/*<viewer>*/%40page%7Bsize%3A5in%2010in!important%3B%7D/*</viewer>*/',
  );

  const validOut3 = {
    url: getViewerFullUrl(
      {
        size: { format: 'a5' },
        css: ':root{--color:#ABC}',
        style: 'author.css',
        userStyle: 'user.css',
      },
      {
        viewerUrl: pathToFileURL(
          path.resolve(
            __dirname,
            '../node_modules/@vivliostyle/viewer/lib/index.html',
          ),
        ),
        sourceUrl: pathToFileURL('/absolute/path/to/something'),
      },
    ),
  };
  maskConfig(validOut3);
  expect(validOut3.url).toBe(
    'file://__WORKSPACE__/node_modules/@vivliostyle/viewer/lib/index.html#src=file:///absolute/path/to/something&bookMode=true&renderAllPages=true&style=author.css&userStyle=user.css&style=data:,/*<viewer>*/%40page%7Bsize%3Aa5!important%3B%7D/*</viewer>*/%3Aroot%7B--color%3A%23ABC%7D',
  );

  const validOut4 = {
    url: getViewerFullUrl(
      {
        cropMarks: true,
        bleed: '9pt',
        cropOffset: '1in',
      },
      {
        viewerUrl: pathToFileURL(
          path.resolve(
            __dirname,
            '../node_modules/@vivliostyle/viewer/lib/index.html',
          ),
        ),
        sourceUrl: pathToFileURL('/absolute/path/to/something'),
      },
    ),
  };
  maskConfig(validOut4);
  expect(validOut4.url).toBe(
    'file://__WORKSPACE__/node_modules/@vivliostyle/viewer/lib/index.html#src=file:///absolute/path/to/something&bookMode=true&renderAllPages=true&style=data:,/*<viewer>*/%40page%7Bmarks%3Acrop%20cross!important%3Bbleed%3A9pt!important%3Bcrop-offset%3A1in!important%3B%7D/*</viewer>*/',
  );
});

it('starts up broker and source servers', async () => {
  const validOut1 = await prepareServer({
    input: '/absolute/path/to/manifest/file.json',
    workspaceDir: '/absolute/path',
    httpServer: true,
    viewer: undefined,
  });
  maskConfig(validOut1);
  expect(validOut1.viewerFullUrl).toBe(
    'http://localhost:33333/lib/index.html#src=http://localhost:33333/to/manifest/file.json&bookMode=true&renderAllPages=true',
  );
  expect(mockedCreateServer.mock.calls.length).toBe(2);
  expect(mockedGetPortPromise.mock.calls.length).toBe(2);
});

it('starts up a broker server', async () => {
  const validOut1 = await prepareServer({
    input:
      'https://vivliostyle.github.io/vivliostyle_doc/samples/gon/index.html',
    workspaceDir: '/absolute/path',
    httpServer: true,
    viewer: undefined,
  });
  maskConfig(validOut1);
  expect(validOut1.viewerFullUrl).toBe(
    'http://localhost:33333/lib/index.html#src=https://vivliostyle.github.io/vivliostyle_doc/samples/gon/index.html&bookMode=true&renderAllPages=true',
  );
  expect(mockedCreateServer.mock.calls.length).toBe(1);
  expect(mockedGetPortPromise.mock.calls.length).toBe(1);
});

it('starts up a source server with custom viewer', async () => {
  const validOut1 = await prepareServer({
    input: '/absolute/path/to/manifest/file.json',
    workspaceDir: '/absolute/path',
    httpServer: false,
    viewer: 'https://vivliostyle.vercel.app/',
  });
  maskConfig(validOut1);
  expect(validOut1.viewerFullUrl).toBe(
    'https://vivliostyle.vercel.app/#src=http://localhost:33333/to/manifest/file.json&bookMode=true&renderAllPages=true',
  );
  expect(mockedCreateServer.mock.calls.length).toBe(1);
  expect(mockedGetPortPromise.mock.calls.length).toBe(1);
});

it('starts up with no http server', async () => {
  const validOut1 = await prepareServer({
    input: '/absolute/path/to/manifest/file.json',
    workspaceDir: '/absolute/path',
    httpServer: false,
    viewer: 'file:///something/viewer',
  });
  maskConfig(validOut1);
  expect(validOut1.viewerFullUrl).toBe(
    'file:///something/viewer#src=file:///absolute/path/to/manifest/file.json&bookMode=true&renderAllPages=true',
  );
  expect(mockedCreateServer.mock.calls.length).toBe(0);
  expect(mockedGetPortPromise.mock.calls.length).toBe(0);
});
