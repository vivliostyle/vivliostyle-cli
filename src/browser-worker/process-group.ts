import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

import { Logger } from '../logger.js';

export const buildShutdownGraceMs = 10_000;
const psCommand = existsSync('/bin/ps') ? '/bin/ps' : 'ps';

export function signalProcess(
  pid: number,
  signal: NodeJS.Signals | 0,
): boolean {
  try {
    return process.kill(pid, signal);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

async function runningDescendants(group: number): Promise<number[]> {
  const { stdout, psPid } = await new Promise<{
    stdout: string;
    psPid: number | undefined;
  }>((resolve, reject) => {
    const ps = execFile(
      psCommand,
      ['-A', '-o', 'pgid=', '-o', 'pid=', '-o', 'stat='],
      { maxBuffer: Infinity, timeout: 5000 },
      (error, output) => {
        if (error) {
          reject(
            new Error('Failed to run ps for the build group.', {
              cause: error,
            }),
          );
        } else {
          resolve({ stdout: output, psPid: ps.pid });
        }
      },
    );
  });
  const descendants: number[] = [];
  for (const line of stdout.trim().split('\n')) {
    const [pgid, pid, status] = line.trim().split(/\s+/v);
    const member = Number(pid);
    if (
      Number(pgid) === group &&
      member !== group &&
      member !== psPid &&
      !status.startsWith('Z')
    ) {
      descendants.push(member);
    }
  }
  return descendants;
}

export async function stopBuildDescendants(
  group: number,
  deadline: number,
  mode: 'exit' | 'cancel' | 'orphan' | 'reuse',
): Promise<void> {
  let terminating = mode !== 'exit';
  const signalled = new Set<number>();
  while (signalProcess(-group, 0)) {
    const graceExpired = performance.now() >= deadline;
    if (mode === 'exit' || mode === 'cancel') {
      if (graceExpired) {
        signalProcess(-group, 'SIGKILL');
      } else if (!terminating) {
        signalProcess(-group, 'SIGTERM');
        terminating = true;
      }
    }
    let descendants: number[];
    try {
      descendants = await runningDescendants(group);
    } catch (error) {
      // Keep the lease if process status is temporarily unavailable.
      Logger.debug('Could not inspect the build process group', error);
      await setTimeout(100);
      continue;
    }
    if (descendants.length === 0) {
      return;
    }
    if ((mode === 'orphan' || mode === 'reuse') && graceExpired) {
      // Keep the leader alive to hold the lease until its descendants drain.
      for (const pid of descendants) {
        signalProcess(pid, 'SIGKILL');
      }
    } else if (mode === 'reuse') {
      for (const pid of descendants) {
        if (!signalled.has(pid)) {
          signalProcess(pid, 'SIGTERM');
          signalled.add(pid);
        }
      }
    }
    await setTimeout(50);
  }
}
