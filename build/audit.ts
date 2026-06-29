import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

// Apply build/purge.txt -- the DERIVED maximal set of install-time-only packages
// removable while image-contract.sh still passes (see build/derive-purge/ for how
// the list is derived and verified).
//
// This is a real purge: maintainer scripts RUN (conffiles removed, alternatives
// and caches cleaned), so a script's tool dependencies must still be present when
// it runs. That is a partial order -- "purge P before T" whenever P's script calls
// a tool from package T -- and the purge order is a topological sort of it. The
// edges are (a) declared dependencies (a package is purged before the packages it
// depends on) and (b) tool dependencies that are NOT declared (an essential tool
// used without a dependency, e.g. python3's prerm calling find/xargs); the latter
// cannot be read off the scripts statically and are discovered by an execution
// loop into build/purge-deps.txt (see build/derive-purge/order.mjs). dpkg is left
// deliberately broken, as the README documents.
//
// Runs as an mmdebstrap customize-hook with argv[2] = the assembled rootfs.

process.env.LC_ALL = 'C';

const ROOTFS = process.argv[2];
if (!ROOTFS) {
  process.stderr.write('usage: audit.ts <rootfs>\n');
  process.exit(1);
}
const BUILD = import.meta.dirname;

// dpkg-query against the rootfs admin DB; '' on failure (mirrors `2>/dev/null`).
function dq(...args: string[]): string {
  try {
    return execFileSync(
      'dpkg-query',
      [`--admindir=${ROOTFS}/var/lib/dpkg`, ...args],
      {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
  } catch (e) {
    const out =
      typeof e === 'object' && e !== null && 'stdout' in e
        ? e.stdout
        : undefined;
    return typeof out === 'string' ? out : '';
  }
}
const read = (name: string): string[] =>
  (() => {
    try {
      return fs.readFileSync(`${BUILD}/${name}`, 'utf8');
    } catch {
      return '';
    }
  })()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

const installed = new Set(
  dq('-W', '--showformat=${db:Status-Abbrev} ${Package}\n')
    .split('\n')
    .filter((l) => l.startsWith('ii '))
    .map((l) => l.replace(/^ii */v, '')),
);

// Provides -> real installed package, so a dependency named by a virtual package
// resolves to the package that actually carries it.
const real = new Map<string, string>();
for (const line of dq('-W', '--showformat=${Package}\t${Provides}\n').split(
  '\n',
)) {
  const [pkg, prov = ''] = line.split('\t');
  if (!pkg) {
    continue;
  }
  real.set(pkg, pkg);
  for (const v of prov
    .replaceAll(/\([^\)]*\)/gv, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (!real.has(v)) {
      real.set(v, pkg);
    }
  }
}
const declaredDeps = (pkg: string): string[] =>
  dq('-W', '--showformat=${Depends}|${Pre-Depends}\n', pkg)
    .replaceAll(/\([^\)]*\)/gv, '')
    .split(/[,\|]/v)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((d) => real.get(d))
    .filter((d): d is string => d !== undefined);

// Tool-dependency edges "P T" discovered by order.mjs (P's script calls a tool
// from T), not derivable from the declared dependencies above.
const extra = new Map<string, string[]>();
for (const line of read('purge-deps.txt')) {
  const [p, dep] = line.split(/\s+/v);
  if (p && dep) {
    extra.set(p, [...(extra.get(p) ?? []), dep]);
  }
}

const all = [...new Set(read('purge.txt').filter((p) => installed.has(p)))];
const inSet = new Set(all);
const edges = (pkg: string): string[] =>
  [...declaredDeps(pkg), ...(extra.get(pkg) ?? [])].filter(
    (d) => inSet.has(d) && d !== pkg,
  );

// Topological sort of the "purge P before T" relation: emit a package only after
// recursively emitting the packages it must precede, then reverse. A cycle (rare
// for maintainer-script tool use) is broken by the visited guard.
const done = new Set<string>();
const post: string[] = [];
const visit = (p: string): void => {
  if (done.has(p)) {
    return;
  }
  done.add(p);
  for (const d of edges(p)) {
    visit(d);
  }
  post.push(p);
};
for (const p of all) {
  visit(p);
}
const order = post.toReversed();

// One `dpkg --purge` PER PACKAGE, in topological order: a single call with many
// packages lets dpkg reorder the removal (undoing the order), so each package gets
// its own call inside one chroot. A package whose maintainer script fails is
// recorded (AUDITFAIL) but does not stop the rest, so order.mjs sees the whole
// failing set in one run.
const FORCE =
  '--force-depends --force-remove-essential --force-remove-protected';
const loop = `for p in "$@"; do dpkg --purge ${FORCE} "$p" 1>&2 || echo "AUDITFAIL $p"; done`;
const out =
  order.length > 0
    ? execFileSync('chroot', [ROOTFS, 'sh', '-c', loop, 'sh', ...order], {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
      })
    : '';
const failed = out
  .split('\n')
  .filter((l) => l.startsWith('AUDITFAIL '))
  .map((l) => l.slice('AUDITFAIL '.length).trim())
  .filter(Boolean);
process.stdout.write(
  `audit: purged ${order.length} packages (${extra.size} with discovered tool-edges); script failures ${failed.length}\n`,
);
if (failed.length > 0) {
  process.stderr.write(
    `audit: maintainer-script failures: ${failed.join(' ')}\n`,
  );
  process.exit(1);
}
