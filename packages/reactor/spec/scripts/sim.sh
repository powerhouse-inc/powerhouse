#!/bin/sh
# Simulator suite: safe instances must hold; witnesses and hazards must be violated.
set -u
cd "$(dirname "$0")" || exit 1
status=0
run() { sh "$@" || status=1; }

run expect-hold.sh stage1 noUnsupportedStore noMisreadRows noMisreadAdmitted
run expect-hold.sh receiptOnly noUnsupportedStore noMisreadRows noMisreadAdmitted

run expect-violation.sh stage1 witnessNoV3Doc witnessNoHold witnessNoRelease witnessNoNarrowInFlight witnessNoRefusal witnessNoRelayedV3

run expect-violation.sh gateOnly noUnsupportedStore
run expect-violation.sh stage1 noStuckHold
run expect-violation.sh misconfigured noStuckHold
run expect-violation.sh legacy noUnsupportedStore noMisreadAdmitted
run expect-violation.sh legacyUnordered noMisreadAdmitted
run expect-violation.sh liar noMisreadRowsSpread

exit $status
