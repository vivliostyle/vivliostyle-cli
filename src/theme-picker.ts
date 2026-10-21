// Lets the user choose a theme on theme.vivliostyle.org. The page sends the
// choice back by navigating to a one-time loopback server, as in the native
// app flow of OAuth (RFC 8252). The protocol is specified in
// https://github.com/vivliostyle/theme.vivliostyle.org/blob/main/docs/selection-protocol.md
import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import readline from 'node:readline';

import { valid as semverValid } from 'semver';
import validateNpmPackageName from 'validate-npm-package-name';

import { PromptCancelError } from './entry-util.js';
import { openUrl } from './open-url.js';

export const PICKER_PROTOCOL_VERSION = 1;
export const PICKER_TIMEOUT_MS = 10 * 60 * 1000;

export interface ThemePickerSelection {
  name: string;
  version: string;
  templateId?: string;
}

export type ThemePickerResult =
  | { type: 'selected'; selection: ThemePickerSelection }
  | { type: 'cancelled' }
  | { type: 'timeout' };

const COMPLETION_PAGE = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Vivliostyle CLI</title>
<p>The theme has been sent to Vivliostyle CLI. You can close this page and return to the terminal.</p>
</html>`;

export function buildPickerUrl({
  siteUrl,
  locale,
  port,
  state,
  allowTemplate,
  communityOnly,
}: {
  siteUrl: string;
  locale: string;
  port: number;
  state: string;
  allowTemplate: boolean;
  communityOnly: boolean;
}): string {
  const url = new URL(
    `${siteUrl}/${locale.toLowerCase().startsWith('ja') ? 'ja' : 'en'}/select`,
  );
  url.searchParams.set('client', 'cli');
  url.searchParams.set('port', String(port));
  url.searchParams.set('state', state);
  url.searchParams.set('v', String(PICKER_PROTOCOL_VERSION));
  if (allowTemplate) {
    url.searchParams.set('allowTemplate', '1');
  }
  if (communityOnly) {
    url.searchParams.set('source', 'community');
  }
  return url.href;
}

function sameSecret(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function parseCallback(
  params: URLSearchParams,
  state: string,
): ThemePickerSelection | undefined {
  const name = params.get('theme') ?? '';
  const version = params.get('version') ?? '';
  const templateId = params.get('template') ?? undefined;
  if (
    !sameSecret(params.get('state') ?? '', state) ||
    !validateNpmPackageName(name).validForOldPackages ||
    !semverValid(version) ||
    (templateId !== undefined && (!templateId || templateId.length > 200))
  ) {
    return undefined;
  }
  return { name, version, ...(templateId !== undefined && { templateId }) };
}

/**
 * Waits for the choice in the browser. Esc, Enter, or q in the terminal
 * cancels the wait so that the user can go back to the list.
 */
export function pickThemeInBrowser({
  siteUrl,
  locale,
  allowTemplate,
  communityOnly,
  onUrl,
  timeoutMs = PICKER_TIMEOUT_MS,
  open = openUrl,
}: {
  siteUrl: string;
  locale: string;
  allowTemplate: boolean;
  communityOnly: boolean;
  onUrl: (url: string) => void;
  timeoutMs?: number;
  open?: (url: string) => Promise<void>;
}): Promise<ThemePickerResult> {
  const state = randomBytes(16).toString('base64url');
  const stdin = process.stdin;
  const listensToKeys = stdin.isTTY && typeof stdin.setRawMode === 'function';

  return new Promise<ThemePickerResult>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method !== 'GET' || url.pathname !== '/callback') {
        response.writeHead(404).end();
        return;
      }
      const selection = parseCallback(url.searchParams, state);
      if (!selection) {
        response
          .writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          .end('Invalid request');
        return;
      }
      response
        .writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'none'",
        })
        .end(COMPLETION_PAGE);
      finish({ type: 'selected', selection });
    });

    const onKeypress = (
      _: string | undefined,
      key: { name?: string; ctrl?: boolean } | undefined,
    ) => {
      if (key?.ctrl && key.name === 'c') {
        cleanup();
        reject(new PromptCancelError());
      } else if (
        key?.name === 'escape' ||
        key?.name === 'return' ||
        key?.name === 'q'
      ) {
        finish({ type: 'cancelled' });
      }
    };

    function cleanup() {
      settled = true;
      clearTimeout(timer);
      server.closeAllConnections();
      server.close();
      if (listensToKeys) {
        stdin.off('keypress', onKeypress);
        stdin.setRawMode(false);
        stdin.pause();
      }
    }

    function finish(result: ThemePickerResult) {
      if (settled) {
        return;
      }
      cleanup();
      resolve(result);
    }

    server.on('error', (error) => {
      if (!settled) {
        cleanup();
        reject(error);
      }
    });
    // The loopback literal, not "localhost", which may resolve to another
    // interface (RFC 8252, section 7.3).
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const url = buildPickerUrl({
        siteUrl,
        locale,
        port,
        state,
        allowTemplate,
        communityOnly,
      });
      onUrl(url);
      // The URL is also shown in the terminal, e.g. for a remote session.
      open(url).catch(() => null);
      timer = setTimeout(() => finish({ type: 'timeout' }), timeoutMs);
      if (listensToKeys) {
        readline.emitKeypressEvents(stdin);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('keypress', onKeypress);
      }
    });
  });
}
