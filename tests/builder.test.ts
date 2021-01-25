import assert from 'assert';
import shelljs from 'shelljs';
import path from 'upath';
import { checkOverwriteViolation, compile, copyAssets } from '../src/builder';
import { MergedConfig } from '../src/config';
import { getMergedConfig } from './commandUtil';

const resolve = (p: string) => path.resolve(__dirname, p);

function assertManifestPath(
  config: MergedConfig,
): asserts config is MergedConfig & { manifestPath: string } {
  assert(!!config.manifestPath);
}

afterAll(() => {
  shelljs.rm('-rf', [
    resolve('fixtures/builder/.vs-workspace'),
    resolve('fixtures/builder/.vs-entryContext'),
    resolve('fixtures/builder/.vs-variousManuscriptFormat'),
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
  assertManifestPath(config);
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
  assertManifestPath(config);
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

it('generate from various manuscript formats', async () => {
  const config = await getMergedConfig([
    '-c',
    resolve('fixtures/builder/variousManuscriptFormat.config.js'),
  ]);
  for (const target of config.outputs) {
    checkOverwriteViolation(config, target.path, target.format);
  }
  assertManifestPath(config);
  await compile(config);
  await copyAssets(config);
  const fileList = shelljs.ls(
    '-R',
    resolve('fixtures/builder/.vs-variousManuscriptFormat'),
  );
  expect([...fileList]).toEqual([
    'manuscript',
    'manuscript/cover.png',
    'manuscript/sample-html.html',
    'manuscript/sample-xhtml.xhtml',
    'manuscript/soda.html',
    'publication.json',
  ]);
  const manifest = require(resolve(
    'fixtures/builder/.vs-variousManuscriptFormat/publication.json',
  ));
  expect(manifest.readingOrder).toEqual([
    {
      title: 'SODA',
      url: 'manuscript/soda.html',
    },
    {
      title: 'Sample HTML',
      url: 'manuscript/sample-html.html',
    },
    {
      encodingFormat: 'application/xhtml+xml',
      title: 'Sample XHTML',
      url: 'manuscript/sample-xhtml.xhtml',
    },
  ]);
});

it('check overwrite violation', async () => {
  const config1 = await getMergedConfig([
    '-c',
    resolve('fixtures/builder/overwriteViolation.1.config.js'),
  ]);
  expect(
    new Promise<void>((res, rej) => {
      try {
        checkOverwriteViolation(config1, config1.outputs[0].path, '');
        res();
      } catch (err) {
        rej(err);
      }
    }),
  ).rejects.toThrow();
  const config2 = await getMergedConfig([
    '-c',
    resolve('fixtures/builder/overwriteViolation.2.config.js'),
  ]);
  expect(
    new Promise<void>((res, rej) => {
      try {
        checkOverwriteViolation(config2, config2.outputs[0].path, '');
        res();
      } catch (err) {
        rej(err);
      }
    }),
  ).rejects.toThrow();
});
