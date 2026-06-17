import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Audit gate: every package the runtime-closure analysis below flags as purgable
// must be classified in build/keep-packages.txt, build/purge-packages.txt, or
// build/purge-packages-late.txt; otherwise the build fails here. This is how the
// purge lists are maintained -- empty them and let the errors name what to
// triage, the same try-and-error loop as the essential-packages list in the Dockerfile.
//
// It runs on the BUILD HOST during the mmdebstrap customize-hook, before the
// purge hooks, with argv[2] = the pre-purge rootfs. It only READS that rootfs
// (readelf / dpkg-query --admindir / ldconfig -C) and downloads the extra
// browsers outside it, so the runtime image is never touched.
//
// The closure follows DT_NEEDED links, so keep-packages.txt must cover what it
// cannot see: data read via fontconfig/icon/mime caches, Essentials used without
// being declared, dlopen (mesa, libsystemd-shared, firefox's libcloudproviders0)
// and exec (chrome's sandbox walking /proc via ps).

// LC_ALL=C parity for the child processes (dpkg-query / ldconfig / readelf) and
// for the byte-wise string sorts the original relied on `sort` for.
process.env.LC_ALL = 'C';

const ROOTFS = process.argv[2];
if (!ROOTFS) {
  process.stderr.write('usage: audit.ts <rootfs>\n');
  process.exit(1);
}

// The package lists are this script's siblings; the browser installer and the
// target architecture come from the rootfs under audit, so nothing here depends
// on the Dockerfile's build-time paths.
const BUILD = import.meta.dirname;
const BROWSERS = `${ROOTFS}/opt/vivliostyle-cli/node_modules/.bin/browsers`;

const MAX_BUFFER = 256 * 1024 * 1024;

// Run a command and return its stdout; '' on any failure. The original pipes
// every dpkg-query / readelf / ldconfig through `2>/dev/null` and feeds whatever
// reached stdout into the next stage, ignoring the exit status.
function runQuiet(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    const out = (e as { stdout?: unknown }).stdout;
    return typeof out === 'string' ? out : '';
  }
}

// dpkg-query against the rootfs admin DB.
function dq(...args: string[]): string {
  return runQuiet('dpkg-query', [`--admindir=${ROOTFS}/var/lib/dpkg`, ...args]);
}

