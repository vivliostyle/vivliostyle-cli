/// <reference types="node" />
// Execution loop that discovers build/purge-deps.txt -- the tool-dependency edges
// "P T" meaning package P's maintainer script calls a tool from package T, so P
// must be purged before T. build/audit.ts runs a real purge (scripts execute) and
// orders it by a topological sort of these edges plus the declared dependencies;
// the undeclared tool edges cannot be read off the scripts statically (they
// source/exec dynamically), so they are found here: run the purge on vsslim:base,
// read which command each failing script reported as "not found", map it to the
// package that provides it, and add that edge. Adding an edge reshuffles the topo
// order and may expose the next missing tool, so repeat until the purge is clean.
// Env: CLI_DIR (the checkout holding build/), BASE (default vsslim:base).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HERE = import.meta.dirname;
const BUILD = path.dirname(HERE);
const BASE = process.env.BASE || 'vsslim:base';
const CLI_DIR = process.env.CLI_DIR;
if (!CLI_DIR) {
  process.stderr.write('set CLI_DIR to the vivliostyle-cli checkout\n');
  process.exit(1);
}
const DEPS = `${BUILD}/purge-deps.txt`;

/** @param {string} m */
const log = (m) => process.stdout.write(`${m}\n`);
/**
 * @param {string} f
 * @returns {string[]}
 */
const lines = (f) =>
  (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '').split('\n');
/**
 * @param {string} f
 * @returns {string[]}
 */
const items = (f) =>
  lines(f)
    .map((s) => s.trim())
    .filter((l) => l && !l.startsWith('#'));
const purgeSet = new Set(items(`${BUILD}/purge.txt`));

// Resolve each command / path reported "not found" to the package(s) that must
// outlive the script using it, looked up in BASE. A "not found" can mean the file
// is gone OR (for a script) its interpreter is gone -- the shell reports the
// script's name either way -- so resolve through alternatives symlinks
// (readlink -f) and, if the target is a #! script, also return its interpreter's
// package. Returns token -> [package, ...].
/**
 * @param {string[]} tokens
 * @returns {Map<string, string[]>}
 */
const resolve = (tokens) => {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  if (tokens.length === 0) {
    return map;
  }
  const sh = [
    'for t in "$@"; do',
    '  case "$t" in /*) f="$t" ;; *) f="$(command -v "$t" 2>/dev/null)" ;; esac;',
    '  f="$(readlink -f "$f" 2>/dev/null)"; pkgs="";',
    '  if [ -n "$f" ]; then',
    '    pkgs="$(dpkg-query -S "$f" 2>/dev/null | head -1 | cut -d: -f1)";',
    '    if [ -f "$f" ] && [ "$(head -c2 "$f" 2>/dev/null)" = "#!" ]; then',
    '      i="$(head -1 "$f" | sed \'s/^#![[:space:]]*//; s/[[:space:]].*//\')";',
    '      i="$(readlink -f "$i" 2>/dev/null)";',
    '      ip="$(dpkg-query -S "$i" 2>/dev/null | head -1 | cut -d: -f1)";',
    '      [ -n "$ip" ] && pkgs="$pkgs $ip";',
    '    fi;',
    '  fi;',
    '  echo "$t $pkgs";',
    'done',
  ].join(' ');
  const out = execFileSync(
    'docker',
    ['run', '--rm', '--entrypoint', 'sh', BASE, '-c', sh, 'sh', ...tokens],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  for (const l of out.split('\n')) {
    const [t, ...pkgs] = l.trim().split(/\s+/v);
    if (t) {
      map.set(t, pkgs.filter(Boolean));
    }
  }
  return map;
};

const FAIL =
  /\/var\/lib\/dpkg\/info\/([^:\s\/]+)(?::\w+)?\.(?:prerm|postrm|preinst|postinst):\s*\d+:\s*(?:exec:\s*)?([^\s:]+):\s*not found/gv;

for (let round = 1; round <= 40; round++) {
  const ctx = fs.mkdtempSync('/tmp/order-');
  fs.cpSync(`${CLI_DIR}/build`, `${ctx}/build`, { recursive: true });
  fs.writeFileSync(
    `${ctx}/Dockerfile`,
    `FROM ${BASE}\nUSER root\nCOPY build /b\nRUN node /b/audit.ts /\n`,
  );
  let out = '';
  let clean = false;
  try {
    execFileSync('docker', ['build', '-t', 'vsslim:ot', ctx], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    clean = true;
  } catch (e) {
    const stdout =
      typeof e === 'object' &&
      e !== null &&
      'stdout' in e &&
      typeof e.stdout === 'string'
        ? e.stdout
        : '';
    const stderr =
      typeof e === 'object' &&
      e !== null &&
      'stderr' in e &&
      typeof e.stderr === 'string'
        ? e.stderr
        : '';
    out = `${stdout}${stderr}`;
  }
  fs.rmSync(ctx, { recursive: true, force: true });
  try {
    execFileSync('docker', ['rmi', '-f', 'vsslim:ot'], { stdio: 'ignore' });
  } catch {}

  if (clean) {
    log(`round ${round}: PURGE CLEAN -- ${items(DEPS).length} tool-edges`);
    process.exit(0);
  }
  const needs = [...out.matchAll(FAIL)].map((m) => [m[1], m[2]]);
  if (needs.length === 0) {
    log(
      `round ${round}: build failed with no "not found" maintainer-script error`,
    );
    process.stderr.write(out.slice(-2000));
    process.exit(1);
  }
  const tok2pkgs = resolve([...new Set(needs.map(([, t]) => t))]);
  const have = new Set(items(DEPS));
  /** @type {string[]} */
  const add = [];
  for (const [p, t] of needs) {
    const deps = tok2pkgs.get(t) ?? [];
    if (deps.length === 0) {
      log(`  warn: "${t}" (needed by ${p}) resolved to no package`);
      continue;
    }
    for (const dep of deps) {
      if (dep === p || !purgeSet.has(dep)) {
        continue;
      }
      const edge = `${p} ${dep}`;
      if (!have.has(edge) && !add.includes(edge)) {
        add.push(edge);
      }
    }
  }
  if (add.length === 0) {
    log(
      `round ${round}: failures but no new edges (cycle/unresolved) -- stopping`,
    );
    needs.forEach(([p, t]) => {
      log(`  ${p} needs ${t} -> ${(tok2pkgs.get(t) ?? []).join(',') || '?'}`);
    });
    process.exit(1);
  }
  log(`round ${round}: +${add.length} edges -> ${add.join(', ')}`);
  const header = lines(DEPS).filter((l) => l.startsWith('#'));
  fs.writeFileSync(DEPS, [...header, ...items(DEPS), ...add].join('\n') + '\n');
}
log('did not converge in 40 rounds');
process.exit(1);
