import resolvePkg from 'resolve-pkg';
import upath from 'upath';
import { URL } from 'url';

export type LoadMode = 'document' | 'book';
export type PageSize = { format: string } | { width: string; height: string };

export function getBrokerUrl({
  sourceIndex,
  loadMode = 'book',
  outputSize,
}: {
  sourceIndex: string;
  loadMode?: LoadMode;
  outputSize?: PageSize;
}) {
  let sourceUrl: URL;
  if (/https?:\/\//.test(sourceIndex)) {
    sourceUrl = new URL(sourceIndex);
  } else {
    sourceUrl = new URL('file://');
    sourceUrl.pathname = sourceIndex;
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

  if (pageSizeValue) {
    viewerParams +=
      '&userStyle=data:,/*<viewer>*/' +
      encodeURIComponent(`@page{size:${pageSizeValue}!important;}`) +
      '/*</viewer>*/';
  }

  return `${viewerUrl.href}#${viewerParams}`;
}
