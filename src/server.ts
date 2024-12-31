import { URL } from 'node:url';
import upath from 'upath';
import {
  createServer,
  InlineConfig,
  mergeConfig as mergeViteConfig,
  preview,
  PreviewServer,
  ViteDevServer,
} from 'vite';
import { ResolvedTaskConfig } from './config/resolve.js';
import { InlineOptions } from './config/schema.js';
import { prepareViteConfig } from './config/vite.js';
import { VIEWER_ROOT_PATH } from './const.js';
import { isValidUri } from './util.js';
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
    viewerParams += `&style=${escapeParam(customStyle)}`;
  }

  if (customUserStyle) {
    viewerParams += `&userStyle=${escapeParam(customUserStyle)}`;
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

export function getSourceUrl({
  viewerInput,
  base,
  workspaceDir,
  rootUrl,
}: Pick<
  ResolvedTaskConfig,
  'viewerInput' | 'base' | 'workspaceDir' | 'rootUrl'
>) {
  const input = (() => {
    switch (viewerInput.type) {
      case 'webpub':
        return viewerInput.manifestPath;
      case 'webbook':
        return viewerInput.webbookEntryUrl;
      case 'epub-opf':
        return viewerInput.epubOpfPath;
      case 'epub':
        throw new Error('TODO');
      default:
        return viewerInput satisfies never;
    }
  })();
  return (
    isValidUri(input)
      ? new URL(input)
      : new URL(
          upath.posix.join(base, upath.relative(workspaceDir, input)),
          rootUrl,
        )
  ).href;
}

export function getViewerFullUrl({
  viewerInput,
  base,
  workspaceDir,
  rootUrl,
  ...config
}: ViewerUrlOption &
  Pick<
    ResolvedTaskConfig,
    'viewerInput' | 'base' | 'workspaceDir' | 'rootUrl'
  >) {
  const input = (() => {
    switch (viewerInput.type) {
      case 'webpub':
        return viewerInput.manifestPath;
      case 'webbook':
        return viewerInput.webbookEntryUrl;
      case 'epub-opf':
        return viewerInput.epubOpfPath;
      case 'epub':
        throw new Error('TODO');
      default:
        return viewerInput satisfies never;
    }
  })();
  const viewerUrl = new URL(`${VIEWER_ROOT_PATH}/index.html`, rootUrl);
  const sourceUrl = getSourceUrl({ viewerInput, base, workspaceDir, rootUrl });
  const viewerParams = getViewerParams(
    input === 'data:,'
      ? undefined // open Viewer start page
      : sourceUrl,
    config,
  );
  viewerUrl.hash = viewerParams;
  return viewerUrl.href;
}

export async function createViteServer(args: {
  config: ResolvedTaskConfig;
  inlineOptions: InlineOptions;
  mode: 'preview';
}): Promise<ViteDevServer>;
export async function createViteServer(args: {
  config: ResolvedTaskConfig;
  inlineOptions: InlineOptions;
  mode: 'build';
}): Promise<PreviewServer>;
export async function createViteServer({
  config,
  inlineOptions: options,
  mode,
}: {
  config: ResolvedTaskConfig;
  inlineOptions: InlineOptions;
  mode: 'preview' | 'build';
}) {
  let { viteConfig } = await prepareViteConfig({ ...config, mode });
  viteConfig = mergeViteConfig(viteConfig, {
    clearScreen: false,
    configFile: false,
    appType: 'custom',
    plugins: [
      vsDevServerPlugin({ config, options }),
      vsViewerPlugin({ config, options }),
      vsBrowserPlugin({ config, options }),
      vsStaticServePlugin({ config, options }),
    ],
    server: viteConfig.server ?? config.server,
  } satisfies InlineConfig);

  if (mode === 'preview') {
    return await createServer(viteConfig);
  } else {
    return await preview(viteConfig);
  }
}
