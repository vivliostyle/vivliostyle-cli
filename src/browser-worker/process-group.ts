import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

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

function readProcessTable(timeout = 5000, bounded = false) {
  return new Promise<{
    stdout: string;
    psPid: number | undefined;
  }>((resolve, reject) => {
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const ps = execFile(
      psCommand,
      ['-A', '-o', 'pgid=', '-o', 'pid=', '-o', 'stat='],
      {
        maxBuffer: Infinity,
        timeout,
        killSignal: bounded ? 'SIGKILL' : undefined,
      },
      (error, output) => {
        clearTimeout(watchdog);
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
    if (bounded) {
      // execFile waits for the subprocess to close after sending the signal.
      watchdog = setTimeout(() => {
        ps.unref();
        reject(new Error('Timed out running ps for the build group.'));
      }, timeout);
    }
  });
}

async function runningDescendants(group: number): Promise<number[]> {
  const { stdout, psPid } = await readProcessTable();
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
  mode: 'exit' | 'cancel' | 'orphan',
): Promise<void> {
  let terminating = mode !== 'exit';
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
      await delay(100);
      continue;
    }
    if (descendants.length === 0) {
      return;
    }
    if (mode === 'orphan' && graceExpired) {
      // Keep the leader alive to hold the lease until its descendants drain.
      for (const pid of descendants) {
        signalProcess(pid, 'SIGKILL');
      }
    }
    await delay(50);
  }
}

async function inspectDaemonBuildGroup(group: number, timeout: number) {
  const { stdout, psPid } = await readProcessTable(timeout, true);
  let foundSelf = false;
  const members: number[] = [];
  for (const line of stdout.trim().split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+([a-zA-Z]\S*)\s*$/v.exec(line);
    if (!match) {
      throw new Error('Unexpected ps output during build process inspection.');
    }
    const [, pgid, rawPid, status] = match;
    const pid = Number(rawPid);
    foundSelf ||= pid === process.pid;
    if (Number(pgid) === group && pid !== psPid && !status.startsWith('Z')) {
      members.push(pid);
    }
  }
  if (!foundSelf) {
    throw new Error('ps did not report the current process.');
  }
  return members;
}

export async function checkBuildDaemonProcessInspection(): Promise<void> {
  try {
    await inspectDaemonBuildGroup(process.pid, 5000);
  } catch (cause) {
    throw new Error(
      'The build daemon requires ps with process-group inspection.',
      {
        cause,
      },
    );
  }
}

export async function waitForDaemonBuildGroup(
  group: number,
  deadline: number,
  mode: 'request' | 'retirement',
): Promise<boolean> {
  const signalled = new Set<number>();
  while (performance.now() < deadline) {
    let retryMs = 50;
    try {
      if (!signalProcess(-group, 0)) {
        return true;
      }
      const timeout = Math.min(5000, Math.ceil(deadline - performance.now()));
      if (timeout <= 0) {
        return false;
      }
      const members = await inspectDaemonBuildGroup(group, timeout);
      if (performance.now() >= deadline) {
        return false;
      }
      const remaining =
        mode === 'request' ? members.filter((pid) => pid !== group) : members;
      if (remaining.length === 0) {
        return true;
      }
      if (mode === 'request') {
        for (const pid of remaining.filter(
          (member) => !signalled.has(member),
        )) {
          signalProcess(pid, 'SIGTERM');
          signalled.add(pid);
        }
      }
    } catch (error) {
      Logger.debug('Could not inspect the build process group', error);
      retryMs = 100;
    }
    const remaining = deadline - performance.now();
    if (remaining > 0) {
      await delay(Math.min(retryMs, remaining));
    }
  }
  return false;
}
