import resolvePkg from 'resolve-pkg';
import upath from 'upath';
import { pathToFileURL, URL } from 'url';
import { isUrlString } from './util';

export type LoadMode = 'document' | 'book';
export type PageSize = { format: string } | { width: string; height: string };

export function getBrokerUrl({
  sourceIndex,
  loadMode = 'book',
  outputSize,
  style,
  userStyle,
}: {
  sourceIndex: string;
  loadMode?: LoadMode;
  outputSize?: PageSize;
  style?: string;
  userStyle?: string;
}) {
  let sourceUrl: URL;
  if (isUrlString(sourceIndex)) {
    sourceUrl = new URL(sourceIndex);
  } else {
    sourceUrl = pathToFileURL(sourceIndex);
  }

  const viewerUrl = new URL('file://');
  viewerUrl.pathname = upath.join(
    resolvePkg('@vivliostyle/viewer', { cwd: __dirname })!,
    'lib/index.html',
  );

  const pageSizeValue =
    outputSize &&
    ((outputSize as { format: string }).format ||
      `${(outputSize as { width: string }).width} ${
        (outputSize as { height: string }).height
      }`);

  let viewerParams = `src=${sourceUrl.href}&bookMode=${loadMode === 'book'}`;

  if (style) {
    viewerParams +=
      '&style=' + (isUrlString(style) ? style : pathToFileURL(style).href);
  }

  if (userStyle) {
    viewerParams +=
      '&userStyle=' +
      (isUrlString(userStyle) ? userStyle : pathToFileURL(userStyle).href);
  }

  if (pageSizeValue) {
    viewerParams +=
      '&userStyle=data:,/*<viewer>*/' +
      encodeURIComponent(`@page{size:${pageSizeValue}!important;}`) +
      '/*</viewer>*/';
  }

  return `${viewerUrl.href}#${viewerParams}`;
}
