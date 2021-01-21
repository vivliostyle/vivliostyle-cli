import shelljs from 'shelljs';
import path from 'upath';
import { checkOverwriteViolation, compile, copyAssets } from '../src/builder';
import { getMergedConfig } from './commandUtil';

const resolve = (p: string) => path.resolve(__dirname, p);

afterAll(() => {
  shelljs.rm('-rf', [
    resolve('fixtures/builder/.vs-workspace'),
    resolve('fixtures/builder/.vs-entryContext'),
  ]);
});

it('generate workspace directory', async () => {
  const config = await getMergedConfig([
    '-c',
    resolve('fixtures/builder/workspace.config.js'),
  ]);
  for (const target of config.outputs) {
    checkOverwriteViolation(config, target.path, target.format);
  }
  await compile(config);
  await copyAssets(config);
  const fileList = shelljs.ls('-R', resolve('fixtures/builder/.vs-workspace'));
  expect([...fileList]).toEqual([
    'manuscript',
    'manuscript/cover.png',
    'manuscript/soda.html',
    'publication.json',
    'toc.html',
  ]);
  const manifest = require(resolve(
    'fixtures/builder/.vs-workspace/publication.json',
  ));
  expect(manifest.links[0]).toEqual({
    encodingFormat: 'image/png',
    rel: 'cover',
    url: 'manuscript/cover.png',
    width: 512,
    height: 512,
  });
  expect(manifest.readingOrder[0]).toEqual({
    encodingFormat: 'text/html',
    rel: 'contents',
    title: 'Table of Contents',
    url: 'toc.html',
  });

  // try again and check idempotence
  await compile(config);
  await copyAssets(config);
  const fileList2 = shelljs.ls('-R', resolve('fixtures/builder/.vs-workspace'));
  expect([...fileList2]).toEqual([...fileList]);
});

it('generate files with entryContext', async () => {
  const config = await getMergedConfig([
    '-c',
    resolve('fixtures/builder/entryContext.config.js'),
  ]);
  for (const target of config.outputs) {
    checkOverwriteViolation(config, target.path, target.format);
  }
  await compile(config);
  await copyAssets(config);
  const fileList = shelljs.ls(
    '-R',
    resolve('fixtures/builder/.vs-entryContext'),
  );
  expect([...fileList]).toEqual([
    'cover.png',
    'publication.json',
    'soda.html',
    't-o-c.html',
  ]);
  const manifest = require(resolve(
    'fixtures/builder/.vs-entryContext/publication.json',
  ));
  expect(manifest.links[0]).toEqual({
    encodingFormat: 'image/png',
    rel: 'cover',
    url: 'cover.png',
    width: 512,
    height: 512,
  });
  expect(manifest.readingOrder[0]).toEqual({
    encodingFormat: 'text/html',
    rel: 'contents',
    title: 'Table of Contents',
    url: 't-o-c.html',
  });

  // try again and check idempotence
  await compile(config);
  await copyAssets(config);
  const fileList2 = shelljs.ls(
    '-R',
    resolve('fixtures/builder/.vs-entryContext'),
  );
  expect([...fileList2]).toEqual([...fileList]);
});

it('check overwrite violation', async () => {
  const config = await getMergedConfig([
    '-c',
    resolve('fixtures/builder/overwriteViolation.config.js'),
  ]);
  expect(
    new Promise<void>((res, rej) => {
      try {
        checkOverwriteViolation(config, config.outputs[0].path, '');
        res();
      } catch (err) {
        rej(err);
      }
    }),
  ).rejects.toThrow();
});
