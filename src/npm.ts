import Arborist from '@npmcli/arborist';
import { fetch as _fetch } from 'node-fetch-native';
import { createProxy } from 'node-fetch-native/proxy';
import upath from 'upath';
import * as v from 'valibot';

import { THEME_SITE_URL } from './constants.js';

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

export function createFetch(options: {
  proxyServer?: string;
  proxyBypass?: string;
  proxyUser?: string;
  proxyPass?: string;
  signal?: AbortSignal;
}): typeof _fetch {
  const proxyUrl = options.proxyServer ?? process.env.HTTP_PROXY;
  const proxy = proxyUrl
    ? createProxy({
        url: proxyUrl,
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
      /* oxlint-disable typescript/no-unsafe-type-assertion -- reach into the proxy dispatcher's internal symbol-keyed headers */
      (
        proxy.dispatcher as unknown as {
          [key: typeof proxyHeadersKey]: Record<string, string>;
        }
      )[proxyHeadersKey]['proxy-authorization'] = token;
      /* oxlint-enable typescript/no-unsafe-type-assertion */
    }
  }
  return (url, fetchOptions) => {
    const signal = fetchOptions?.signal ?? options.signal;
    return _fetch(url, {
      ...proxy,
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
  fetch: typeof globalThis.fetch;
}): Promise<PackageSearchResult> {
  const keyword = 'vivliostyle-theme';
  return fetch(
    `https://registry.npmjs.org/-/v1/search?text=keywords:${keyword}&size=250`,
  ).then((response) => response.json());
}

export function fetchPackageMetadata({
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

/** The theme catalog site; tests point it to a local server. */
export function getThemeSiteUrl(): string {
  return (process.env.VIVLIOSTYLE_THEME_SITE_URL || THEME_SITE_URL).replace(
    /\/$/v,
    '',
  );
}

const CatalogThemeSchema = v.object({
  name: v.string(),
  version: v.string(),
  description: v.string(),
  official: v.boolean(),
  downloads: v.object({ weekly: v.number(), monthly: v.number() }),
  templates: v.array(
    v.object({
      id: v.string(),
      name: v.optional(v.string()),
      description: v.optional(v.string()),
    }),
  ),
});
export type CatalogTheme = v.InferOutput<typeof CatalogThemeSchema>;

/**
 * Lists the themes of theme.vivliostyle.org, which excludes deprecated,
 * invalid, and moderated packages, in the order of `vivliostyle create`.
 */
export async function fetchThemeCatalog({
  fetch,
  source,
}: {
  fetch: typeof globalThis.fetch;
  source?: 'official' | 'community';
}): Promise<CatalogTheme[]> {
  const query = source ? `?source=${source}` : '';
  const response = await fetch(`${getThemeSiteUrl()}/api/v1/themes${query}`);
  return v.parse(
    v.object({ themes: v.array(CatalogThemeSchema) }),
    await response.json(),
  ).themes;
}

/**
 * Installs a package into `dir` without running lifecycle scripts and
 * returns its directory. Arborist verifies the tarball against the
 * integrity recorded by the registry.
 */
export async function installPackageForTemplate({
  packageName,
  version,
  dir,
}: {
  packageName: string;
  version: string;
  dir: string;
}): Promise<string> {
  const options = {
    path: dir,
    add: [`${packageName}@${version}`],
    ignoreScripts: true,
    audit: false,
  };
  await new Arborist(options).reify(options);
  return upath.join(dir, 'node_modules', packageName);
}
