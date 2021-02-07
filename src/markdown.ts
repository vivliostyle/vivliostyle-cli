import { StringifyMarkdownOptions, VFM } from '@vivliostyle/vfm';
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
  const vfm = VFM(options);
  const processed = vfm.processSync(
    vfile({ path: filepath, contents: fs.readFileSync(filepath, 'utf8') }),
  ) as VSFile;
  return processed;
}
