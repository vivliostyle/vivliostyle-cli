# Deriving build/purge.txt

`build/purge.txt` is **not hand-written**. It is _derived_: the maximal set of
installed packages that can be force-purged from the assembled rootfs while
`image-contract.sh` still passes. This directory holds the tooling that derives
it, so the list can be regenerated and re-verified instead of curated by guesswork.

## Principle

A package is **removable** if, and only if, the slim image still satisfies
`image-contract.sh` after that package is purged. The contract is the oracle of
"the image works"; the purge list is the largest set of packages for which the
oracle still passes.

This is the dual of deriving a minimal Essential set: instead of finding the
smallest set that must stay, we find the largest set that may go. Neither static
dependency analysis (it cannot see dlopen / exec / data use, and it would keep
packages that are reachable but unwanted, e.g. gnupg) nor `apt-get autoremove`
(mmdebstrap marks every `--include` package manual, so it removes nothing) can do
this soundly. Only the behavioural test — purge it and run the contract — can.

Two directions matter and only the loop covers both:

- **over-purge** (removing something needed) is caught by a contract _failure_;
- **under-purge** (keeping removable cruft) is caught by the candidate generator
  proposing it and the contract _passing_ when it is purged.

At the fixpoint, every kept package has a contract test that fails without it, and
every removed package keeps the contract green — i.e. "purge one more and the
contract fails".

## Mechanism

1. **Candidate generator** — every package installed in the pre-purge rootfs
   (the full `--include` closure). `derive.mjs` reads it from the base image.

2. **Oracle** (`oracle.sh` + `oracle.Dockerfile`) — given a candidate purge set,
   apply it to the cached pre-purge base image and run `image-contract.sh`:
   - maintainer scripts (`*.prerm/*.postrm/*.preinst/*.postinst`) are deleted
     first and the purge uses `dpkg --purge --force-all`, so this _search_ is
     **order-independent** -- it never fails on maintainer-script ordering, which
     is a separate problem solved by `order.mjs` (see "Ordering the real purge").
     Neutralising scripts only for the search is sound: it leaves _staler_ state
     (un-run `update-alternatives`, un-rebuilt caches) than the real purge does, so
     a package removable against this harsher state is removable under the real
     purge too -- which the production build's contract run reverifies end-to-end;
   - the purged rootfs is shipped as a `scratch` image with the real final-stage
     config, so the contract judges exactly this purge.
     Output: `PASS`, or `FAIL` followed by the names of the failed contract tests.

3. **Driver** (`derive.mjs`) — by monotonicity (removing more can only make the
   contract fail more), a package needed against a small purge is needed against a
   larger one, so each candidate is tested **independently and in parallel**
   against the confirmed-removable base. A candidate that passes is removable; one
   that fails is kept, recorded with the contract test(s) that failed. The whole
   union is then verified together; if a cross-package interaction makes the union
   fail (several packages are individually removable but not jointly), a greedy
   re-derivation finds the maximal collectively-safe subset. Results are
   checkpointed to `results.jsonl`, so the run is resumable.
   Output: `derived-purge.txt` (the list) and `needed-justification.json` (for
   each kept package, the contract test that requires it).

## How to (re)derive

```shellsession
# 1. Build the pre-purge base once: the normal image build with empty purge lists
#    (build/purge.txt emptied), tagged vsslim:base.
$ docker build ... --tag vsslim:base .          # 269-package pre-purge rootfs

# 2. Run the loop against it (CONCURRENCY oracle workers; hours, resumable).
$ CLI_DIR=/path/to/vivliostyle-cli CONCURRENCY=8 node build/derive-purge/derive.mjs

# 3. The result is build/derive-purge/derived-purge.txt -> copy to build/purge.txt.
$ cp build/derive-purge/derived-purge.txt build/purge.txt

# 4. Derive the purge ORDER for the real purge (below); writes build/purge-deps.txt.
$ CLI_DIR=/path/to/vivliostyle-cli node build/derive-purge/order.mjs
```

Re-run on a Debian major bump, a dependency change, or whenever `image-contract.sh`
changes. A `WARM` file of already-known-removable packages may be supplied to skip
re-testing them (an optimisation only; the result is the same).

## Ordering the real purge

The search above neutralises maintainer scripts, but the production build
(`build/audit.ts`) runs a **real** purge — scripts execute, so conffiles,
alternatives and caches are cleaned. A maintainer script may call a tool from
another package, which must still be present when it runs. That is a partial
order — _purge P before T_ whenever P's script needs a tool from T — and the
purge order is a **topological sort** of it (determined recursively, not a flat
first/last split: a "late" tool may itself depend on another, e.g. `debconf`'s
frontend is `perl`). `audit.ts` sorts the union of two edge sets and purges **one
package at a time** in that order (a single multi-package `dpkg --purge` reorders
the removal internally, undoing the sort):

- **declared dependencies** — a package before the packages it depends on;
- **tool dependencies** (`purge-deps.txt`) — undeclared, so not visible in the
  declared graph; discovered by the execution loop `order.mjs`.

`order.mjs` runs the real purge on `vsslim:base`; for each script that fails with
`<tool>: not found` it maps the tool to its providing package(s) — following
`update-alternatives` symlinks (so `awk` → `mawk`) and, when the tool is itself a
`#!` script, also its interpreter's package (so a missing `debconf` frontend or
`update-rc.d` resolves to `perl-base`, not just the file's owner) — and adds the
edge `P T`. A new edge reshuffles the sort and can expose the next missing tool,
so it repeats until the purge is clean. For the v11.0.2 set this converged in 2
rounds to 27 edges, all pointing at the handful of tools every other script leans
on (`perl-base`, `debconf`, `init-system-helpers`, `mawk`, `findutils`,
`libpam-runtime`), which the sort therefore places last.

## Soundness and coverage

The derivation is maximal **with respect to `image-contract.sh`** — the contract's
coverage _is_ the definition of "works". The contract exercises the whole
system-package surface the CLI uses: the three browsers (GUI preview + headless
build, including a download via `chrome@130`), the bundled fonts, `press-ready`
(ghostscript + poppler, which also covers CMYK), `node`/`npm`/`pnpm`, `unzip`/`xz`,
and derived-image `apt` repair. The CLI's other outputs (epub / webbook / image)
are browser- and Node-internal and shell out to no extra system tool (only
`press-ready` does), so they add no system-package requirement. If a future
required behaviour is not exercised, extend the contract — do not hand-edit the
list — and re-derive.

## Result (cli-ref v11.0.2, linux/amd64)

- **114** packages derived removable (image: 269 → **155** packages), vs the 46 a
  human had curated — i.e. 68 packages were kept that the contract proves
  unnecessary (dbus, procps, ca-certificates/openssl, libsystemd-shared, several
  GTK/X/DRM libs, and data such as poppler-data / tzdata / xkb-data / fonts).
- One interaction: removing the full set together broke
  `derived image repair + install git`; the greedy pass kept **libattr1** (apt's
  repair path needs its extended-attribute support) and removed the rest. The
  final 114-package purge verifies PASS (30/30) together.
