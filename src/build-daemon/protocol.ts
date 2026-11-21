import * as v from 'valibot';

export const buildProtocolVersion = 1;

export const InitialRequestSchema = v.variant('type', [
  v.object({
    type: v.literal('build'),
    version: v.number(),
    cwd: v.string(),
    args: v.array(v.string()),
  }),
  v.object({ type: v.literal('describe'), version: v.number() }),
]);

export const CancelRequestSchema = v.object({ type: v.literal('cancel') });

export type BuildRequest =
  | v.InferOutput<typeof InitialRequestSchema>
  | v.InferOutput<typeof CancelRequestSchema>;

export interface BuildLog {
  type: 'log';
  stream: 'stdout' | 'stderr';
  // Base64 preserves byte boundaries across log chunks.
  data: string;
}

export interface BuildResult {
  type: 'result';
  error?: string;
}

export type BuildReply =
  | { type: 'session'; version: number; cliPath: string; cwd: string }
  | { type: 'queued' }
  | { type: 'started'; pid: number }
  | BuildLog
  | BuildResult;

export type ExecutorRequest =
  | { type: 'build'; id: number; args: string[] }
  | { type: 'cancel'; message: string };

export type ExecutorReply =
  | { type: 'ready' }
  | (BuildLog & { id: number })
  | (BuildResult & { id: number; retire?: 'graceful' | 'force' });
