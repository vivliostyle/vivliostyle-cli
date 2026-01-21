import type { PluggableList } from 'unified';
import upath from 'upath';
import type {
  ContentsEntry,
  CoverEntry,
  ManuscriptEntry,
  ParsedEntry,
} from '../../config/resolve.js';
import { cover } from './cover.js';
import { generateTocContent, toc } from './toc.js';

export async function getRelPlugin(
  entry: ParsedEntry,
  {
    entries,
    manifestPath,
    entryContextDir,
    workspaceDir,
  }: {
    entries: ParsedEntry[];
    manifestPath: string;
    entryContextDir: string;
    workspaceDir: string;
  },
): Promise<PluggableList> {
  if (entry.rel === 'contents') {
    const contentsEntry = entry as ContentsEntry;
    const manuscriptEntries = entries.filter(
      (e): e is ManuscriptEntry => 'source' in e,
    );
    const distDir = upath.dirname(contentsEntry.target);
    const tocContent = await generateTocContent({
      entries: manuscriptEntries,
      distDir,
      sectionDepth: contentsEntry.sectionDepth,
      transform: contentsEntry.transform,
    });
    return [
      [
        toc,
        {
          tocTitle: contentsEntry.tocTitle,
          tocContent,
          manifestPath: upath.relative(distDir, manifestPath),
          pageBreakBefore: contentsEntry.pageBreakBefore,
          pageCounterReset: contentsEntry.pageCounterReset,
        },
      ],
    ];
  }

  if (entry.rel === 'cover') {
    const coverEntry = entry as CoverEntry;
    const imageSrc = upath.relative(
      upath.join(
        entryContextDir,
        upath.relative(workspaceDir, coverEntry.target),
        '..',
      ),
      coverEntry.coverImageSrc,
    );
    return [
      [
        cover,
        {
          src: imageSrc,
          alt: coverEntry.coverImageAlt,
          pageBreakBefore: coverEntry.pageBreakBefore,
        },
      ],
    ];
  }

  return [];
}
