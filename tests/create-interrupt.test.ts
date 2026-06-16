import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mockedDownloadTemplate = vi.hoisted(() =>
  vi.fn<
    (
      template: string,
      options: { dir: string },
    ) => Promise<Record<string, never>>
  >(),
);

vi.mock('@bluwy/giget-core', () => ({
  downloadTemplate: mockedDownloadTemplate,
}));

import { create } from '../src/core/create.js';
import { runCleanupHandlers } from '../src/util.js';

let temporaryDirectory: string | undefined;

beforeEach(() => {
  mockedDownloadTemplate.mockReset();
});

afterEach(() => {
  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

it('waits for an interrupted template download before removing partial output', async () => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'vivliostyle-cli-create-'),
  );
  const controller = new AbortController();
  const abortReason = new Error('interrupted');
  let finishDownload: (() => void) | undefined;
  let downloadDirectory: string | undefined;
  mockedDownloadTemplate.mockImplementation(
    (_template: string, { dir }: { dir: string }) =>
      new Promise((resolve) => {
        downloadDirectory = dir;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'partial'), '');
        finishDownload = () => resolve({});
      }),
  );

  const creating = create({
    cwd: temporaryDirectory,
    projectPath: 'book',
    title: 'Book',
    author: 'Author',
    language: 'en',
    theme: false,
    template: 'https://example.com/template.tar.gz',
    installDependencies: false,
    logLevel: 'silent',
    signal: controller.signal,
  });

  await vi.waitFor(() => {
    expect(downloadDirectory).toBeDefined();
  });
  controller.abort(abortReason);

  let cleanupFinished = false;
  const cleanup = runCleanupHandlers().then(() => {
    cleanupFinished = true;
  });
  await Promise.resolve();

  expect(cleanupFinished).toBe(false);
  expect(fs.existsSync(downloadDirectory!)).toBe(true);

  finishDownload?.();

  await expect(creating).rejects.toBe(abortReason);
  await cleanup;
  expect(fs.existsSync(downloadDirectory!)).toBe(false);
});

it('removes temporary template download after download failure', async () => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'vivliostyle-cli-create-'),
  );
  const downloadError = new Error('download failed');
  let downloadDirectory: string | undefined;
  mockedDownloadTemplate.mockImplementation(
    async (_template: string, { dir }: { dir: string }) => {
      downloadDirectory = dir;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'partial'), '');
      throw downloadError;
    },
  );

  await expect(
    create({
      cwd: temporaryDirectory,
      projectPath: 'book',
      title: 'Book',
      author: 'Author',
      language: 'en',
      theme: false,
      template: 'https://example.com/template.tar.gz',
      installDependencies: false,
      logLevel: 'silent',
    }),
  ).rejects.toBe(downloadError);

  expect(downloadDirectory).toBeDefined();
  expect(fs.existsSync(downloadDirectory!)).toBe(false);
});

it('normalizes template download errors after cancellation', async () => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'vivliostyle-cli-create-'),
  );
  const controller = new AbortController();
  const abortReason = new Error('interrupted');
  const downloadError = new Error('download failed');
  let rejectDownload: ((error: Error) => void) | undefined;
  let downloadDirectory: string | undefined;
  mockedDownloadTemplate.mockImplementation(
    (_template: string, { dir }: { dir: string }) =>
      new Promise((_, reject) => {
        downloadDirectory = dir;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'partial'), '');
        rejectDownload = reject;
      }),
  );

  const creating = create({
    cwd: temporaryDirectory,
    projectPath: 'book',
    title: 'Book',
    author: 'Author',
    language: 'en',
    theme: false,
    template: 'https://example.com/template.tar.gz',
    installDependencies: false,
    logLevel: 'silent',
    signal: controller.signal,
  });

  await vi.waitFor(() => {
    expect(downloadDirectory).toBeDefined();
  });

  controller.abort(abortReason);
  rejectDownload?.(downloadError);

  await expect(creating).rejects.toBe(abortReason);
  expect(fs.existsSync(downloadDirectory!)).toBe(false);
});
