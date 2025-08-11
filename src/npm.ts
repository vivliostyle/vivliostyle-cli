import { fetch as _fetch } from 'node-fetch-native';
import { createProxy } from 'node-fetch-native/proxy';

export interface PackageJson {
  name: string;
  version: string;
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

export function createFetch(options: {
  proxyServer?: string;
  proxyBypass?: string;
  proxyUser?: string;
  proxyPass?: string;
}): typeof _fetch {
  const url = options.proxyServer ?? process.env.HTTP_PROXY;
  const proxy = url
    ? createProxy({
        url,
        noProxy: options.proxyBypass ?? process.env.NO_PROXY ?? undefined,
      })
    : undefined;
  const token =
    options.proxyUser && options.proxyPass
      ? `Basic ${Buffer.from(
          `${options.proxyUser}:${options.proxyPass}`,
        ).toString('base64')}`
      : undefined;
  if (proxy && token) {
    // Find kProxyHeaders symbol
    // https://github.com/nodejs/undici/blob/3d231da2d7ddb7d9354f67ddd86af02890d29d71/lib/dispatcher/proxy-agent.js
    const proxyHeadersKey = Object.getOwnPropertySymbols(proxy.dispatcher).find(
      (symbol) => symbol.description === 'proxy headers',
    );
    if (proxyHeadersKey) {
      (
        proxy.dispatcher as unknown as {
          [key: typeof proxyHeadersKey]: Record<string, string>;
        }
      )[proxyHeadersKey]['proxy-authorization'] = token;
    }
  }
  return (url, fetchOptions) =>
    _fetch(url, { ...(proxy ?? {}), ...fetchOptions });
}

export async function listVivliostyleThemes({
  fetch,
}: {
  fetch: typeof globalThis.fetch;
}): Promise<PackageSearchResult> {
  const keyword = 'vivliostyle-theme';
  return await fetch(
    `https://registry.npmjs.org/-/v1/search?text=keywords:${keyword}&size=250`,
  ).then((response) => response.json());
}

export async function fetchPackageMetadata({
  fetch,
  packageName,
  version,
}: {
  fetch: typeof globalThis.fetch;
  packageName: string;
  version: string;
}): Promise<PackageJson> {
  return fetch(`https://registry.npmjs.org/${packageName}/${version}`).then(
    (response) => response.json(),
  );
}
