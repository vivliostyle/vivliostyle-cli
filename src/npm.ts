import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';

import { resolveProxyBypass } from './proxy.js';

export interface PackageJson {
  name: string;
  version: string;
  author?: string | { name?: string; email?: string; url?: string };
  description?: string;
  dependencies?: Record<string, string>;
  dist?: {
    fileCount: number;
    integrity: string;
    shasum: string;
    signatures: {
      keyid: string;
      sig: string;
    }[];
    tarball: string;
    unpackedSize: number;
  };
  exports?: unknown;
  keywords?: string[];
  main?: string;
  style?: string;
  vivliostyle?: unknown;
}

export interface PackageSearchResult {
  objects: {
    downloads: {
      monthly: number;
      weekly: number;
    };
    package: Omit<PackageJson, 'vivliostyle'>;
    searchScore: number;
    updated: string;
  }[];
  total: number;
  time: string;
}

export type Fetch = typeof undiciFetch;

export function createFetch(options: {
  proxyServer?: string;
  proxyBypass?: string;
  proxyUser?: string;
  proxyPass?: string;
  signal?: AbortSignal;
}): Fetch {
  const proxyUrl = options.proxyServer ?? process.env.HTTP_PROXY;
  const token =
    options.proxyUser && options.proxyPass
      ? `Basic ${Buffer.from(
          `${options.proxyUser}:${options.proxyPass}`,
        ).toString('base64')}`
      : undefined;
  // Pair the dispatcher with undici's own fetch: Node's built-in fetch
  // bundles a different undici whose handler API may not match.
  const dispatcher = proxyUrl
    ? new EnvHttpProxyAgent({
        httpProxy: proxyUrl,
        httpsProxy: proxyUrl,
        noProxy: resolveProxyBypass(options.proxyBypass) ?? '',
        token,
      })
    : undefined;
  return (url, fetchOptions) => {
    const signal = fetchOptions?.signal ?? options.signal;
    return undiciFetch(url, {
      dispatcher,
      ...fetchOptions,
      signal,
    })
      .catch((error) => {
        signal?.throwIfAborted();
        throw error;
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${response.url}: ${response.status} ${response.statusText}`,
          );
        }
        return response;
      });
  };
}

export function listVivliostyleThemes({
  fetch,
}: {
  fetch: Fetch;
}): Promise<PackageSearchResult> {
  const keyword = 'vivliostyle-theme';
  return fetch(
    `https://registry.npmjs.org/-/v1/search?text=keywords:${keyword}&size=250`,
  ).then(
    (response) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- trust the npm registry search response shape
      response.json() as Promise<PackageSearchResult>,
  );
}

export function fetchPackageMetadata({
  fetch,
  packageName,
  version,
}: {
  fetch: Fetch;
  packageName: string;
  version: string;
}): Promise<PackageJson> {
  return fetch(`https://registry.npmjs.org/${packageName}/${version}`).then(
    (response) =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- trust the npm registry package metadata shape
      response.json() as Promise<PackageJson>,
  );
}
