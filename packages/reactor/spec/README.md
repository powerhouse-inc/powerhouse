# Peer protocol agreement model

A Quint model of `docs/plans/2026-09-25-peer-protocol-agreement.md`, restricted to the
`base-reducer` capability with versions 1, 2 and 3, on the line A - S - B (S is the server
and relay, A and B are its clients).

## Running

From `packages/reactor`:

```sh
pnpm spec:typecheck   # both files
pnpm spec:test        # scenario runs in PeerAgreementTest.qnt
pnpm spec:sim         # scripts/sim.sh: simulator suite, about 2.5 minutes
pnpm spec:verify      # scripts/verify-all.sh: Apalache suite, needs Java 17+
pnpm spec:check       # all four
pnpm spec:trace spec/out/<file>.itf.json   # print a counterexample, one line per step
```

- `scripts/expect-hold.sh <main> <inv>...` and `scripts/expect-violation.sh <main> <inv>...`
  run one simulator check. `MAX_STEPS`, `MAX_SAMPLES` and `SEED` override the defaults.
- `scripts/verify.sh <holds|violated> <main> <inv[,inv]> <steps>` runs one bounded check.
  `VERIFY_TIMEOUT` (seconds, default 900) is a hard cap.
- Logs and ITF traces go to `spec/out/`, which is ignored.
- `quint verify` downloads Apalache into `~/.quint` on first use and starts a JVM server.
  If a run is killed, check `pgrep -fl apalache.jar` and kill the leftover server.

## Builds

| build           | announces | runs      | refuses what it does not run |
| --------------- | --------- | --------- | ---------------------------- |
| `legacy`        | nothing   | 3 as 2    | no                           |
| `narrow`        | {1,2}     | {1,2}     | yes                          |
| `wide`          | {1,2,3}   | {1,2,3}   | yes                          |
| `misconfigured` | {1,2,3}   | {1,2}     | yes                          |
| `liar`          | {1,2,3}   | 3 as 2    | no                           |

## Invariants

- `noUnsupportedStore`: no reactor admits a document at a version it does not run.
- `noMisreadRows`: no base-reducer 3 stream holds rows written by a reactor that reads it as 2
  (the undo v3 mixed-version requirement).
- `noMisreadRowsSpread`: a misread row never leaves the replica that wrote it.
- `noMisreadAdmitted`: no stage 1+ build admits a batch that carries a misread row.
- `outboxGated`: every unsent item of a gated sender passes the gate against its current record.
- `noStuckHold`: no hold whose release condition is met while nothing is left to trigger it.
- `noManifestRegress`: no delayed manifest overwrites a newer record.
- `noLostRows`: no PEER_PROTOCOL_UNSUPPORTED refusal drops a legitimate row the receiver lacks.
- `witnessNo*`: reachability checks, expected to be violated.

## Switches and instances

Constants: `GATE`, `RECEIPT_CHECK`, `PEER_CHECK`, the transport assumption `HANDSHAKE_FIRST`
(after a client restart no data flows on its channel until both manifests are exchanged), and
the candidate fixes `PUSH_FIELD`, `SEND_GATE`, `RECHECK_HOLDS`, `MANIFEST_SEQ` and `POLL_REVISION`.
The `*One` instances have one document and are the ones `verify-all.sh` checks; that one
document suffices is an argument (see the comment above them), not a check.

| instance                 | expected                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `stage1`                 | safety holds; `noStuckHold`, `noManifestRegress`, `noLostRows` violated                   |
| `gateOnly`               | `noUnsupportedStore` violated: the receipt refusals carry safety                          |
| `receiptOnly`            | safety holds without the gate                                                             |
| `stage1Recheck`          | `noStuckHold` still violated: nothing touches, so nothing re-checks                       |
| `stage1Seq`              | `noStuckHold` and `noManifestRegress` hold                                                |
| `legacy`                 | the rollback leak: every safety invariant violated                                        |
| `legacySendGate`         | still violated: the gate at send uses the same stale record                               |
| `legacyPushField`        | push path closed; the poll path leaks via a regressed manifest or a server's legacy build |
| `misconfigured*`         | as `stage1*`, for a fixed misconfigured host that announces the same set                  |
| `liar`                   | `noMisreadRowsSpread` violated                                                            |
| `fixed`                  | push field + sequences + poll revisions: all but `noLostRows` hold                        |
| `fixedNoPollRevisionOne` | `fixed` without `POLL_REVISION`: `noUnsupportedStore` violated                            |
| `fixedNoHandshake`       | `fixed` without `HANDSHAKE_FIRST`: safety still holds                                     |

## CI sketch

Not wired up. A job limited to this directory:

```yaml
on:
  pull_request:
    paths: ["packages/reactor/spec/**"]
jobs:
  spec:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - run: pnpm install --frozen-lockfile --filter @powerhousedao/reactor
      - run: pnpm spec:check
        working-directory: packages/reactor
```
