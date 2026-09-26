#!/bin/sh
# Apalache suite over the one-document instances. Bounds are chosen to finish in minutes.
set -u
cd "$(dirname "$0")" || exit 1
status=0
run() { sh verify.sh "$@" || status=1; }
SAFE=noUnsupportedStore,noMisreadRows,noMisreadAdmitted

run holds stage1One $SAFE 12
run violated gateOnlyOne noUnsupportedStore 10
run violated stage1One noStuckHold 12
run holds stage1SeqOne noStuckHold,noManifestRegress 10

# Finding 2: the rollback leak, with and without the candidate fixes.
run violated legacyOne noMisreadAdmitted 10
run violated legacySendGateOne noMisreadAdmitted 10
run violated legacyPushFieldOne noUnsupportedStore 10
run holds fixedOne $SAFE 10

# A server back from a legacy build keeps its record of a client that rolled back meanwhile.
run violated fixedNoPollRevisionOne noUnsupportedStore 10

# Finding 4: with poll revisions, safety no longer needs the handshake-first transport assumption.
run holds fixedNoHandshakeOne $SAFE 10

exit $status
