// Derive the maximal purge set: the largest set of installed packages that can be
// force-purged while image-contract.sh still passes (reverse of minimal-Essential).
// See README.md. Env: CLI_DIR (required, holds image-contract.sh), BASE
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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'vsslim:base';
const CONCURRENCY = Number(process.env.CONCURRENCY || 8);
const ORACLE_TIMEOUT_MS = 30 * 60 * 1000;
const RESULTS = `${HERE}/results.jsonl`;
if (!process.env.CLI_DIR) {
  process.stderr.write('set CLI_DIR to the vivliostyle-cli checkout\n');
  process.exit(1);
}

const ts = () => new Date().toISOString().slice(11, 19);
const log = (m) => process.stdout.write(`[${ts()}] ${m}\n`);
const sanitize = (s) =>
  s
    .replace(/[^a-z0-9]/gi, '-')
    .toLowerCase()
    .slice(0, 60);
const readPkgs = (f) =>
  (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
    .split('\n')
    .map((s) => s.trim())
    .filter((l) => l && !l.startsWith('#'));

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

const cache = new Map();
for (const line of (fs.existsSync(RESULTS)
  ? fs.readFileSync(RESULTS, 'utf8')
  : ''
)
  .split('\n')
  .filter(Boolean)) {
  try {
    const r = JSON.parse(line);
    cache.set(r.pkg, r);
  } catch {}
}
log(
  `installed ${installed.length}, warm ${warm.length}, cached ${cache.size}, concurrency ${CONCURRENCY}`,
);

let n = 0;
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
async function test(pkg, k, total) {
  if (cache.has(pkg)) {
    return cache.get(pkg);
  }
  let r = await runOracle([...warm, pkg], `c-${k}-${sanitize(pkg)}`);
  if (['TIMEOUT', 'EMPTY', 'BUILD_FAIL'].includes(r.verdict)) {
    r = await runOracle([...warm, pkg], `r-${k}-${sanitize(pkg)}`); // retry once
    if (!r.pass && r.failed.length === 0) {
      r.failed = [`(${r.verdict})`]; // conservative: keep
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
  let derived = [...new Set([...warm, ...removable])].toSorted();
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
    derived = [...new Set(acc)].toSorted();
    fin = await runOracle(derived, 'final2');
  }

  const justification = {};
  for (const p of installed) {
    if (!derived.includes(p)) {
      justification[p] = cache.get(p)?.failed || ['(kept)'];
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
main();
