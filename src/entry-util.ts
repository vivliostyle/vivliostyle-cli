import { pathToFileURL } from 'node:url';

import {
  gracefulError,
  registerTerminationHook,
  setupProcessTermination,
} from './util.js';

export function isDirectExecution(importMetaUrl: string) {
  return (
    Boolean(process.argv[1]) &&
    importMetaUrl === pathToFileURL(process.argv[1]).href
  );
}

export class CliInterruptError extends Error {
  readonly exitCode: number;

  constructor(exitCode: number) {
    super(
      exitCode === 130
        ? 'Interrupted by SIGINT'
        : `Terminated by signal: ${exitCode}`,
    );
    this.name = 'CliInterruptError';
    this.exitCode = exitCode;
  }
}

export async function runCliCommand(
  command: (signal: AbortSignal) => Promise<void>,
) {
  setupProcessTermination();

  const controller = new AbortController();
  const unregisterTerminationHook = registerTerminationHook((exitCode) => {
    if (!controller.signal.aborted) {
      controller.abort(new CliInterruptError(exitCode));
    }
  });

  try {
    await command(controller.signal);
  } catch (err) {
    if (err === controller.signal.reason) {
      return;
    }
    if (err instanceof Error) {
      await gracefulError(err);
      return;
    }
    throw err;
  } finally {
    unregisterTerminationHook();
  }
}
