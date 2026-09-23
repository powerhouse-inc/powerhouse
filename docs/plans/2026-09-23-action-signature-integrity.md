# Plan: Action signature integrity (#2894)

Date: 2026-09-23 (revised the same day after a code review of the first draft)
Replaces: #2970, #2974, #2975 (closed)

## Problem

`createSignatureVerifier` (`packages/renown/src/crypto/signer.ts:159`) checks
ECDSA over the tuple's own params. It never recomputes the hash from the
action, so any valid tuple verifies on any action in any document. In
addition:

- Two hash schemes disagree: renown `hashAction` (`signer.ts:116`) covers
  `scope+type+input` with SHA-256 over insertion-order `JSON.stringify`;
  shared `buildOperationSignatureParams`
  (`packages/shared/document-model/crypto.ts:66`) covers
  `documentId+scope+type+input` with SHA-1. Both use a non-injective
  `join("")`. Neither covers id, timestamp, branch or `signer.user`.
- `signer.user` is not signed at all, so any relay can relabel who an
  operation is attributed to. The auth scope reads `signer.user.address` as
  the subject.
- `requireSignatures` is inert. `SignatureVerifier.verifyActions`
  (`packages/reactor/src/executor/signature-verifier.ts:21`) skips unsigned
  actions before the handler runs, so the flag never rejects anything. It is
  also switchboard-only, and switchboard's worker pool
  (`apps/switchboard/src/server.mts:632`) passes no verifier at all.
- Tuple element [3] (previous state) is signed but never checked, and every
  ReactorClient-signed action carries `""` there.
- The same action id can be written twice on the local write path. Load
  dedups by action id; mutation does not.

What already works and the first draft got wrong: load and sync **are**
verified. Every load job runs `processActions`
(`simple-job-executor.ts:2098`), which calls `verifyActions` (`:537`) before
any reducer. Reevaluation (`:1700`) and mutation (`:420`) go through the same
call. Only `verifyOperations` (`signature-verifier.ts:65`) is dead.

## Decisions

1. **The reactor checks integrity, the host checks identity.** The reactor
   proves the signature covers this action in this document and that the key
   in the tuple made it. Whether that key may sign as `signer.user` is the
   host's job through a hook. The hook defaults to deny once
   `authEnforcement` is on and to accept otherwise, because the auth scope
   trusts `user.address` and must not do so against an unbound key.
2. **Signature policy is set at genesis and never changes.** The document's
   header carries it in `protocolVersions.signature`, written by
   `CREATE_DOCUMENT` and copied verbatim by every reactor, old or new. There
   is no policy action, no positional lookup and no transition. A policy
   resolved at a timestamp position can be bypassed by backdating, because
   positions are caller-supplied timestamps; a policy with no transition has
   no window to backdate into.
3. **Order is bound by the preimage, not by countersignatures.** v2 signs
   documentId, branch, scope, type, action id and timestamp. The reshuffle
   order is timestamp, then action id, then operation id
   (`packages/reactor/src/utils/reshuffle.ts:60`), so once those are signed
   a reshuffler has nothing left to choose. Index and skip are replica-local
   (`packages/shared/document-model/operations.ts:276`), so a signature over
   them would pin nothing another replica could check. Countersignatures,
   the previous-state check, `trustReshuffler` and a reactor signing key are
   all dropped. Tuple [3] stays informational.
4. **The scheme is self-identifying and the message format does not change.**
   A v2 tuple carries `v2:` in front of the hash in element [2]. The signed
   message keeps today's `\x19Signed Operation:\n` layout. An old verifier
   only checks ECDSA over the tuple's own params, so a v2 tuple still passes
   it. Signers can therefore switch to v2 as soon as they are released, with
   no policy read before signing and no coordination with peers. A 6th tuple
   element is not an option: `deserializeSignature`
   (`packages/shared/document-model/signatures.ts:72`) truncates to five.
5. **Off admission, a failure is a stored denial.** Local admission rejects
   the job so the client sees the error. Load, reshuffle and reevaluation
   record a `deniedReason` and the job succeeds, matching the auth scope's
   rule. Verification of stored operations is a pure function of the log:
   the identity hook runs only when a reactor first stores an operation,
   never on re-verification.
6. **Legacy stays weak and is retired by opt-in.** Stored actions are jsonb
   and Postgres reorders their keys, so the renown legacy hash cannot be
   recomputed after a store round trip. Legacy tuples are recomputed at
   local admission only and get today's ECDSA-only check everywhere else.
   Documents created at level 2 refuse legacy outright.

