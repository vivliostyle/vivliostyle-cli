import type { PluggableList } from 'unified';
import upath from 'upath';
import type {
  ContentsEntry,
  CoverEntry,
  ManuscriptEntry,
  ParsedEntry,
} from '../../config/resolve.js';
import { cover } from './cover.js';
import { toc } from './toc.js';

export function getRelPlugin(
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
): PluggableList {
  if (entry.rel === 'contents') {
    const contentsEntry = entry as ContentsEntry;
    const manuscriptEntries = entries.filter(
      (e): e is ManuscriptEntry => 'source' in e,
    );
    const distDir = upath.dirname(contentsEntry.target);
    return [
      [
        toc,
        {
          tocTitle: contentsEntry.tocTitle,
          entries: manuscriptEntries,
          distDir,
          sectionDepth: contentsEntry.sectionDepth,
          transform: contentsEntry.transform,
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
