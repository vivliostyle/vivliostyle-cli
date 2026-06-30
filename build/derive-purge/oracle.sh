#!/bin/bash
# oracle.sh <purgeset-file> <suffix>
# Build the pre-purge base ($BASE, default vsslim:base) with the given purge set
# applied, run the contract suite (tests/docker, via testcontainers) from
# $CLI_DIR against it, and print "PASS" or "FAIL\n<failed test names>".
# Exit 0=pass, 1=fail, 2=build error.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE="${BASE:-vsslim:base}"
CLI_DIR="${CLI_DIR:?set CLI_DIR to the vivliostyle-cli checkout (node_modules installed) holding the contract suite}"
PURGESET="$1"
SUF="${2:-trial}"

ctx="$(mktemp -d)"
cp "$HERE/oracle.Dockerfile" "$ctx/Dockerfile"
cp "$PURGESET" "$ctx/purgeset.txt"
# Default daemon builder (not the docker-container one) so FROM "$BASE" resolves
# the local image. No mmdebstrap here, so no --security=insecure is needed.
if ! docker build --build-arg "BASE=$BASE" --tag "oracle:$SUF" "$ctx" \
      >"$HERE/build-$SUF.log" 2>&1; then
  echo "BUILD_FAIL"; rm -rf "$ctx"; exit 2
fi
rm -rf "$ctx"

# Run the contract suite against the freshly built oracle image. The JSON report
# yields the names of any failed checks, which derive.mjs records as the
# justification for keeping a package.
RESULT="$HERE/result-$SUF.json"
rm -f "$RESULT"
( cd "$CLI_DIR" && VIVLIOSTYLE_CLI_IMAGE="oracle:$SUF" \
    pnpm exec vitest run --config vite.docker.config.ts \
      --reporter=default --reporter=json --outputFile="$RESULT" \
    >"$HERE/contract-$SUF.log" 2>&1 )
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "PASS"
else
  echo "FAIL"
  # Failed-check names from the JSON report (empty if vitest crashed before
  # writing one, e.g. the purged image will not start at all).
  node -e '
    const fs = require("node:fs");
    try {
      const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      for (const s of r.testResults || [])
        for (const t of s.assertionResults || [])
          if (t.status === "failed") console.log(t.fullName || t.title);
    } catch {}
  ' "$RESULT"
fi
exit "$rc"
