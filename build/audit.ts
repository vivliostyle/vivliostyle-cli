import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

// Purge-list applier (build-time). Reads the curated static force-purge lists and
// writes the two dpkg --purge passes the Dockerfile runs. It does NOT decide what
// is removable: that curation lives in the lists, and is regenerated / verified
// out of band by build/audit-removable.ts (see its header). image-contract.sh is
// the gate that the purged image still works.
//
//   purge.txt       force-purged in pass 1
//   purge-late.txt  force-purged in pass 2 -- tools (debconf / perl-base / mawk,
//                   libpython3*) that pass 1's postrm scripts still call
//
// Runs as an mmdebstrap customize-hook with argv[2] = the pre-purge rootfs; it
// reads that rootfs's dpkg DB and writes only <rootfs>/tmp/.purge-pass{1,2}.

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
    const out = (e as { stdout?: unknown }).stdout;
    return typeof out === 'string' ? out : '';
  }
}

// Non-comment, non-blank lines of a sibling list file.
function readList(name: string): string[] {
  let text = '';
  try {
    text = fs.readFileSync(`${BUILD}/${name}`, 'utf8');
  } catch {}
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// Installed (status ii) packages, and a Provides -> real-package map so a
// dependency named by a virtual package resolves to what is actually installed.
const installed = new Set(
  dq('-W', '--showformat=${db:Status-Abbrev} ${Package}\n')
    .split('\n')
    .filter((l) => l.startsWith('ii '))
    .map((l) => l.replace(/^ii */, '')),
);
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
    .replace(/\([^)]*\)/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (!real.has(v)) {
      real.set(v, pkg);
    }
  }
}

// Direct dependencies (Depends + Pre-Depends) resolved to real package names.
const depsOf = (pkg: string): string[] =>
  dq('-W', '--showformat=${Depends}|${Pre-Depends}\n', pkg)
    .replace(/\([^)]*\)/g, '')
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((d) => real.get(d))
    .filter((d): d is string => Boolean(d));

// Order a purge set so each package comes BEFORE the packages it depends on. dpkg
// runs maintainer scripts in argument order and a prerm / postrm may call a tool
// from one of its own dependencies (e.g. libpam-systemd's prerm runs
// pam-auth-update from libpam-runtime); removing the dependency first fails (127).
function purgeOrder(pkgs: string[]): string[] {
  const set = new Set(pkgs);
  const done = new Set<string>();
  const post: string[] = [];
  const visit = (p: string): void => {
    if (done.has(p)) {
      return;
    }
    done.add(p);
    for (const d of depsOf(p)) {
      if (set.has(d)) {
        visit(d);
      }
    }
    post.push(p);
  };
  for (const p of pkgs) {
    visit(p);
  }
  return post.toReversed(); // dependents before their dependencies
}

const byteCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const onlyInstalled = (names: string[]): string[] =>
  [...new Set(names)].filter((p) => installed.has(p)).toSorted(byteCmp);

const pass1 = purgeOrder(onlyInstalled(readList('purge.txt')));
const pass2 = purgeOrder(onlyInstalled(readList('purge-late.txt')));

fs.writeFileSync(
  `${ROOTFS}/tmp/.purge-pass1`,
  pass1.length ? `${pass1.join('\n')}\n` : '',
);
fs.writeFileSync(
  `${ROOTFS}/tmp/.purge-pass2`,
  pass2.length ? `${pass2.join('\n')}\n` : '',
);

process.stdout.write(
  `audit: pass1 (${pass1.length}): ${pass1.join(' ') || '-'}\n`,
);
process.stdout.write(
  `audit: pass2 (${pass2.length}): ${pass2.join(' ') || '-'}\n`,
);
