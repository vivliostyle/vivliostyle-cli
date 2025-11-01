import { fileTypeFromFile } from 'file-type';
import { describe, expect, it } from 'vitest';
import { resolveFixture, runCommand } from './command-util';

describe('pdf output', () => {
  it('generate pdf without errors', async () => {
    await runCommand(
      [
        'build',
        '-s',
        'A4',
        '-o',
        '.vs-pdf/test.pdf',
        '--no-sandbox',
        'index.html',
      ],
      {
        cwd: resolveFixture('wood'),
        port: 23000,
      },
    );

    // mimetype test
    const type = await fileTypeFromFile(
      resolveFixture('wood/.vs-pdf/test.pdf'),
    );
    expect(type!.mime).toEqual('application/pdf');
  }, 120000);
});
