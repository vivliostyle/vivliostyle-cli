import path from 'upath';
import { URL } from 'url';
import { encodeHashParameter } from './util';

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

  const brokerUrl = new URL('file://');
  brokerUrl.pathname = path.resolve(__dirname, '../broker/index.html');
  const hashParam = encodeHashParameter({
    src: sourceUrl.href,
    loadMode,
    ...outputSize,
  });
  return `${brokerUrl.href}#${hashParam}`;
}
