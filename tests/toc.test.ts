import { generateToC } from '../src/lib/build';

it('generateToC', () => {
  const toc = generateToC(
    [{ target: { path: 'test.html' }, title: 'Title' }] as any,
    '.vivliostyle',
  );
  expect(toc).toBe(
    '<html><body><nav id="toc" role="doc-toc"><ul><li><a href="../test.html">Title</a></li></ul></nav></body></html>',
  );
});
