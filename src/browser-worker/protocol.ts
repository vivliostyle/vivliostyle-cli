import { constants as bufferConstants } from 'node:buffer';
import fs from 'node:fs';
import type { Socket } from 'node:net';
import path from 'node:path';

import * as v from 'valibot';

import type { PageSizeData } from '../output/pdf-document.js';
import type {
  PdfRenderMetadata,
  PdfRenderProgress,
} from '../output/pdf-render.js';

export const protocolVersion = 1;
const maxMessageSize = 32 * 1024 * 1024;

const RenderInputsSchema = v.object({
  url: v.string(),
  timeout: v.pipe(v.number(), v.finite(), v.minValue(0)),
  cmyk: v.boolean(),
  browserTag: v.string(),
  settings: v.object({
    browserType: v.picklist(['chrome', 'chromium']),
    executablePath: v.pipe(v.string(), v.check(path.isAbsolute)),
    headless: v.literal(true),
    noSandbox: v.boolean(),
    disableDevShmUsage: v.boolean(),
    ignoreHttpsErrors: v.boolean(),
    proxy: v.optional(
      v.object({
        server: v.string(),
        bypass: v.optional(v.string()),
      }),
    ),
  }),
  credentials: v.optional(
    v.object({
      username: v.string(),
      password: v.string(),
    }),
  ),
});

export const ClientMessageSchema = v.variant('type', [
  v.object({ type: v.literal('acquire'), version: v.number() }),
  v.object({ type: v.literal('render'), inputs: RenderInputsSchema }),
  v.object({ type: v.literal('cancel') }),
]);

export type RenderInputs = v.InferOutput<typeof RenderInputsSchema>;
export type ClientMessage = v.InferOutput<typeof ClientMessageSchema>;
type WireNumber = number | 'NaN' | 'Infinity' | '-Infinity';
type WirePageSize = { [K in keyof PageSizeData]: WireNumber };

function encodeNumber(value: number): WireNumber {
  if (Number.isNaN(value)) {
    return 'NaN';
  }
  if (value === Number.POSITIVE_INFINITY) {
    return 'Infinity';
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return '-Infinity';
  }
  return value;
}

function decodeNumber(value: WireNumber): number {
  return typeof value === 'string' ? Number(value) : value;
}

export function encodePageSize(size: PageSizeData): WirePageSize {
  return {
    mediaWidth: encodeNumber(size.mediaWidth),
    mediaHeight: encodeNumber(size.mediaHeight),
    bleedOffset: encodeNumber(size.bleedOffset),
    bleedSize: encodeNumber(size.bleedSize),
  };
}

export function decodePageSize(size: WirePageSize): PageSizeData {
  return {
    mediaWidth: decodeNumber(size.mediaWidth),
    mediaHeight: decodeNumber(size.mediaHeight),
    bleedOffset: decodeNumber(size.bleedOffset),
    bleedSize: decodeNumber(size.bleedSize),
  };
}

export type WorkerMessage =
  | { type: 'queued' | 'leased' }
  | { type: 'progress'; event: PdfRenderProgress }
  | { type: 'error'; message: string }
  | {
      type: 'pdf';
      size: number;
      renderMs: number;
      metadata: Omit<PdfRenderMetadata, 'pageSizeData'> & {
        // Preserve absent (NaN) CSS measurements across JSON.
        pageSizeData: WirePageSize[];
      };
    };

export function resolveWorkerSocket(socketPath: string): string {
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    throw new Error('Browser workers are supported only on Linux and macOS.');
  }
  const name = path.basename(socketPath);
  if (
    !path.isAbsolute(socketPath) ||
    name === '.' ||
    name === '..' ||
    socketPath.endsWith('/') ||
    socketPath.includes('\0')
  ) {
    throw new Error('The browser worker socket must be an absolute file path.');
  }
  const directory = fs.realpathSync(path.dirname(socketPath));
  const info = fs.statSync(directory);
  if (
    !info.isDirectory() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o077
  ) {
    throw new Error(
      `The browser worker socket directory must be owned by the current user and accessible only to its owner (chmod 700): ${directory}`,
    );
  }
  const socket = path.join(directory, name);
  const maxPathBytes = process.platform === 'darwin' ? 103 : 107;
  if (Buffer.byteLength(socket) > maxPathBytes) {
    throw new Error(
      `The browser worker socket path exceeds ${maxPathBytes} bytes. Use a shorter path.`,
    );
  }
  return socket;
}

// Frames contain a four-byte big-endian JSON length and that many UTF-8 bytes.
// A PDF header is followed by exactly 'size' raw bytes on the same connection.
export class WorkerConnection {
  readonly #socket: Socket;
  readonly #stream: AsyncIterator<unknown, unknown>;
  #pending: Buffer = Buffer.alloc(0);

  constructor(socket: Socket) {
    this.#socket = socket;
    this.#stream = socket[Symbol.asyncIterator]();
  }

  async #read(size: number): Promise<Buffer> {
    if (size <= this.#pending.length) {
      const bytes = this.#pending.subarray(0, size);
      this.#pending = this.#pending.subarray(size);
      return bytes;
    }

    const bytes = Buffer.allocUnsafe(size);
    let offset = this.#pending.copy(bytes);
    this.#pending = Buffer.alloc(0);
    while (offset < size) {
      const { done, value } = await this.#stream.next();
      if (done || !Buffer.isBuffer(value)) {
        throw new Error('Browser worker connection closed.');
      }
      const copied = value.copy(bytes, offset);
      this.#pending = value.subarray(copied);
      offset += copied;
    }
    return bytes;
  }

  async readMessage(): Promise<unknown> {
    const size = (await this.#read(4)).readUInt32BE();
    if (size === 0 || size > maxMessageSize) {
      throw new Error('Invalid browser worker message length.');
    }
    return JSON.parse((await this.#read(size)).toString('utf8'));
  }

  readPdf(size: number): Promise<Buffer> {
    if (
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > bufferConstants.MAX_LENGTH
    ) {
      throw new Error('Invalid browser worker PDF length.');
    }
    return this.#read(size);
  }

  send(message: ClientMessage | WorkerMessage): void {
    const json = Buffer.from(JSON.stringify(message));
    if (json.length > maxMessageSize) {
      throw new Error(
        'Browser worker message exceeds the protocol size limit.',
      );
    }
    const frame = Buffer.allocUnsafe(4 + json.length);
    frame.writeUInt32BE(json.length);
    json.copy(frame, 4);
    this.#socket.write(frame);
  }
}