// Strip comments and blank lines from a package-list file (sed -e '/^#/d' -e '/^$/d').
function strip(file: string): string[] {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {}
  return text
    .split('\n')
    .filter((l) => !/^[ \t]*#/.test(l) && !/^[ \t]*$/.test(l));
}

// usrmerge: ld.so.cache stores /lib paths but dpkg records the /usr-merged form.
function canon(p: string): string {
  return /^\/(lib|bin|sbin|lib32|lib64|libx32)\//.test(p) ? `/usr${p}` : p;
}

// Byte-wise comparator (LC_ALL=C `sort`), used for the set-difference steps.
const byteCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Expand a shell-style glob (only `*` within a path segment) to existing paths.
// A pattern with no match -- like a literal seed path that is absent -- yields
// [], mirroring bash's unset `nullglob` + the `[ -e ]` guard in `add`.
function glob(pattern: string): string[] {
  const segs = pattern.split('/');
  let cur = [segs[0]]; // '' for an absolute path
  for (let i = 1; i < segs.length; i++) {
    const seg = segs[i];
    const next: string[] = [];
    if (seg.includes('*')) {
      const re = new RegExp(
        `^${seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`,
      );
      for (const base of cur) {
        let entries: string[];
        try {
          entries = fs.readdirSync(base === '' ? '/' : base);
        } catch {
          continue;
        }
        for (const e of entries) {
          if (re.test(e)) {
            next.push(`${base}/${e}`);
          }
        }
      }
    } else {
      for (const base of cur) {
        next.push(`${base}/${seg}`);
      }
    }
    cur = next;
  }
  return cur.filter((p) => fs.existsSync(p));
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// DT_NEEDED sonames of an ELF file (readelf -d). '' / non-ELF inputs yield [].
function needed(file: string): string[] {
  const res: string[] = [];
  for (const line of runQuiet('readelf', ['-d', file]).split('\n')) {
    const m = line.match(/\(NEEDED\).*\[(.*)\]/);
    if (m) {
      res.push(m[1]);
    }
  }
  return res;
}

function installBrowser(dl: string, name: string): boolean {
  try {
    execFileSync(BROWSERS, ['install', name, '--path', dl], {
      stdio: 'ignore',
      maxBuffer: MAX_BUFFER,
    });
    return true;
  } catch {
    return false;
  }
}

function audit(dl: string): number {
  const arch = dq('-W', '--showformat=${Architecture}\n', 'dpkg').split(
    '\n',
  )[0];

  // ---- contract browsers (read-only, downloaded outside the rootfs) ---------
  // image-contract.sh installs chrome / chromium / firefox in derived images, so
  // the slim image must keep their shared-library packages. The bundle ships one;
  // download the others to a throwaway host directory only to read their NEEDED
  // entries below. Nothing here is written into the rootfs.
  if (!installBrowser(dl, 'firefox')) {
    process.stderr.write(
      'audit: could not download firefox for closure analysis\n',
    );
    return 1;
  }
  if (arch === 'amd64' && !installBrowser(dl, 'chromium')) {
    process.stderr.write(
      'audit: could not download chromium for closure analysis\n',
    );
    return 1;
  }

  // ---- seeds ----------------------------------------------------------------
  // Everything image-contract.sh exercises at runtime. Rootfs files are read at
  // their rootfs-prefixed host path; the extra browsers live under `dl`.
  const seeds: string[] = [];
  const add = (...patterns: string[]) => {
    for (const pat of patterns) {
      for (const m of glob(pat)) {
        seeds.push(m);
      }
    }
  };
  add(
    `${ROOTFS}/usr/bin/node`,
    `${ROOTFS}/usr/bin/npm`,
    `${ROOTFS}/usr/bin/pnpm`,
    `${ROOTFS}/usr/bin/pnpx`,
  );
  add(`${ROOTFS}/usr/bin/chromium`);
  add(
    `${ROOTFS}/opt/puppeteer/chrome/*/chrome-linux*/chrome`,
    `${ROOTFS}/opt/puppeteer/chrome/*/chrome-linux*/chrome-sandbox`,
    `${ROOTFS}/opt/puppeteer/chrome/*/chrome-linux*/chrome_crashpad_handler`,
    `${dl}/chromium/*/chrome-linux/chrome`,
    `${dl}/chromium/*/chrome-linux/chrome-sandbox`,
    `${dl}/firefox/*/firefox/firefox`,
    `${dl}/firefox/*/firefox/firefox-bin`,
  );
  // firefox routes work through libxul + $ORIGIN-relative helpers; chromium's
  // swiftshader / vulkan .so sit next to chrome. Seed every .so in those dirs.
  for (const d of [
    ...glob(`${dl}/firefox/*/firefox`),
    ...glob(`${dl}/chromium/*/chrome-linux`),
  ]) {
    if (!isDir(d)) {
      continue;
    }
    add(`${d}/*.so`);
  }
  add(
    `${ROOTFS}/usr/bin/gs`,
    `${ROOTFS}/usr/bin/pdftops`,
    `${ROOTFS}/usr/bin/pdfinfo`,
  );
  add(
    `${ROOTFS}/usr/bin/fc-list`,
    `${ROOTFS}/usr/bin/fc-match`,
    `${ROOTFS}/usr/bin/fc-cache`,
    `${ROOTFS}/usr/bin/fc-query`,
  );
  add(
    `${ROOTFS}/usr/bin/unzip`,
    `${ROOTFS}/usr/bin/xz`,
    `${ROOTFS}/usr/bin/tar`,
  );
  add(
    `${ROOTFS}/usr/bin/apt`,
    `${ROOTFS}/usr/bin/apt-get`,
    `${ROOTFS}/usr/bin/apt-cache`,
    `${ROOTFS}/usr/bin/dpkg`,
    `${ROOTFS}/usr/bin/dpkg-deb`,
    `${ROOTFS}/usr/bin/dpkg-query`,
  );
  add(`${ROOTFS}/usr/local/bin/vivliostyle`, `${ROOTFS}/usr/local/bin/vs`);
  add(`${ROOTFS}/opt/vivliostyle-cli/node_modules/.bin/press-ready`);

  // ---- shared-library closure (readelf + the rootfs ld.so.cache) ------------
  // The slim rootfs has no bash, so its ldd (a bash script) cannot run there;
  // resolve DT_NEEDED with readelf and the rootfs cache instead. This yields the
  // same package set as a recursive ldd.
  const sopath = new Map<string, string>(); // soname -> canonical path, first wins
  for (const line of runQuiet('ldconfig', [
    '-C',
    `${ROOTFS}/etc/ld.so.cache`,
    '-p',
  ]).split('\n')) {
    const arrow = line.lastIndexOf(' => ');
    if (arrow === -1) {
      continue;
    }
    const sn = line.replace(/^\t/, '').split(' ')[0];
    if (!sopath.has(sn)) {
      sopath.set(sn, canon(line.slice(arrow + 4)));
    }
  }

  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length) {
    const f = queue.shift()!;
    if (seen.has(f)) {
      continue;
    }
    seen.add(f);
    if (!fs.existsSync(f)) {
      continue;
    }
    for (const sn of needed(f)) {
      const p = sopath.get(sn);
      if (p) {
        queue.push(ROOTFS + p);
      }
    }
  }

  // Map every visited rootfs file to its owning package.
  const closure = new Set<string>();
  for (const f of seen) {
    if (!f.startsWith(`${ROOTFS}/`)) {
      continue;
    }
    for (const line of dq('-S', f.slice(ROOTFS.length)).split('\n')) {
      if (!line) {
        continue;
      }
      for (const part of line.split(':')[0].split(',')) {
        const name = part.replace(/\s/g, '');
        if (name) {
          closure.add(name);
        }
      }
    }
  }

  // ---- declared-dependency closure ------------------------------------------
  // Walk Depends + Pre-Depends from the linked closure, resolving Provides so
  // virtual names match the real package. Catches keepers the linker misses:
  // helpers spawned via exec, daemons we depend on but do not link.
  const real = new Map<string, string>();
  for (const line of dq('-W', '--showformat=${Package}\t${Provides}\n').split(
    '\n',
  )) {
    const tab = line.indexOf('\t');
    if (tab === -1) {
      continue;
    }
    const pkg = line.slice(0, tab);
    if (!pkg) {
      continue;
    }
    real.set(pkg, pkg);
    const prov = line.slice(tab + 1);
    if (!prov) {
      continue;
    }
    for (const v of prov
      .replace(/\([^)]*\)/g, '')
      .split(',')
      .map((s) => s.replace(/\s/g, ''))
      .filter(Boolean)) {
      if (!real.has(v)) {
        real.set(v, pkg);
      }
    }
  }

  const visited = new Set<string>();
  const depqueue = [...closure, 'apt', 'dpkg', 'ca-certificates'];
  for (let i = 0; i < depqueue.length; i++) {
    const pkg = depqueue[i];
    if (!pkg || visited.has(pkg)) {
      continue;
    }
    visited.add(pkg);
    for (const dep of dq('-W', '--showformat=${Depends}|${Pre-Depends}\n', pkg)
      .replace(/\([^)]*\)/g, '')
      .split(/[,|]/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      const r = real.get(dep);
      if (r && !visited.has(r)) {
        depqueue.push(r);
      }
    }
  }

  // ---- candidates = installed - closure -------------------------------------
  const installed = [
    ...new Set(
      dq('-W', '--showformat=${db:Status-Abbrev} ${Package}\n')
        .split('\n')
        .filter((l) => l.startsWith('ii '))
        .map((l) => l.replace(/^ii */, '')),
    ),
  ].toSorted(byteCmp);
  const candidates = installed.filter((p) => !visited.has(p));

  // ---- gate: every candidate must be classified -----------------------------
  const classified = new Set<string>([
    ...strip(`${BUILD}/keep-packages.txt`),
    ...strip(`${BUILD}/purge-packages.txt`),
    ...strip(`${BUILD}/purge-packages-late.txt`),
  ]);
  const unclassified = candidates.filter((p) => !classified.has(p));

  if (unclassified.length) {
    process.stderr.write(
      'audit: purgable packages not classified in build/{keep,purge,purge-packages-late}-packages.txt:\n',
    );
    const rows = unclassified.map((p) => {
      const size = dq('-W', '--showformat=${Installed-Size}', p).trim();
      return `  ${size.padStart(10)} KB  ${p}`;
    });
    // sort -rn: numeric desc by the leading size, ties broken by full-line desc.
    rows.sort((a, b) => {
      const na = Number.parseInt(a, 10) || 0;
      const nb = Number.parseInt(b, 10) || 0;
      return nb - na || -byteCmp(a, b);
    });
    process.stderr.write(`${rows.join('\n')}\n`);
    process.stderr.write(
      'audit: classify each as keep / purge / purge-packages-late, then rebuild.\n',
    );
    return 1;
  }
  process.stdout.write(
    `audit: ${candidates.length} purgable packages, all classified.\n`,
  );
  return 0;
}

// Throwaway host directory for the contract browsers, cleaned up on every exit
// path (the original used `trap ... EXIT`).
const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
let code: number;
try {
  code = audit(dl);
} finally {
  fs.rmSync(dl, { recursive: true, force: true });
}
process.exit(code);
