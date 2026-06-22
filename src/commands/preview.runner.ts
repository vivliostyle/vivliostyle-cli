import type { ViteDevServer } from 'vite';

import { preview } from '../core/preview.js';
import { runCliCommand } from '../entry-util.js';
import { runCleanupHandlers } from '../util.js';
import { parsePreviewCommand } from './preview.parser.js';

async function waitForPreviewServerClose(
  server: ViteDevServer | undefined,
  signal: AbortSignal,
) {
  const { httpServer } = server ?? {};
  if (!httpServer?.listening) {
    signal.throwIfAborted();
    return;
  }
  await new Promise<void>((resolve) => {
    httpServer.once('close', resolve);
  });
  signal.throwIfAborted();
}

export async function runPreviewCli(argv: string[]): Promise<void> {
  await runCliCommand(async (cliSignal) => {
    const inlineConfig = parsePreviewCommand(argv);
    const server = await preview({ ...inlineConfig, signal: cliSignal });
    await waitForPreviewServerClose(server, cliSignal);
    await runCleanupHandlers();
  });
}
