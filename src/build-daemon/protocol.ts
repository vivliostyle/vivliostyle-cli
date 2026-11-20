import * as v from 'valibot';

export const buildProtocolVersion = 1;

export const BuildRequestSchema = v.object({
  type: v.literal('build'),
  version: v.number(),
  cwd: v.string(),
  args: v.array(v.string()),
});

export const CancelRequestSchema = v.object({ type: v.literal('cancel') });

export type BuildRequest =
  | v.InferOutput<typeof BuildRequestSchema>
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
  | { type: 'queued' }
  | { type: 'started'; pid: number }
  | BuildLog
  | BuildResult;

export type ExecutorRequest =
  | { type: 'build'; id: number; args: string[] }
  | { type: 'cancel'; message: string };

export type ExecutorReply =
  | { type: 'ready' }
  | ((BuildLog | BuildResult) & { id: number });
