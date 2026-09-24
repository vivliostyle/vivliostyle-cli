import fs from 'node:fs';
import os from 'node:os';

import decamelize from 'decamelize';
import upath from 'upath';
import { v1 as uuid } from 'uuid';

import type { PdfOutput, ResolvedTaskConfig } from '../config/resolve.js';
import {
  collectVolumeArgs,
  runContainer,
  toContainerPath,
} from '../container.js';
import type { CMYKValue, CmykMap, Meta, TOCItem } from '../global-viewer.js';
import { Logger } from '../logger.js';
import { importNodeModule } from '../node-modules.js';
import { executeWithCleanupOnInterrupt, isInContainer } from '../util.js';
import { createCmykColorHook } from './cmyk.js';
import { createReplaceImageHook } from './image.js';
import { createOutputIntentHook } from './output-intent.js';
import {
  createPdfDocumentHook,
  type PageSizeData,
  type PDFMetadataOptions,
  resolvePdfMetadata,
} from './pdf-document.js';
import { editPdf } from './pdf-visitor.js';

export type SaveOption = Pick<
  PdfOutput,
  'preflight' | 'preflightOption' | 'cmyk' | 'replaceImage' | 'outputIntent'
> &
  Pick<ResolvedTaskConfig, 'image'> & {
    cmykMap: CmykMap;
    signal?: AbortSignal;
  };

export type PostProcessOptions = SaveOption & {
  pdf: Uint8Array;
  output: string;
  metadata?: Meta;
  metadataOptions?: PDFMetadataOptions;
  tocItems?: TOCItem[];
  pageSizeData?: PageSizeData[];
};

export async function pressReadyWithContainer({
  input,
  output,
  preflightOption,
  image,
  signal,
}: {
  input: string;
  output: string;
  preflightOption: string[];
  image: string;
  signal?: AbortSignal;
}): Promise<void> {
  await runContainer({
    image,
    entrypoint: 'press-ready',
    userVolumeArgs: collectVolumeArgs([
      upath.dirname(input),
      upath.dirname(output),
    ]),
    commandArgs: [
      'build',
      '-i',
      toContainerPath(input),
      '-o',
      toContainerPath(output),
      ...preflightOption
        .map((opt) => `--${decamelize(opt, { separator: '-' })}`)
        .filter((str) => /^[\w\-]+/v.test(str)),
    ],
    signal,
  });
}

export async function postProcessPDF({
  pdf: sourcePdf,
  output,
  metadata,
  metadataOptions,
  tocItems,
  pageSizeData,
  preflight,
  preflightOption,
  image,
  cmyk: cmykConfig,
  cmykMap,
  replaceImage: replaceImageConfig,
  outputIntent,
  signal,
}: PostProcessOptions): Promise<void> {
  let pdf = sourcePdf;
  signal?.throwIfAborted();

  const mergedMap = new Map<string, CMYKValue>([
    ...Object.entries(cmykMap),
    ...(cmykConfig ? cmykConfig.overrideMap : []).map(
      ([{ r, g, b }, cmyk]) => [JSON.stringify([r, g, b]), cmyk] as const,
    ),
  ]);
  if (cmykConfig && cmykConfig.mapOutput) {
    const mapOutputDir = upath.dirname(cmykConfig.mapOutput);
    await fs.promises.mkdir(mapOutputDir, { recursive: true });
    await fs.promises.writeFile(
      cmykConfig.mapOutput,
      JSON.stringify(Object.fromEntries(mergedMap), null, 2),
    );
    Logger.logInfo(`CMYK color map saved to ${cmykConfig.mapOutput}`);
  }

  const replacesColors =
    cmykConfig && (mergedMap.size > 0 || cmykConfig.fallback !== undefined);
  const replacesImages = replaceImageConfig.length > 0;
  if (replacesColors && replacesImages) {
    Logger.logInfo('Converting CMYK colors and replacing images');
  } else if (replacesColors) {
    Logger.logInfo('Converting CMYK colors');
  } else if (replacesImages) {
    Logger.logInfo('Replacing images');
  }

  const failures: string[] = [];

  const cmykColorHook = cmykConfig
    ? createCmykColorHook(
        mergedMap,
        cmykConfig.fallback,
        cmykConfig ? cmykConfig.ifUnmappedColorsFound : 'ignore',
        failures,
      )
    : {};

  const outputIntentHook =
    outputIntent === undefined ? {} : createOutputIntentHook(outputIntent);
  const documentHook = createPdfDocumentHook({
    metadata:
      metadata === undefined
        ? undefined
        : resolvePdfMetadata(metadata, metadataOptions),
    tocItems: tocItems && tocItems.length > 0 ? tocItems : undefined,
    pageSizeData,
  });

  const replaceImageHook = createReplaceImageHook(
    replaceImageConfig,
    cmykConfig ? cmykConfig.ifIncompatibleImagesFound : 'ignore',
    failures,
  );
  pdf = await editPdf(
    pdf,
    [documentHook, cmykColorHook, replaceImageHook, outputIntentHook],
    { signal },
  );
  signal?.throwIfAborted();

  if (failures.length > 0) {
    throw new Error(failures.join('; '));
  }

  if (preflight) {
    const input = upath.join(os.tmpdir(), `vivliostyle-cli-${uuid()}.pdf`);
    await executeWithCleanupOnInterrupt(
      `Removing temporary preflight input: ${input}`,
      async () => {
        await fs.promises.writeFile(input, pdf);
        signal?.throwIfAborted();

        if (
          preflight === 'press-ready-local' ||
          (preflight === 'press-ready' && isInContainer())
        ) {
          using _ = Logger.suspendLogging('Running press-ready');
          const { build } = await importNodeModule('press-ready');
          await build({
            ...preflightOption.reduce<Record<string, boolean>>((acc, opt) => {
              const optName = decamelize(opt, { separator: '-' });
              if (optName.startsWith('no-')) {
                acc[optName.slice(3)] = false;
              } else {
                acc[optName] = true;
              }
              return acc;
            }, {}),
            input,
            output,
          });
        } else if (preflight === 'press-ready') {
          using _ = Logger.suspendLogging('Running press-ready');
          await pressReadyWithContainer({
            input,
            output,
            preflightOption,
            image,
            signal,
          });
        }
      },
      async () => {
        await fs.promises.rm(input, { force: true });
      },
    );
  } else {
    signal?.throwIfAborted();
    await fs.promises.writeFile(output, pdf);
  }
}
