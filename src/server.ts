import fs from 'node:fs';
import { URL } from 'node:url';
import upath from 'upath';
import {
  createServer,
  type InlineConfig,
  preview,
  type PreviewServer,
  type ResolvedConfig as ResolvedViteConfig,
  type ViteDevServer,
} from 'vite';
import type { ResolvedTaskConfig } from './config/resolve.js';
import type { ParsedVivliostyleInlineConfig } from './config/schema.js';
import { EMPTY_DATA_URI, VIEWER_ROOT_PATH } from './const.js';
import { Logger } from './logger.js';
import {
  getDefaultEpubOpfPath,
  isValidUri,
  openEpub,
  registerExitHandler,
} from './util.js';
import { vsBrowserPlugin } from './vite/vite-plugin-browser.js';
import { vsDevServerPlugin } from './vite/vite-plugin-dev-server.js';
import { vsStaticServePlugin } from './vite/vite-plugin-static-serve.js';
import { vsViewerPlugin } from './vite/vite-plugin-viewer.js';

export type ViewerUrlOption = Pick<
  ResolvedTaskConfig,
  | 'size'
  | 'cropMarks'
  | 'bleed'
  | 'cropOffset'
  | 'css'
  | 'customStyle'
  | 'customUserStyle'
  | 'singleDoc'
  | 'quick'
  | 'viewerParam'
  | 'base'
>;

export function getViewerParams(
  src: string | undefined,
  {
    size,
    cropMarks,
    bleed,
    cropOffset,
    css,
    customStyle,
    customUserStyle,
    singleDoc,
    quick,
    viewerParam,
    base,
  }: ViewerUrlOption,
): string {
  const pageSizeValue =
    size && ('format' in size ? size.format : `${size.width} ${size.height}`);

  function escapeParam(url: string) {
    return url.replace(/&/g, '%26');
  }

  let viewerParams = src ? `src=${escapeParam(src)}` : '';
  viewerParams += `&bookMode=${!singleDoc}&renderAllPages=${!quick}`;

  if (customStyle) {
    const param = isValidUri(customStyle)
      ? customStyle
      : upath.posix.join(base, customStyle);
    viewerParams += `&style=${escapeParam(param)}`;
  }

  if (customUserStyle) {
    const param = isValidUri(customUserStyle)
      ? customUserStyle
      : upath.posix.join(base, customUserStyle);
    viewerParams += `&userStyle=${escapeParam(param)}`;
  }

  if (pageSizeValue || cropMarks || bleed || cropOffset || css) {
    let pageStyle = '@page{';
    if (pageSizeValue) {
      pageStyle += `size:${pageSizeValue};`;
    }
    if (cropMarks) {
      pageStyle += `marks:crop cross;`;
    }
    if (bleed || cropMarks) {
      pageStyle += `bleed:${bleed ?? '3mm'};`;
    }
    if (cropOffset) {
      pageStyle += `crop-offset:${cropOffset};`;
    }
    pageStyle += '}';

    // The pageStyle settings are put between the `/*<viewer>*/` and `/*</viewer>*/`
    // in the `&style=data:,…` viewer parameter so that they are reflected in the
    // Settings menu of the Viewer. Also the custom CSS code is appended after the
    // `/*</viewer>*/` so that it is shown in the Edit CSS box in the Settings menu.
    viewerParams += `&style=data:,/*<viewer>*/${encodeURIComponent(
      pageStyle,
    )}/*</viewer>*/${encodeURIComponent(css ?? '')}`;
  }

  if (viewerParam) {
    // append additional viewer parameters
    viewerParams += `&${viewerParam}`;
  }

  return viewerParams;
}

