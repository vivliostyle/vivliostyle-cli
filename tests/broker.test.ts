import { getBrokerUrl } from '../src/server';
import { maskConfig } from './commandUtil';

it('converts to valid broker url', async () => {
  const validOut1 = {
    url: getBrokerUrl({
      sourceIndex: '/absolute/path/to/manifest/file.json',
    }),
  };
  maskConfig(validOut1);
  expect(validOut1.url).toBe(
    'file://__WORKSPACE__/node_modules/@vivliostyle/viewer/lib/index.html#src=file:///absolute/path/to/manifest/file.json&bookMode=true&renderAllPages=true',
  );

  const validOut2 = {
    url: getBrokerUrl({
      sourceIndex: '/absolute/path/to/something',
      singleDoc: true,
      quick: true,
      outputSize: {
        width: '5in',
        height: '10in',
      },
      style:
        'data:,#test>p::before{content:"エスケープ チェック";display:block}',
      userStyle:
        'file://path/to/local/style/file/which/might/include/white space/&/special#?character.css',
    }),
  };
  maskConfig(validOut2);
  expect(validOut2.url).toBe(
    'file://__WORKSPACE__/node_modules/@vivliostyle/viewer/lib/index.html#src=file:///absolute/path/to/something&bookMode=false&renderAllPages=false&style=data:,#test>p::before{content:"エスケープ チェック";display:block}&userStyle=file://path/to/local/style/file/which/might/include/white space/%26/special#?character.css&userStyle=data:,/*<viewer>*/%40page%7Bsize%3A5in%2010in!important%3B%7D/*</viewer>*/',
  );
});
