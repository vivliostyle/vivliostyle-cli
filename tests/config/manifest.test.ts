import { generateManifest } from '../../src/lib/build';

const config = {
  title: 'Ginga Book',
  author: 'uetchy',
  language: 'ja',
  size: 'A4',
  theme: './style.css',
  entryContext: './manuscripts',
  entry: [
    'introduction.md',
    {
      path: 'epigraph.md',
      title: 'epilogue',
      theme: '@vivliostyle/theme-whatever',
    },
    'glossary.html',
  ],
  output: './dist',
  toc: true,
  cover: './cover.png',
};

const manifest = {};

it('generate valid manifest', () => {
  const output = generateManifest(config);
  expect(output).toBe(manifest);
});
