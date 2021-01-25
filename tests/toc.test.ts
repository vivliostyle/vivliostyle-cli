import { generateTocHtml } from '../src/html';

it('generateToC', () => {
  const toc = generateTocHtml({
    entries: [{ target: 'test.html', title: 'Title' }],
    distDir: '.vivliostyle',
  });
  expect(toc).toBe(
    '<html><head><title>Table of Contents</title><link href="publication.json" rel="publication" type="application/ld+json"></head><body><nav id="toc" role="doc-toc"><ul><li><a href="../test.html">Title</a></li></ul></nav></body></html>',
  );
});
