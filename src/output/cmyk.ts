import type * as mupdf from 'mupdf';
import type { CmykMap } from '../global-viewer.js';
import { Logger } from '../logger.js';
import { importNodeModule } from '../node-modules.js';

const PRECISION = 10000;

export async function convertCmykColors({
  pdf,
  cmykMap,
  warnUnmapped,
}: {
  pdf: Uint8Array;
  cmykMap: CmykMap;
  warnUnmapped: boolean;
}): Promise<Uint8Array> {
  const mupdf = await importNodeModule('mupdf');

  const colorTable = new Map<string, [number, number, number, number]>();
  for (const [key, value] of Object.entries(cmykMap)) {
    colorTable.set(key, [
      value.c / PRECISION,
      value.m / PRECISION,
      value.y / PRECISION,
      value.k / PRECISION,
    ]);
  }

  function lookupColor(rgb: number[]): [number, number, number, number] | null {
    const key = JSON.stringify(rgb.map((v) => Math.round(v * PRECISION)));
    return colorTable.get(key) ?? null;
  }

  function isRGB(colorspace: mupdf.ColorSpace | null): boolean {
    if (!colorspace) return false;
    const type = colorspace.getType();
    return type === 'RGB' || type === 'BGR';
  }

  function createColorConvertingDevice(
    outDevice: mupdf.Device,
  ): ConstructorParameters<typeof mupdf.Device>[0] {
    return {
      fillPath(path, evenOdd, ctm, colorspace, color, alpha) {
        if (isRGB(colorspace)) {
          const cmyk = lookupColor(color);
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
          if (warnUnmapped) {
            Logger.logWarn(`RGB color not mapped to CMYK: ${color.join(' ')}`);
          }
        }
        outDevice.fillPath(
          path,
          evenOdd,
          ctm,
          colorspace,
          color as mupdf.Color,
          alpha,
        );
      },

      strokePath(path, stroke, ctm, colorspace, color, alpha) {
        if (isRGB(colorspace)) {
          const cmyk = lookupColor(color);
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
          if (warnUnmapped) {
            Logger.logWarn(`RGB color not mapped to CMYK: ${color.join(' ')}`);
          }
        }
        outDevice.strokePath(
          path,
          stroke,
          ctm,
          colorspace,
          color as mupdf.Color,
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
          const cmyk = lookupColor(color);
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
          if (warnUnmapped) {
            Logger.logWarn(`RGB color not mapped to CMYK: ${color.join(' ')}`);
          }
        }
        outDevice.fillText(text, ctm, colorspace, color as mupdf.Color, alpha);
      },

      strokeText(text, stroke, ctm, colorspace, color, alpha) {
        if (isRGB(colorspace)) {
          const cmyk = lookupColor(color);
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
          if (warnUnmapped) {
            Logger.logWarn(`RGB color not mapped to CMYK: ${color.join(' ')}`);
          }
        }
        outDevice.strokeText(
          text,
          stroke,
          ctm,
          colorspace,
          color as mupdf.Color,
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
          const cmyk = lookupColor(color);
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
          if (warnUnmapped) {
            Logger.logWarn(`RGB color not mapped to CMYK: ${color.join(' ')}`);
          }
        }
        outDevice.fillImageMask(
          image,
          ctm,
          colorspace,
          color as mupdf.Color,
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
          const cmyk = lookupColor(color);
          if (cmyk) {
            outDevice.beginMask(
              bbox,
              luminosity,
              mupdf.ColorSpace.DeviceCMYK,
              cmyk,
            );
            return;
          }
          if (warnUnmapped) {
            Logger.logWarn(`RGB color not mapped to CMYK: ${color.join(' ')}`);
          }
        }
        outDevice.beginMask(bbox, luminosity, colorspace, color as mupdf.Color);
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

      close() {
        outDevice.close();
      },
    };
  }

  const doc = mupdf.Document.openDocument(pdf, 'application/pdf');
  const pageCount = doc.countPages();
  const outputBuffer = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(outputBuffer, 'pdf', '');

  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const mediabox = page.getBounds();
    const outDevice = writer.beginPage(mediabox);
    const convertDevice = new mupdf.Device(
      createColorConvertingDevice(outDevice),
    );
    page.run(convertDevice, mupdf.Matrix.identity);
    writer.endPage();
  }

  writer.close();
  return outputBuffer.asUint8Array();
}
