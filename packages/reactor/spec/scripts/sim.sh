#!/bin/sh
# Simulator suite (quint run). Every line must print "ok".
set -u
cd "$(dirname "$0")" || exit 1
status=0
holds() { sh expect-hold.sh "$@" || status=1; }
violated() { sh expect-violation.sh "$@" || status=1; }
SAFE="noUnsupportedStore noMisreadRows noMisreadAdmitted noMisreadRowsSpread"

# The plan as written: safety holds without rollbacks; the receipt refusals carry it, not the gate.
holds stage1 $SAFE outboxGated
holds receiptOnly $SAFE
violated gateOnly noUnsupportedStore
violated stage1 witnessNoV3Doc witnessNoHold witnessNoRelease witnessNoNarrowInFlight witnessNoRefusal witnessNoPeerRefusal witnessNoRelayedV3

# Finding 2: rollback leak. Re-running the gate at send does not close it. The push field closes the
# push path; a regressed manifest (finding 6) still releases holds to a legacy client on the poll path.
violated legacy $SAFE
violated legacySendGate $SAFE
violated legacyPushField noUnsupportedStore noManifestRegress

# Finding 4: with poll revisions, safety no longer needs the handshake-first transport assumption.
holds fixedNoHandshake $SAFE

# Findings 3 and 6: stuck holds and regressed manifests. Re-checking alone does not help; sequences fix both.
violated stage1 noStuckHold noManifestRegress
violated stage1Recheck noStuckHold
violated misconfigured noStuckHold
violated misconfiguredRecheck noStuckHold
holds stage1Seq $SAFE noStuckHold noManifestRegress
holds misconfiguredSeq $SAFE noStuckHold noManifestRegress

# Every fix together, with the handshake assumption.
holds fixed $SAFE outboxGated noStuckHold noManifestRegress

# Finding 5, open: legitimate rows refused as PEER_PROTOCOL_UNSUPPORTED after a narrow.
violated stage1 noLostRows
violated fixed noLostRows

# Trust: a peer that claims more spreads misread rows.
violated liar noMisreadRowsSpread

exit $status
