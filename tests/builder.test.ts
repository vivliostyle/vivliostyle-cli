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
    'manifest.json',
    'manuscript',
    'manuscript/cover.png',
    'manuscript/soda.html',
    'themes',
    'themes/packages',
    'toc.html',
  ]);
  const manifest = require(resolve(
    'fixtures/builder/.vs-workspace/manifest.json',
  ));
  expect(manifest.links[0]).toEqual({
    rel: 'cover',
    href: 'manuscript/cover.png',
    type: 'image/png',
    width: 512,
    height: 512,
  });
  expect(manifest.readingOrder[0]).toEqual({
    href: 'toc.html',
    rel: 'contents',
    type: 'text/html',
    title: 'Table of Contents',
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
    'manifest.json',
    'soda.html',
    't-o-c.html',
    'themes',
    'themes/packages',
  ]);
  const manifest = require(resolve(
    'fixtures/builder/.vs-entryContext/manifest.json',
  ));
  expect(manifest.links[0]).toEqual({
    rel: 'cover',
    href: 'cover.png',
    type: 'image/png',
    width: 512,
    height: 512,
  });
  expect(manifest.readingOrder[0]).toEqual({
    href: 't-o-c.html',
    rel: 'contents',
    type: 'text/html',
    title: 'Table of Contents',
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
