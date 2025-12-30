import type * as mupdfType from 'mupdf';
import type { CmykMap } from '../global-viewer.js';
import { Logger } from '../logger.js';
import { importNodeModule } from '../node-modules.js';

const SRGB_MAX = 10000;
const CMYK_MAX = 10000;

interface Destroyable {
  destroy(): void;
}

interface Closeable extends Destroyable {
  close(): void;
}

function disposable<T extends Destroyable>(obj: T): T & Disposable {
  return Object.assign(obj, {
    [Symbol.dispose]() {
      obj.destroy();
    },
  });
}

function disposableDevice<T extends Closeable>(obj: T): T & Disposable {
  return Object.assign(obj, {
    [Symbol.dispose]() {
      obj.close();
      obj.destroy();
    },
  });
}

function formatRgbKey(color: number[]): string {
  const [r, g, b] = color.map((v) => Math.round(v * SRGB_MAX));
  return JSON.stringify({ r, g, b });
}

function isRGB(colorspace: mupdfType.ColorSpace | null): boolean {
  if (!colorspace) return false;
  const type = colorspace.getType();
  return type === 'RGB' || type === 'BGR';
}

function normalizeToRgb(
  color: number[],
  colorspace: mupdfType.ColorSpace | null,
): number[] {
  if (colorspace?.getType() === 'BGR') {
    return [color[2], color[1], color[0]];
  }
  return color;
}

type ColorTable = Map<string, [number, number, number, number]>;

function lookupColor(
  colorTable: ColorTable,
  rgb: number[],
): [number, number, number, number] | null {
  const key = JSON.stringify(rgb.map((v) => Math.round(v * SRGB_MAX)));
  return colorTable.get(key) ?? null;
}

