import {
  Metadata,
  readMetadata,
  StringifyMarkdownOptions,
  VFM,
} from '@vivliostyle/vfm';
import fs from 'fs';
import vfile, { VFile } from 'vfile';

export interface VSFile extends VFile {
  data: {
    title?: string;
    theme?: string;
  };
}

export function processMarkdown(
  filepath: string,
  options: StringifyMarkdownOptions = {},
): VSFile {
  const markdownString = fs.readFileSync(filepath, 'utf8');
  const vfm = VFM(options, readMetadata(markdownString));
  const processed = vfm.processSync(
    vfile({ path: filepath, contents: markdownString }),
  ) as VSFile;
  return processed;
}

export function readMarkdownMetadata(filepath: string): Metadata {
  return readMetadata(fs.readFileSync(filepath, 'utf8'));
}
