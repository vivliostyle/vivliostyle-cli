import { generateToC } from '../src/builder';

it('generateToC', () => {
  const toc = generateToC(
    [{ target: 'test.html', title: 'Title' }] as any,
    '.vivliostyle',
  );
  expect(toc).toBe(
    '<html><head><title>Table of Contents</title><link href="publication.json" rel="publication" type="application/ld+json"></head><body><nav id="toc" role="doc-toc"><ul><li><a href="../test.html">Title</a></li></ul></nav></body></html>',
  );
});