## Design

### Policy

```ts
// PHDocumentHeader.protocolVersions, set by CREATE_DOCUMENT input
{ "base-reducer": 2, "signature": 2 }

// level (absent or 1) = legacy: any tuple or none, today's behaviour
// level 2            = every operation carries a v2 tuple
```

- `createDocumentFromAction` (`packages/reactor/src/executor/util.ts:137`)
  already copies the map. The three create paths (`core/reactor.ts:511`,
  `client/reactor-client.ts:993`, `client/drive-client.ts:114`) and
  `createDocument` (`packages/shared/document-model/documents.ts:254`) add
  the key.
- The verifier reads the target document's header. For `CREATE_DOCUMENT`
  itself it reads the action's own input.
- A document-scope action that writes to another document
  (`ADD_RELATIONSHIP` writes to `input.sourceId`) is verified under that
  document's policy. Use the same `targetDocumentId` the write path uses
  (`executor/util.ts:71`), as #2974 did.
- Existing documents stay at level 1. A document moves to level 2 only by
  being re-created.

### v2 tuple

```ts
preimage = canonicalJson([
  "v2", documentId, branch, scope, type, id, timestampUtcMs, input,
  signer.user.address, signer.user.networkId, signer.user.chainId,
  signer.app.key,
])
tuple = [
  signedAtUnixSeconds,
  signer.app.key,                       // must equal tuple[1] and the ECDSA key
  "v2:" + base64url(sha256(preimage)),
  prevStateHash,                        // informational, may be ""
  "0x" + hex(ecdsaP256(message)),
]
message = "\x19Signed Operation:\n" + len + tuple[0..3].join("")   // unchanged
```

- `canonicalJson` is `safe-stable-stringify` with sorted keys, the same
  function the state hash uses. Sign time rejects BigInt, NaN, Infinity and
  sparse arrays; undefined properties are omitted as `JSON.stringify` omits
  them. It is computed from parsed values, so it survives the jsonb round
  trip.
- `documentId` is the id of the log the operation is stored in. Slugs are
  resolved at the client boundary before signing, never in the verifier.
  `branch` comes from the same place the job gets it.
- No nonce. `id` is in the preimage and the executor rejects a second write
  of a live action id, so a v2 signature is single-use without one.
- Empty `documentId` or `branch` is rejected at sign time and verify time.

```ts
// ISigner gains the coordinates it signs
signAction(action: Action, target: { documentId: string; branch: string },
           signal?: AbortSignal): Promise<Action>
```

### Verification

```ts
// reactor-owned, always on, no host wiring
verify(action, target, policy): "ok" | SignatureRefusal
  // 1. tuple[1] must equal signer.app.key
  // 2. no signer:      level 2 → UNSIGNED_REQUIRED, else ok
  // 3. tuple[2] "v2:"  → recompute v2 preimage, must match; ECDSA
  // 4. otherwise legacy:
  //      level 2       → SCHEME_BELOW_POLICY
  //      at admission  → recompute by length (44 = renown SHA-256,
  //                      28 = shared SHA-1), must match; ECDSA
  //      elsewhere     → ECDSA only (today's check)

// host-provided, admission only
type SignatureTrustPolicy = {
  authorizeSigner(signer: ActionSigner, key: string,
                  documentId: string): Promise<boolean>;
};
```

- Admission is the first time this reactor stores the operation: a mutation
  job, or a load job carrying operations from a remote. Reshuffle and
  reevaluation re-verify stored operations but never call the hook.
- The hook's answer may not depend on when it is asked. Revocation goes
  through auth-scope grants, not the hook, or replicas diverge. Switchboard's
  implementation checks the Renown credential binding the app DID to the
  address and caches per (address, key) with no expiry-based revocation.
- Refusals: `MALFORMED_TUPLE`, `KEY_MISMATCH`, `HASH_MISMATCH`,
  `BAD_SIGNATURE`, `UNSIGNED_REQUIRED`, `SCHEME_BELOW_POLICY`,
  `SIGNER_UNAUTHORIZED`. A refusal names the target document. At admission
  it is the job error. Elsewhere it is the operation's `deniedReason`, with
  no feature flag in the way.
- `SignerConfig` (`packages/reactor/src/signer/types.ts`) loses `verifier`
  and gains the trust policy. Worker pools load it through a `FactorySpec`
  like the verifier does today (`executor/worker/protocol.ts:111`).

## Phases

Each phase merges green to main on its own.

