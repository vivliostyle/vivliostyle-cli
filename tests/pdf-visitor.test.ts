import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  editPdf,
  type PdfEditHook,
  type PdfImageXObjectNode,
  type PdfVisitNode,
} from '../src/output/pdf-visitor.js';

const signal = AbortSignal.any([]);

function visitImageXObject(
  node: PdfVisitNode,
  visit: (node: PdfImageXObjectNode) => void,
): void {
  if (node.kind === 'image-xobject') {
    visit(node);
  }
}

describe('editPdf', () => {
  it('returns without opening the PDF when no hooks are registered', async () => {
    const pdf = new Uint8Array([1, 2, 3]);

    const result = await editPdf(pdf, []);

    expect(result).toBe(pdf);
  });

  it('returns without opening the PDF when hooks have no callbacks', async () => {
    const pdf = new Uint8Array([1, 2, 3]);

    const result = await editPdf(pdf, [{}, {}]);

    expect(result).toBe(pdf);
  });

  it('completes every registered hook', async () => {
    const firstVisit = vi.fn<NonNullable<PdfEditHook['visit']>>();
    const secondVisit = vi.fn<NonNullable<PdfEditHook['visit']>>();
    const firstComplete = vi.fn<NonNullable<PdfEditHook['complete']>>();
    const secondComplete = vi.fn<NonNullable<PdfEditHook['complete']>>();
    const firstHook: PdfEditHook = {
      visit: firstVisit,
      complete: firstComplete,
    };
    const secondHook: PdfEditHook = {
      visit: secondVisit,
      complete: secondComplete,
    };
    const pdf = fs.readFileSync(
      path.join(import.meta.dirname, 'fixtures', 'cmyk', 'text.pdf'),
    );

    await editPdf(pdf, [firstHook, secondHook], { signal });

    expect(firstVisit).toHaveBeenCalled();
    expect(secondVisit).toHaveBeenCalledTimes(firstVisit.mock.calls.length);
    expect(firstComplete).toHaveBeenCalledOnce();
    expect(secondComplete).toHaveBeenCalledOnce();
  });

  it('runs hooks in array order during one traversal', async () => {
    const order: string[] = [];
    let firstVisits = 0;
    let secondVisits = 0;
    const firstHook: PdfEditHook = {
      visit: () => {
        order.push('first');
        firstVisits++;
      },
    };
    const secondHook: PdfEditHook = {
      visit: () => {
        order.push('second');
        secondVisits++;
      },
    };
    const pdf = fs.readFileSync(
      path.join(import.meta.dirname, 'fixtures', 'cmyk', 'text.pdf'),
    );

    await editPdf(pdf, [firstHook, secondHook], { signal });

    expect(firstVisits).toBeGreaterThan(0);
    expect(secondVisits).toBe(firstVisits);
    expect(order).toEqual(
      Array.from({ length: firstVisits }, () => ['first', 'second']).flat(),
    );
  });

  it('passes image replacements to subsequent hooks', async () => {
    let replacementObjectNumber: number | undefined;
    let firstVisits = 0;
    let secondVisits = 0;
    const firstHook: PdfEditHook = {
      visit: (node) =>
        visitImageXObject(node, (imageNode) => {
          const image = imageNode.document.loadImage(imageNode.object);
          try {
            const replacement = imageNode.document.addImage(image);
            replacement
              .resolve()
              .put('VisitMarker', imageNode.document.newName('Replaced'));
            replacementObjectNumber = replacement.asIndirect();
            imageNode.replaceWith(replacement);
            firstVisits++;
          } finally {
            image.destroy();
          }
        }),
    };
    const secondHook: PdfEditHook = {
      visit: (node) =>
        visitImageXObject(node, (imageNode) => {
          expect(imageNode.object.asIndirect()).toBe(replacementObjectNumber);
          expect(imageNode.objectNumber).toBe(replacementObjectNumber);
          expect(imageNode.resolved.get('VisitMarker').toString()).toBe(
            '/Replaced',
          );
          secondVisits++;
        }),
    };
    const pdf = fs.readFileSync(
      path.join(import.meta.dirname, 'fixtures', 'cmyk', 'image.pdf'),
    );

    await editPdf(pdf, [firstHook, secondHook], { signal });

    expect(firstVisits).toBeGreaterThan(0);
    expect(secondVisits).toBe(firstVisits);
  });

  it('stops visiting nodes after cancellation', async () => {
    const controller = new AbortController();
    const firstVisit = vi.fn<NonNullable<PdfEditHook['visit']>>(() => {
      controller.abort();
    });
    const secondVisit = vi.fn<NonNullable<PdfEditHook['visit']>>();
    const pdf = fs.readFileSync(
      path.join(import.meta.dirname, 'fixtures', 'cmyk', 'text.pdf'),
    );

    const firstHook: PdfEditHook = {
      visit: firstVisit,
    };
    const secondHook: PdfEditHook = {
      visit: secondVisit,
    };
    await expect(
      editPdf(pdf, [firstHook, secondHook], { signal: controller.signal }),
    ).rejects.toThrow('This operation was aborted');
    expect(firstVisit).toHaveBeenCalledOnce();
    expect(secondVisit).not.toHaveBeenCalled();
  });

  it('stops completing hooks after cancellation', async () => {
    const controller = new AbortController();
    const firstComplete = vi.fn<NonNullable<PdfEditHook['complete']>>(() => {
      controller.abort();
    });
    const secondComplete = vi.fn<NonNullable<PdfEditHook['complete']>>();
    const firstHook: PdfEditHook = {
      complete: firstComplete,
    };
    const secondHook: PdfEditHook = {
      complete: secondComplete,
    };
    const pdf = fs.readFileSync(
      path.join(import.meta.dirname, 'fixtures', 'cmyk', 'text.pdf'),
    );

    await expect(
      editPdf(pdf, [firstHook, secondHook], { signal: controller.signal }),
    ).rejects.toThrow('This operation was aborted');
    expect(firstComplete).toHaveBeenCalledOnce();
    expect(secondComplete).not.toHaveBeenCalled();
  });
});
