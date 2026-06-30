/// <reference lib="es2023" />
/// <reference types="node" />
// Derive the maximal purge set: the largest set of installed packages that can be
// force-purged while the contract suite (pnpm test:docker) still passes (reverse
// of minimal-Essential).
// See README.md. Env: CLI_DIR (required, holds the contract suite), BASE
// (pre-purge image, default vsslim:base), CONCURRENCY (default 8), WARM (optional
// file of known-removable packages to skip re-testing).
//
//   candidate generator : every package installed in BASE, minus the warm set
//   oracle              : oracle.sh -> apply purge set to BASE, run the contract
//   decision            : removable iff the contract passes with it purged, else
//                         kept (justified by the failed test); union verified, with
//                         a greedy pass for cross-package interactions
// Resumable via results.jsonl. Run: CLI_DIR=... CONCURRENCY=8 node derive.mjs

import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';

/**
 * @typedef {object} OracleResult
 * @property {string} verdict
 * @property {boolean} pass
 * @property {string[]} failed
 */

/**
 * @typedef {object} CacheEntry
 * @property {string} pkg
 * @property {string} verdict
 * @property {boolean} pass
 * @property {string[]} failed
 */

const HERE = import.meta.dirname;
const BASE = process.env.BASE || 'vsslim:base';
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);
const ORACLE_TIMEOUT_MS = 30 * 60 * 1000;
const RESULTS = `${HERE}/results.jsonl`;
if (!process.env.CLI_DIR) {
  process.stderr.write('set CLI_DIR to the vivliostyle-cli checkout\n');
  process.exit(1);
}

/** @returns {string} */
const ts = () => new Date().toISOString().slice(11, 19);
/** @param {string} m */
const log = (m) => process.stdout.write(`[${ts()}] ${m}\n`);
/**
 * @param {string} s
 * @returns {string}
 */
const sanitize = (s) =>
  s
    .replaceAll(/[^a-z0-9]/giv, '-')
    .toLowerCase()
    .slice(0, 60);
/**
 * @param {string} f
 * @returns {string[]}
 */
const readPkgs = (f) =>
  (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
    .split('\n')
    .map((s) => s.trim())
    .filter((l) => l && !l.startsWith('#'));

/**
 * Narrow an untyped parsed results.jsonl line into a typed cache entry.
 * Lines are written by `record` as {pkg, pass, verdict, failed}; anything that
 * does not match that shape is ignored (same effect as a JSON.parse failure).
 * @param {unknown} value
 * @returns {CacheEntry | undefined}
 */
const toCacheEntry = (value) => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('pkg' in value) ||
    !('pass' in value) ||
    !('verdict' in value) ||
    !('failed' in value)
  ) {
    return;
  }
  const { pkg, pass, verdict, failed } = value;
  if (
    typeof pkg !== 'string' ||
    typeof pass !== 'boolean' ||
    typeof verdict !== 'string' ||
    !Array.isArray(failed)
  ) {
    return;
  }
  return { pkg, pass, verdict, failed: failed.map(String) };
};

const installed = execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--entrypoint',
    'sh',
    BASE,
    '-c',
    "dpkg-query -W --showformat='${db:Status-Abbrev} ${Package}\\n' 2>/dev/null | grep '^ii ' | sed 's/^ii *//'",
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);
const warm = process.env.WARM ? readPkgs(process.env.WARM) : [];

/** @type {Map<string, CacheEntry>} */
const cache = new Map();
for (const line of (fs.existsSync(RESULTS)
  ? fs.readFileSync(RESULTS, 'utf8')
  : ''
)
  .split('\n')
  .filter(Boolean)) {
  try {
    const entry = toCacheEntry(JSON.parse(line));
    if (entry) {
      cache.set(entry.pkg, entry);
    }
  } catch {}
}
log(
  `installed ${installed.length}, warm ${warm.length}, cached ${cache.size}, concurrency ${CONCURRENCY}`,
);

let n = 0;
/**
 * @param {string[]} set
 * @param {string} suffix
 * @returns {Promise<OracleResult>}
 */
