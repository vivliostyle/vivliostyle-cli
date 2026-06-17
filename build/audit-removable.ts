import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

// Curation tool for build/purge.txt + build/purge-late.txt. NOT part of the build.
// It recomputes `removable` = installed packages NOT reachable at runtime and
// diffs that against the curated lists, so they can be regenerated on a Debian
// bump or dependency change. image-contract.sh remains the gate on whether the
// purged image still works.
//
// The closure is taken by two existing tools, so nothing is hand-rolled:
//   * lddtree (pax-utils) reads the bundled browser's shared-library tree from the
//     rootfs -- the browser is not a dpkg package, so apt has no reverse dependency
//     to follow; mapping its libraries to packages gives apt a foothold. (chrome
//     and chromium share these; firefox-only libs that this misses, e.g.
//     libdbus-glib, are the documented entries in keep-anyway.txt.)
//   * apt-cache depends --recurse expands that foothold plus the packages owning
//     the binaries image-contract.sh exercises into the full runtime closure,
//     working off the rootfs's own dpkg status (no apt lists, no network).
//
// HOW TO RUN (opt-in, no editing; the hook installs pax-utils):
//     docker buildx build --build-arg AUDIT_REMOVABLE=1 --progress=plain \
//         --allow security.insecure \
//         --build-arg VS_CLI_VERSION="$(jq -r .version package.json)" \
//         --build-arg BROWSER=chrome@<ver> . 2>&1 | sed -n '/^removable /,/^stale/p'

process.env.LC_ALL = 'C';

const ROOTFS = process.argv[2];
if (!ROOTFS) {
  process.stderr.write('usage: audit-removable.ts <pre-purge-rootfs>\n');
  process.exit(1);
}
const BUILD = import.meta.dirname;

// Run a command and return its stdout; '' on any failure (mirrors `2>/dev/null`).
function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    const out = (e as { stdout?: unknown }).stdout;
    return typeof out === 'string' ? out : '';
  }
}
const dq = (...args: string[]): string =>
  run('dpkg-query', [`--admindir=${ROOTFS}/var/lib/dpkg`, ...args]);
const readList = (name: string): string[] => {
  let text = '';
  try {
    text = fs.readFileSync(`${BUILD}/${name}`, 'utf8');
  } catch {}
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
};
const byteCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const fmt = (xs: Iterable<string>): string =>
  [...new Set(xs)].toSorted(byteCmp).join(' ') || '-';
// usrmerge: lddtree prints /lib paths but dpkg records the /usr-merged form.
const canon = (p: string): string =>
  /^\/(lib|bin|sbin|lib32|lib64|libx32)\//.test(p) ? `/usr${p}` : p;
// Owning package of a rootfs path, or '' (dpkg -S prints "pkg1, pkg2: /path").
const owner = (p: string): string =>
  dq('-S', p).split(':')[0]?.split(',')[0]?.trim() ?? '';

const installed = dq('-W', '--showformat=${db:Status-Abbrev} ${Package}\n')
  .split('\n')
  .filter((l) => l.startsWith('ii '))
  .map((l) => l.replace(/^ii */, ''));
const installedSet = new Set(installed);

// ---- runtime seed packages ------------------------------------------------
const seeds = new Set(['apt', 'dpkg', 'ca-certificates']);
const add = (pkg: string) => {
  if (pkg && installedSet.has(pkg)) {
    seeds.add(pkg);
  }
};
// packages owning the binaries image-contract.sh exercises
for (const bin of 'node npm pnpm gs pdftops pdfinfo fc-match fc-list fc-cache unzip xz tar apt apt-get dpkg dpkg-deb dpkg-query'.split(
  ' ',
)) {
  add(owner(`/usr/bin/${bin}`));
}
// the bundled browser's shared-library packages, via lddtree over the rootfs
for (const bin of fs.globSync(
  `${ROOTFS}/opt/puppeteer/chrome/*/chrome-linux*/{chrome,chrome-sandbox,chrome_crashpad_handler}`,
)) {
  for (const line of run('lddtree', [
    '--root',
    ROOTFS,
    '-l',
    bin.slice(ROOTFS.length),
  ]).split('\n')) {
    if (line.startsWith(`${ROOTFS}/`)) {
      add(owner(canon(line.slice(ROOTFS.length))));
    }
  }
}
if (installedSet.has('chromium')) {
  add('chromium'); // arm64 redirects chrome to the chromium package
}

// ---- runtime closure via apt-cache (reads dpkg status; no apt lists/network) ---
const reachable = new Set(
  run('chroot', [
    ROOTFS,
    'apt-cache',
    'depends',
    '--recurse',
    '--installed',
    '--no-recommends',
    '--no-suggests',
    '--no-conflicts',
    '--no-breaks',
    '--no-replaces',
    '--no-enhances',
    ...seeds,
  ])
    .split('\n')
    .filter((l) => l && !/^\s/.test(l) && !l.startsWith('<'))
    .map((l) => l.trim()),
);

// ---- removable = installed \ reachable; diff against the curated lists --------
const removable = new Set(installed.filter((p) => !reachable.has(p)));
const keep = new Set(readList('keep-anyway.txt'));
const purge = new Set([
  ...readList('purge.txt'),
  ...readList('purge-late.txt'),
]);

process.stdout.write(`removable (${removable.size}): ${fmt(removable)}\n\n`);
process.stdout.write(
  `seeds ${seeds.size}, reachable ${reachable.size}, installed ${installed.length}\n`,
);
process.stdout.write(
  `unclassified removable -- add to purge.txt or keep-anyway.txt: ${fmt(
    [...removable].filter((p) => !keep.has(p) && !purge.has(p)),
  )}\n`,
);
process.stdout.write(
  `keep-anyway now reachable (drop): ${fmt(
    [...keep].filter((p) => installedSet.has(p) && reachable.has(p)),
  )}\n`,
);
process.stdout.write(
  `stale, not installed (drop): keep=[${fmt(
    [...keep].filter((p) => !installedSet.has(p)),
  )}] purge=[${fmt([...purge].filter((p) => !installedSet.has(p)))}]\n`,
);
