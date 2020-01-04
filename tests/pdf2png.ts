import fs from 'fs';
import Canvas from 'canvas';
import pdfjs from 'pdfjs-dist';

interface CanvasContext {
  context: null;
  canvas: {
    width: number;
    height: number;
  };
}

export function pdf2png(pdfURL: string) {
  class NodeCanvasFactory {
    create(width: number, height: number) {
      const canvas = Canvas.createCanvas(width, height);
      const context = canvas.getContext('2d');
      return {
        canvas: canvas,
        context: context,
      };
    }

    reset(canvasAndContext: CanvasContext, width: number, height: number) {
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }

    destroy(canvasAndContext: CanvasContext) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.context = null;
    }
  }

  const rawData = new Uint8Array(fs.readFileSync(pdfURL));
  return new Promise((resolve, reject) => {
    pdfjs.getDocument(rawData).promise.then(function(pdfDocument) {
      console.log('# PDF document loaded.');
      pdfDocument.getPage(1).then(function(page) {
        const viewport = page.getViewport({ scale: 1.0 });
        const canvasFactory = new NodeCanvasFactory();
        const canvasAndContext = canvasFactory.create(
          viewport.width,
          viewport.height,
        );
        const renderContext = {
          canvasContext: canvasAndContext.context,
          viewport: viewport,
          canvasFactory: canvasFactory,
        };

        const renderTask = page.render(renderContext);
        renderTask.promise.then(function() {
          // Convert the canvas to an image buffer.
          const image = canvasAndContext.canvas.toBuffer();
          resolve(image);
        });
      });
    });
  });
}