export async function convertCmykColors({
  pdf,
  colorMap,
  warnUnmapped,
}: {
  pdf: Uint8Array;
  colorMap: CmykMap;
  warnUnmapped: boolean;
}): Promise<Uint8Array> {
  const mupdf = await importNodeModule('mupdf');

  const colorTable = new Map<string, [number, number, number, number]>();
  const warnedColors = new Set<string>();

  function warnUnmappedColor(rgb: number[]): void {
    if (!warnUnmapped) return;
    const key = formatRgbKey(rgb);
    if (warnedColors.has(key)) return;
    warnedColors.add(key);
    Logger.logWarn(`RGB color not mapped to CMYK: ${key}`);
  }

  for (const [key, value] of Object.entries(colorMap)) {
    colorTable.set(key, [
      value.c / CMYK_MAX,
      value.m / CMYK_MAX,
      value.y / CMYK_MAX,
      value.k / CMYK_MAX,
    ]);
  }

  using doc = disposable(mupdf.Document.openDocument(pdf, 'application/pdf'));
  using outputBuffer = disposable(new mupdf.Buffer());
  using writer = disposable(new mupdf.DocumentWriter(outputBuffer, 'pdf', ''));

  const pageCount = doc.countPages();
  for (let i = 0; i < pageCount; i++) {
    using page = disposable(doc.loadPage(i));
    const mediabox = page.getBounds();
    using outDevice = disposableDevice(writer.beginPage(mediabox));
    using convertDevice = disposableDevice(
      new mupdf.Device({
        fillPath(path, evenOdd, ctm, colorspace, color, alpha) {
          if (isRGB(colorspace)) {
            const rgb = normalizeToRgb(color, colorspace);
            const cmyk = lookupColor(colorTable, rgb);
            if (cmyk) {
              outDevice.fillPath(
                path,
                evenOdd,
                ctm,
                mupdf.ColorSpace.DeviceCMYK,
                cmyk,
                alpha,
              );
              return;
            }
            warnUnmappedColor(rgb);
          }
          outDevice.fillPath(
            path,
            evenOdd,
            ctm,
            colorspace,
            color as mupdfType.Color,
            alpha,
          );
        },

        strokePath(path, stroke, ctm, colorspace, color, alpha) {
          if (isRGB(colorspace)) {
            const rgb = normalizeToRgb(color, colorspace);
            const cmyk = lookupColor(colorTable, rgb);
            if (cmyk) {
              outDevice.strokePath(
                path,
                stroke,
                ctm,
                mupdf.ColorSpace.DeviceCMYK,
                cmyk,
                alpha,
              );
              return;
            }
            warnUnmappedColor(rgb);
          }
          outDevice.strokePath(
            path,
            stroke,
            ctm,
            colorspace,
            color as mupdfType.Color,
            alpha,
          );
        },

        clipPath(path, evenOdd, ctm) {
          outDevice.clipPath(path, evenOdd, ctm);
        },

        clipStrokePath(path, stroke, ctm) {
          outDevice.clipStrokePath(path, stroke, ctm);
        },

        fillText(text, ctm, colorspace, color, alpha) {
          if (isRGB(colorspace)) {
            const rgb = normalizeToRgb(color, colorspace);
            const cmyk = lookupColor(colorTable, rgb);
            if (cmyk) {
              outDevice.fillText(
                text,
                ctm,
                mupdf.ColorSpace.DeviceCMYK,
                cmyk,
                alpha,
              );
              return;
            }
            warnUnmappedColor(rgb);
          }
          outDevice.fillText(
            text,
            ctm,
            colorspace,
            color as mupdfType.Color,
            alpha,
          );
        },

        strokeText(text, stroke, ctm, colorspace, color, alpha) {
          if (isRGB(colorspace)) {
            const rgb = normalizeToRgb(color, colorspace);
            const cmyk = lookupColor(colorTable, rgb);
            if (cmyk) {
              outDevice.strokeText(
                text,
                stroke,
                ctm,
                mupdf.ColorSpace.DeviceCMYK,
                cmyk,
                alpha,
              );
              return;
            }
            warnUnmappedColor(rgb);
          }
          outDevice.strokeText(
            text,
            stroke,
            ctm,
            colorspace,
            color as mupdfType.Color,
            alpha,
          );
        },

        clipText(text, ctm) {
          outDevice.clipText(text, ctm);
        },

        clipStrokeText(text, stroke, ctm) {
          outDevice.clipStrokeText(text, stroke, ctm);
        },

        ignoreText(text, ctm) {
          outDevice.ignoreText(text, ctm);
        },

        fillShade(shade, ctm, alpha) {
          outDevice.fillShade(shade, ctm, alpha);
        },

        fillImage(image, ctm, alpha) {
          outDevice.fillImage(image, ctm, alpha);
        },

        fillImageMask(image, ctm, colorspace, color, alpha) {
          if (isRGB(colorspace)) {
            const rgb = normalizeToRgb(color, colorspace);
            const cmyk = lookupColor(colorTable, rgb);
            if (cmyk) {
              outDevice.fillImageMask(
                image,
                ctm,
                mupdf.ColorSpace.DeviceCMYK,
                cmyk,
                alpha,
              );
              return;
            }
            warnUnmappedColor(rgb);
          }
          outDevice.fillImageMask(
            image,
            ctm,
            colorspace,
            color as mupdfType.Color,
            alpha,
          );
        },

        clipImageMask(image, ctm) {
          outDevice.clipImageMask(image, ctm);
        },

        popClip() {
          outDevice.popClip();
        },

        beginMask(bbox, luminosity, colorspace, color) {
          if (isRGB(colorspace)) {
            const rgb = normalizeToRgb(color, colorspace);
            const cmyk = lookupColor(colorTable, rgb);
            if (cmyk) {
              outDevice.beginMask(
                bbox,
                luminosity,
                mupdf.ColorSpace.DeviceCMYK,
                cmyk,
              );
              return;
            }
            warnUnmappedColor(rgb);
          }
          outDevice.beginMask(
            bbox,
            luminosity,
            colorspace,
            color as mupdfType.Color,
          );
        },

        endMask() {
          outDevice.endMask();
        },

        beginGroup(bbox, colorspace, isolated, knockout, blendmode, alpha) {
          outDevice.beginGroup(
            bbox,
            colorspace,
            isolated,
            knockout,
            blendmode,
            alpha,
          );
        },

        endGroup() {
          outDevice.endGroup();
        },

        beginTile(area, view, xstep, ystep, ctm, id) {
          return outDevice.beginTile(area, view, xstep, ystep, ctm, id);
        },

        endTile() {
          outDevice.endTile();
        },

        beginLayer(name) {
          outDevice.beginLayer(name);
        },

        endLayer() {
          outDevice.endLayer();
        },
      }),
    );
    page.run(convertDevice, mupdf.Matrix.identity);
    writer.endPage();
  }

  writer.close();
  // Create a copy to ensure the data remains valid after the buffer is destroyed
  return new Uint8Array(outputBuffer.asUint8Array());
}
