#!/bin/sh
# Apalache suite. Bounds are chosen to finish in minutes.
set -u
cd "$(dirname "$0")" || exit 1
status=0
run() { sh verify.sh "$@" || status=1; }

run holds stage1 safety 6

exit $status
