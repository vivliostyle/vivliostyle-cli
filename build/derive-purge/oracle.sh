#!/bin/bash
# oracle.sh <purgeset-file> <suffix>
# Build the pre-purge base ($BASE, default vsslim:base) with the given purge set
# applied, run image-contract.sh from $CLI_DIR, and print "PASS" or
# "FAIL\n<failed test names>". Exit 0=pass, 1=fail, 2=build error.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE="${BASE:-vsslim:base}"
CLI_DIR="${CLI_DIR:?set CLI_DIR to the vivliostyle-cli checkout holding image-contract.sh}"
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

( cd "$CLI_DIR" && IMAGE="oracle:$SUF" ./build/image-contract.sh >"$HERE/contract-$SUF.log" 2>&1 )
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "PASS"
else
  echo "FAIL"
  grep -E '^  FAIL-' "$HERE/contract-$SUF.log" | sed 's/^  FAIL- *//'
fi
exit "$rc"
