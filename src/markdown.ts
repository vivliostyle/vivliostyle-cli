import { StringifyMarkdownOptions, VFM } from '@vivliostyle/vfm';
import vfile from 'to-vfile';
import { VFile } from 'vfile';

export interface VFMFile extends VFile {
  data: {
    title?: string;
    theme?: string;
    toc: boolean;
  };
}

export function processMarkdown(
  filepath: string,
  options: StringifyMarkdownOptions = {},
): VFMFile {
  const vfm = VFM(options);
  const processed = vfm.processSync(vfile.readSync(filepath)) as VFMFile;
  return processed;
}