| Phase | Change | Behaviour change |
|---|---|---|
| P1 Reactor-owned verifier | Move integrity checking into the executor, always on, replacing the host-wired `SignatureVerificationHandler`. Recompute legacy at admission by hash length; ECDSA-only elsewhere. Reject a second write of a live action id. Log-only mode with a `signature_integrity_mismatch_total{scheme,path,reason}` metric, and a `preflight:signatures` sweep over a Postgres-backed store modelled on `preflight:auth`. Delete `verifyOperations` and shared `verifyOperationSignature`; update the academy pages that recommend it. | Tampered legacy input is rejected at admission once log-only is lifted. Worker pools verify. |
| P2 v2 scheme and signers | `hashActionV2`, `canonicalJson`, the `v2:` prefix, the `ISigner` change. Port #2974's target-document resolution. Every signer emits v2: `ReactorClient` `execute`/`executeAsync`/`executeBatch`, the reactor's create/delete/relationship paths, the drive client, reactor-browser `signing.ts` and `remote-controller.ts`, `actions/sign.ts` (retire the SHA-1 path), the Connect worker, the switchboard e2e helper. | New writes carry v2 tuples that verify everywhere, including on old peers. Tampered v2 operations are rejected on every path. |
| P3 Genesis policy and stored denials | `protocolVersions.signature`, level-2 enforcement, stored `deniedReason` off admission, job error at admission. Remove `REQUIRE_SIGNATURES` / `identity.requireSignatures`. | None until a document is created at level 2. |
| P4 Identity hook | `SignatureTrustPolicy.authorizeSigner`, admission-only, default by `authEnforcement`, `FactorySpec` for workers. Switchboard verifies the Renown credential that binds the app DID to the wallet address against Renown's issuer key, and caches the answer per (address, key). | Under `authEnforcement`, a key that cannot sign as its claimed address is refused. |
| P5 Level 2 by default | New documents are created at level 2. | New documents refuse unsigned and legacy operations. |

## Mixed-version rollout

- P1 and P2 are safe to deploy in any order across a fleet. A v2 tuple
  passes an old verifier because the message format is unchanged, and a
  legacy tuple from an old signer passes a new verifier at level 1.
- P3 changes nothing for level-1 documents. A pre-P3 reactor that receives a
  level-2 document copies the header and admits whatever it would have
  admitted before, then forwards it; upgraded peers store those operations
  as denied. So no document is created at level 2 until every peer that
  syncs it is on P3. P5 flips the default only after that.
- An old reactor treats an unknown action type as a no-op and forwards it,
  so no capability handshake is needed and none is added.
- Legacy operations already stored are grandfathered on ECDSA alone. The
  P1 dry-run reports how many would fail a recompute; the answer changes
  the log-only period, not the design.

## Tests

- **Preimage:** sorted keys, BigInt rejected, no unicode normalization;
  changing any preimage field including `signer.user` changes the hash; a
  multi-key input still verifies after a Postgres jsonb round trip.
- **Replay:** the same tuple onto another document, branch or scope, with
  mutated input, relabelled `signer.user`, or resubmitted under the same or
  a fresh action id, is rejected by the executor.
- **Policy:** level 2 refuses unsigned and legacy tuples; level 1 accepts
  both; `CREATE_DOCUMENT` is verified under its own input's policy;
  `ADD_RELATIONSHIP` under the target document's.
- **Paths:** a mutation refusal fails the job; a load, reshuffle or
  reevaluation refusal stores a denial and the job succeeds; one poisoned
  operation in a load batch does not stall the document; a stale-head
  append and a two-action batch pass under v2.
- **Legacy:** renown and shared tuples both recompute at admission; a
  stored legacy operation with reordered keys passes off admission.
- **Wire:** a `v2:` tuple survives `serializeSignature` and an old
  `deserializeSignature`; an old `createSignatureVerifier` accepts it.
- **Hook:** the default denies under `authEnforcement` and accepts
  otherwise; the hook is not called on reshuffle or reevaluation.
- Run through the real `pnpm test` per package, not isolated `vitest run`.

## Not in this plan

- The load path reuses the remote's declared operation hash and keeps stale
  hashes on moved operations (`packages/shared/document-model/reducer.ts:639`).
  Document-scope operations store `hash: ""`. Recomputing state hashes is a
  convergence concern and gets its own issue.
- Withholding operations cannot be detected per operation.
- GDPR erasure deletes whole documents. There is no operation-level
  redaction, so no signature void marker is needed.
- No migration tool for existing documents. They stay at level 1.
