import { JSDOM } from '@vivliostyle/jsdom';
import supertest from 'supertest';
import { ViteDevServer } from 'vite';
import { assert, describe, expect, it, vi } from 'vitest';
import {
  createServerMiddleware,
  resolveFixture,
  runCommand,
} from './command-util.js';

const mockedBrowserModule = vi.hoisted(() => ({
  getExecutableBrowserPath: vi.fn().mockReturnValue('myBrowser'),
  launchPreview: vi.fn().mockResolvedValue({
    page: {
      on: vi.fn(),
      bringToFront: vi.fn(),
      locator: vi.fn().mockReturnValue({
        focus: vi.fn(),
      }),
    },
    browser: {
      close: vi.fn(),
    },
  }),
}));

vi.mock('../src/browser', () => mockedBrowserModule);

const launchPreviewSpy = vi.spyOn(mockedBrowserModule, 'launchPreview');

const parseUrlParams = (url: string) =>
  Object.fromEntries(
    url
      .slice(url.indexOf('#') + 1)
      .split('&')
      .map((p) => p.split('=', 2) as [string, string]),
  );

describe('vite-plugin-dev-server', () => {
  it('serves single document', async () => {
    const middleware = await createServerMiddleware({
      cwd: resolveFixture('server'),
      config: {
        entry: 'main.md',
        workspaceDir: '.vs-dev-server-single-doc',
      },
    });
    const manifestResponse = await supertest(middleware)
      .get('/vivliostyle/publication.json')
      .expect(200);
    expect(manifestResponse.headers['content-type']).toBe('application/json');
    expect(manifestResponse.body).toMatchObject({
      readingOrder: [{ url: 'main.html', name: 'yuno' }],
    });

    const contentResponse = await supertest(middleware)
      .get('/vivliostyle/main.html')
      .expect(200);
    expect(contentResponse.headers['content-type']).toBe(
      'text/html;charset=utf-8',
    );
    expect(contentResponse.text).toContain('<title>yuno</title>');
  });

  it('serves ToC page', async () => {
    const middleware = await createServerMiddleware({
      cwd: resolveFixture('server'),
      config: {
        entry: 'main.md',
        workspaceDir: '.vs-dev-server-toc',
        toc: { sectionDepth: 6 },
      },
    });
    const manifestResponse = await supertest(middleware)
      .get('/vivliostyle/publication.json')
      .expect(200);
    expect(manifestResponse.body).toMatchObject({
      readingOrder: [
        { url: 'index.html', rel: 'contents' },
        { url: 'main.html', name: 'yuno' },
      ],
    });

    const tocResponse = await supertest(middleware)
      .get('/vivliostyle/index.html')
      .expect(200);
    const { document } = new JSDOM(tocResponse.text).window;
    expect(document.querySelector('link[rel="publication"]').href).toBe(
      'publication.json',
    );
    expect(
      document.querySelector('nav li[data-section-level="2"]>a').textContent,
    ).toBe('H2');
    expect(
      document.querySelector('nav li[data-section-level="3"]>a').textContent,
    ).toBe('H3');
  });

  it('serves document with theme', async () => {
    const middleware = await createServerMiddleware({
      cwd: resolveFixture('server'),
      config: {
        entry: 'main.md',
        workspaceDir: '.vs-dev-server-theme',
        theme: ['theme.css', '../themes/debug-theme'],
      },
    });
    const contentResponse = await supertest(middleware)
      .get('/vivliostyle/main.html')
      .expect(200);
    const { document } = new JSDOM(contentResponse.text).window;
    expect(
      document.querySelector('link[rel="stylesheet"][href="theme.css"]'),
    ).toBeTruthy();
    expect(
      document.querySelector(
        'link[rel="stylesheet"][href="themes/node_modules/debug-theme/theme.css"]',
      ),
    ).toBeTruthy();

    const contents = [
      '/theme.css',
      '/themes/node_modules/debug-theme/theme.css',
    ];
    for (const content of contents) {
      const response = await supertest(middleware)
        .get(`/vivliostyle${content}`)
        .expect(200);
      expect(response.headers['content-type']).toBe('text/css');
    }
  });

  it('serves assets', async () => {
    const middleware = await createServerMiddleware({
      cwd: resolveFixture('server'),
      config: {
        entry: 'main.md',
        workspaceDir: '.vs-dev-server-assets',
        copyAsset: {
          includes: ['assets/incl/**/*'],
          excludes: ['assets/excl/**/*'],
          includeFileExtensions: ['jxl'],
          excludeFileExtensions: ['svg'],
        },
      },
    });

    await supertest(middleware)
      .get('/vivliostyle/assets/incl/test.txt')
      .expect(200);
    await supertest(middleware)
      .get('/vivliostyle/assets/sunset_logo.jxl')
      .expect(200);
    const shouldNotExist = [
      '/vivliostyle/assets/excl/vivliostyle-icon.png',
      '/vivliostyle/assets/empty.svg',
    ];
    for (const path of shouldNotExist) {
      await supertest(middleware).get(path).expect(404);
    }
  });
});