export async function getSourceUrl({
  viewerInput,
  base,
  workspaceDir,
  rootUrl,
}: Pick<
  ResolvedTaskConfig,
  'viewerInput' | 'base' | 'workspaceDir' | 'rootUrl'
>) {
  let input: string;
  let isUrlPath = false;
  switch (viewerInput.type) {
    case 'webpub':
      input = viewerInput.manifestPath;
      break;
    case 'webbook':
      input = viewerInput.webbookEntryUrl;
      // webbookEntryUrl is already a URL path (e.g., "/vivliostyle/test.html")
      // or a full URL (e.g., "https://example.com/test.html")
      isUrlPath = !isValidUri(input);
      break;
    case 'epub-opf':
      input = viewerInput.epubOpfPath;
      break;
    case 'epub': {
      if (!fs.existsSync(viewerInput.epubTmpOutputDir)) {
        await openEpub(viewerInput.epubPath, viewerInput.epubTmpOutputDir);
      }
      input = getDefaultEpubOpfPath(viewerInput.epubTmpOutputDir);
      break;
    }
    default:
      input = viewerInput satisfies never;
  }
  return (
    isValidUri(input)
      ? new URL(input)
      : isUrlPath
        ? new URL(input, rootUrl)
        : new URL(
            upath.posix.join(base, upath.relative(workspaceDir, input)),
            rootUrl,
          )
  ).href;
}

export async function getViewerFullUrl({
  viewerInput,
  base,
  workspaceDir,
  rootUrl,
  viewer,
  ...config
}: ViewerUrlOption &
  Pick<
    ResolvedTaskConfig,
    'viewerInput' | 'base' | 'workspaceDir' | 'rootUrl' | 'viewer'
  >) {
  const viewerUrl = viewer
    ? new URL(viewer)
    : new URL(`${VIEWER_ROOT_PATH}/index.html`, rootUrl);
  const sourceUrl = await getSourceUrl({
    viewerInput,
    base,
    workspaceDir,
    rootUrl,
  });
  const viewerParams = getViewerParams(
    sourceUrl === EMPTY_DATA_URI
      ? undefined // open Viewer start page
      : sourceUrl,
    { base, ...config },
  );
  viewerUrl.hash = '';
  return `${viewerUrl.href}#${viewerParams}`;
}

export async function createViteServer(args: {
  config: ResolvedTaskConfig;
  viteConfig: ResolvedViteConfig;
  inlineConfig: ParsedVivliostyleInlineConfig;
  mode: 'preview';
}): Promise<ViteDevServer>;
export async function createViteServer(args: {
  config: ResolvedTaskConfig;
  viteConfig: ResolvedViteConfig;
  inlineConfig: ParsedVivliostyleInlineConfig;
  mode: 'build';
}): Promise<PreviewServer>;
export async function createViteServer({
  config,
  viteConfig,
  inlineConfig,
  mode,
}: {
  config: ResolvedTaskConfig;
  viteConfig: ResolvedViteConfig;
  inlineConfig: ParsedVivliostyleInlineConfig;
  mode: 'preview' | 'build';
}) {
  const viteInlineConfig = {
    clearScreen: false,
    configFile: false,
    appType: 'custom',
    plugins: [
      vsDevServerPlugin({ config, inlineConfig }),
      vsViewerPlugin({ config, inlineConfig }),
      vsBrowserPlugin({ config, inlineConfig }),
      vsStaticServePlugin({ config, inlineConfig }),
    ],
    server: viteConfig.server,
    preview: viteConfig.preview,
    customLogger: viteConfig.customLogger,
    cacheDir: viteConfig.cacheDir,
    root: viteConfig.root,
  } satisfies InlineConfig;
  Logger.debug('createViteServer > viteInlineConfig %O', viteInlineConfig);

  if (config.serverRootDir === config.workspaceDir) {
    const { cacheDir } = viteInlineConfig;
    registerExitHandler('Removing the Vite cacheDir', () => {
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true });
      }
    });
  }

  if (mode === 'preview') {
    return await createServer(viteInlineConfig);
  } else {
    return await preview(viteInlineConfig);
  }
}