function runOracle(set, suffix) {
  return new Promise((resolve) => {
    const f = `${HERE}/ps-${suffix}.txt`;
    fs.writeFileSync(f, [...new Set(set)].join('\n') + '\n');
    execFile(
      'bash',
      [`${HERE}/oracle.sh`, f, suffix],
      {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: ORACLE_TIMEOUT_MS,
        env: process.env,
      },
      (err, stdout) => {
        const lines = (stdout || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        const verdict = lines[0] || (err ? 'TIMEOUT' : 'EMPTY');
        const r = {
          verdict,
          pass: verdict === 'PASS',
          failed: verdict === 'FAIL' ? lines.slice(1) : [],
        };
        try {
          execFileSync('docker', ['rmi', '-f', `oracle:${suffix}`], {
            stdio: 'ignore',
          });
        } catch {}
        try {
          fs.rmSync(f, { force: true });
        } catch {}
        if (++n % 20 === 0) {
          try {
            execFileSync('docker', ['builder', 'prune', '-f'], {
              stdio: 'ignore',
            });
          } catch {}
          try {
            execFileSync('docker', ['container', 'prune', '-f'], {
              stdio: 'ignore',
            });
          } catch {}
        }
        resolve(r);
      },
    );
  });
}
/**
 * @param {string} pkg
 * @param {OracleResult} r
 */
const record = (pkg, r) => {
  cache.set(pkg, { pkg, ...r });
  fs.appendFileSync(
    RESULTS,
    JSON.stringify({
      pkg,
      pass: r.pass,
      verdict: r.verdict,
      failed: r.failed,
    }) + '\n',
  );
};
/**
 * @template T
 * @param {readonly T[]} items
 * @param {(item: T, k: number) => Promise<unknown>} fn
 * @returns {Promise<void>}
 */
async function pool(items, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const k = i++;
        if (k >= items.length) {
          return;
        }
        await fn(items[k], k);
      }
    }),
  );
}
/**
 * @param {string} pkg
 * @param {number} k
 * @param {number} total
 */
async function test(pkg, k, total) {
  if (cache.has(pkg)) {
    return cache.get(pkg);
  }
  let r = await runOracle([...warm, pkg], `c-${k}-${sanitize(pkg)}`);
  if (['TIMEOUT', 'EMPTY', 'BUILD_FAIL'].includes(r.verdict)) {
    // retry once
    r = await runOracle([...warm, pkg], `r-${k}-${sanitize(pkg)}`);
    if (!r.pass && r.failed.length === 0) {
      // conservative: keep
      r.failed = [`(${r.verdict})`];
    }
  }
  record(pkg, r);
  log(
    `(${k + 1}/${total}) ${r.pass ? 'REMOVABLE' : 'needed   '} ${pkg}${r.pass ? '' : '  <- ' + (r.failed.join(' | ') || r.verdict)}`,
  );
  return r;
}

const main = async () => {
  const candidates = installed.filter((p) => !warm.includes(p));
  log(`phase 1: ${candidates.length} candidates`);
  await pool(candidates, (p, k) => test(p, k, candidates.length));

  const removable = candidates.filter((p) => cache.get(p)?.pass);
  let derived = [...new Set([...warm, ...removable])].toSorted((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  log(
    `phase 1 done: removable ${removable.length}, derived purge ${derived.length}`,
  );

  log('verifying the whole derived set together...');
  let fin = await runOracle(derived, 'final');
  if (!fin.pass) {
    log(
      `union FAILED (${fin.failed.join(' | ')}) -> greedy re-derivation for interactions`,
    );
    const acc = [...warm];
    for (let k = 0; k < removable.length; k++) {
      const r = await runOracle(
        [...acc, removable[k]],
        `g-${k}-${sanitize(removable[k])}`,
      );
      if (r.pass) {
        acc.push(removable[k]);
      } else {
        log(`interaction: keeping ${removable[k]}`);
      }
    }
    derived = [...new Set(acc)].toSorted((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    fin = await runOracle(derived, 'final2');
  }

  /** @type {Record<string, string[]>} */
  const justification = {};
  for (const p of installed) {
    if (!derived.includes(p)) {
      justification[p] = cache.get(p)?.failed ?? ['(kept)'];
    }
  }
  fs.writeFileSync(`${HERE}/derived-purge.txt`, derived.join('\n') + '\n');
  fs.writeFileSync(
    `${HERE}/needed-justification.json`,
    JSON.stringify(justification, null, 2),
  );
  log(
    `DONE. derived purge ${derived.length} pkgs -> derived-purge.txt. verification: ${fin.pass ? 'PASS' : 'FAIL'}`,
  );
};
await main();