describe('vite-plugin-viewer', () => {
  it('serves index page with HMR', async () => {
    const middleware = await createServerMiddleware({
      cwd: resolveFixture('server'),
      input: 'https://example.com',
    });
    const response = await supertest(middleware)
      .get(`/__vivliostyle-viewer/index.html`)
      .expect(200);
    expect(response.text).toContain(
      '<script type="module" src="/@vivliostyle:viewer:client"></script>',
    );
  });

  it('servers HMR client', async () => {
    const middleware = await createServerMiddleware({
      cwd: resolveFixture('server'),
      input: 'https://example.com',
    });
    const response = await supertest(middleware)
      .get(`/@vivliostyle:viewer:client`)
      .expect(200);
    expect(response.text).toContain('import.meta.hot');
  });

  it('serves viewer contents', async () => {
    const middleware = await createServerMiddleware({
      cwd: resolveFixture('server'),
      input: 'https://example.com',
    });
    const contents = [
      '/js/vivliostyle-viewer.js',
      '/css/vivliostyle-viewer.css',
    ];
    for (const content of contents) {
      const response = await supertest(middleware)
        .get(`/__vivliostyle-viewer${content}`)
        .expect(200);
      expect(response.body).toBeTruthy();
    }
  });
});

describe('vite-plugin-static-serve', () => {
  it('serves static files', async () => {
    const middleware = await createServerMiddleware({
      cwd: resolveFixture('server'),
      config: {
        entry: 'main.md',
        workspaceDir: '.vs-dev-server-static-serve',
        static: {
          '/root': ['dist/root1', 'dist/root2'],
        },
      },
    });

    const rootHtmlResponse = await supertest(middleware)
      .get('/root/index.html')
      .expect(200);
    expect(rootHtmlResponse.text).toContain('<title>Root1</title>');
  });
});

describe('vite-plugin-browser', () => {
  it('launches viewer start page', async () => {
    const ret = (await runCommand(['preview'], {
      cwd: resolveFixture('server'),
    })) as ViteDevServer;
    assert(ret.resolvedUrls);
    expect(launchPreviewSpy).toHaveBeenCalledOnce();
    expect(launchPreviewSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `${ret.resolvedUrls.local[0]}__vivliostyle-viewer/index.html#&bookMode=true&renderAllPages=true`,
      }),
    );
  });

  it('launches webbook with custom style options', async () => {
    await runCommand(
      [
        'preview',
        'https://example.com',
        '-d',
        '-q',
        '--style',
        'data:,#test>p::before{content:"エスケープ チェック";display:block}',
        '--user-style',
        'file://path/to/local/style/file/which/might/include/white space/&/special#?%character.css',
        '--viewer-param',
        'allowScripts=false&pixelRatio=16',
      ],
      {
        cwd: resolveFixture('server'),
      },
    );
    expect(launchPreviewSpy).toHaveBeenCalledOnce();
    const { url } = launchPreviewSpy.mock.calls[0][0];
    expect(parseUrlParams(url)).toMatchObject({
      src: 'https://example.com/',
      bookMode: 'false',
      renderAllPages: 'false',
      style:
        'data:,#test>p::before{content:"エスケープ チェック";display:block}',
      userStyle:
        'file://path/to/local/style/file/which/might/include/white space/%26/special#?%character.css',
      allowScripts: 'false',
      pixelRatio: '16',
    });
  });

  it('launches single document with CSS options', async () => {
    await runCommand(
      [
        'preview',
        '-s',
        '5in,10in',
        '-m',
        '--bleed',
        '10q',
        '--crop-offset',
        '8pt',
        '--css',
        ':root{--color:#ABC}',
      ],
      {
        cwd: resolveFixture('server'),
        config: {
          entry: 'main.md',
          workspaceDir: '.vs-browser-css-options',
        },
      },
    );
    expect(launchPreviewSpy).toHaveBeenCalledOnce();
    const { url } = launchPreviewSpy.mock.calls[0][0];
    expect(parseUrlParams(url)).toMatchObject({
      style:
        'data:,/*<viewer>*/%40page%7Bsize%3A5in%2010in%3Bmarks%3Acrop%20cross%3Bbleed%3A10q%3Bcrop-offset%3A8pt%3B%7D/*</viewer>*/%3Aroot%7B--color%3A%23ABC%7D',
    });
  });
});
