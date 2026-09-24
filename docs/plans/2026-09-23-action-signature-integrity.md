# Plan: Action signature integrity (#2894)

Date: 2026-09-23 (revised twice the same day after code reviews)
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
- `signer.user` is not signed, so any relay can relabel who an operation is
  attributed to. The auth scope reads `signer.user.address` as the subject.
- `requireSignatures` only rejects a tuple with an empty key, which is what
  `PassthroughSigner` emits. An action with no `context.signer` is skipped
  before the handler runs (`packages/reactor/src/executor/signature-verifier.ts:21`).
  The flag is switchboard-only, and switchboard's worker pool
  (`apps/switchboard/src/server.mts:632`) passes no verifier at all.
- Tuple element [3] (previous state) is signed but never checked, and every
  ReactorClient-signed action carries `""` there.
- The same action id can be written twice. The local write path has no
  dedup, and load dedups only inside the window from the earliest incoming
  operation timestamp (`simple-job-executor.ts:1868`, `:1984`).
- The reshuffle sorts on the operation's timestamp, not the action's
  (`packages/reactor/src/utils/reshuffle.ts:62`), and the operation
  timestamp comes from the remote.
- The reducer rewrites UNDO into a fresh NOOP action with no signer
  (`packages/shared/document-model/operations.ts:65`) and REDO into an
  action with no id or context (`:208`). These travel over sync unsigned.

What already works: load and sync **are** verified. Every load job runs
`processActions` (`simple-job-executor.ts:2098`), which calls
`verifyActions` (`:537`) before any reducer. Reevaluation (`:1700`) and
mutation (`:420`) go through the same call. Connect wires a verifier too
(`apps/connect/src/reactor.worker.ts:348`). Only `verifyOperations`
(`signature-verifier.ts:65`) is dead.

## Decisions

1. **The reactor checks integrity, the host checks identity.** The reactor
   proves the signature covers this action in this document and that the key
   in the tuple made it. Whether that key may sign as `signer.user` is the
   host's job through a hook. The hook defaults to deny once
   `authEnforcement` is on and to accept otherwise, because the auth scope
   trusts `user.address` and must not do so against an unbound key.
2. **A document is either legacy or v2-required, fixed at creation.** The
   header carries `protocolVersions.signature`, written by `CREATE_DOCUMENT`
   and copied verbatim by every reactor, old or new. There is no policy
   action, no positional lookup and no transition. A policy resolved at a
   timestamp position can be bypassed by backdating, because positions are
   caller-supplied timestamps; a policy with no transition has no window to
   backdate into. Existing documents are legacy and stay legacy.
3. **The requirement is bound to the document id.** The id of a v2-required
   document is a hash of its header params including `protocolVersions`. A
   competing CREATE with a different requirement cannot produce the same id.
   No key is involved, so presigned headers keep working; who created the
   document is proven by the CREATE action's v2 tuple, not by the id.
4. **Order is bound by the preimage, not by countersignatures.** v2 signs
   documentId, branch, scope, type, action id and timestamp, and the verifier
   requires the operation timestamp to equal the action timestamp. The
   reshuffle order is then timestamp, action id, operation id, all of which
   are signed or derived from signed fields. Index and skip are replica-local
   (`packages/shared/document-model/operations.ts:276`), so a signature over
   them would pin nothing another replica could check. Countersignatures,
   the previous-state check and `trustReshuffler` are dropped. Tuple [3]
   stays informational.
5. **The scheme is self-identifying and the message format does not change.**
   A v2 tuple carries `v2:` in front of the hash in element [2]. The signed
   message keeps today's `\x19Signed Operation:\n` layout. An old verifier
   only checks ECDSA over the tuple's own params, so a v2 tuple still passes
   it. Signers switch to v2 as soon as they are released, with no policy read
   and no coordination. A 6th tuple element is not an option:
   `deserializeSignature` (`packages/shared/document-model/signatures.ts:72`)
   truncates string input to five.
6. **Verification happens once per operation per reactor, at admission.**
   Admission is the moment this reactor first stores an operation: a write
   submitted to a mutation job, or an incoming operation in a load job.
   Re-appends by reshuffle or reevaluation are not admission and are not
   re-verified; the verdict is a pure function of content and was reached
   when the operation was stored. The identity hook runs at admission only.
7. **A failed operation is dropped, never stored or forwarded.** A mutation
   job fails so the client sees the error. A load job drops the operation,
   logs it, counts it, and succeeds with the rest. A denied row would let a
   peer pre-empt honest action ids and would collide with reevaluation, and
   it adds nothing because every honest replica reaches the same verdict on
   its own.
8. **The reactor signs what it synthesizes.** The executor holds a
   host-provided signer and signs the NOOP it derives from UNDO and the
   action it rebuilds from REDO, after the reducer returns and before the
   write.
9. **Legacy stays weak.** Stored actions are jsonb and Postgres reorders
   their keys, so the renown legacy hash cannot be recomputed after a store
   round trip. Legacy tuples are recomputed at mutation admission only and
   get today's ECDSA-only check at load admission. A replayed legacy tuple
   pushed by sync onto a legacy document is therefore still accepted. That
   is the residual exposure of legacy documents, and v2 tuples on the same
   documents are fully checked.

## Design

### Policy

```ts
// PHDocumentHeader.protocolVersions, set by CREATE_DOCUMENT input
{ "base-reducer": 2, "signature": 2 }

// absent      = legacy document: any tuple or none, today's behaviour
// signature 2 = v2-required: every operation carries a v2 tuple,
//               the id is content-addressed
```

- `createDocumentFromAction` (`packages/reactor/src/executor/util.ts:137`)
  already copies the map. Every create path adds the key and derives the id:
  `core/reactor.ts:511`, `client/reactor-client.ts:993`,
  `client/drive-client.ts:114`, `reactor-drive-client.ts` (create, `addFile`,
  duplicate), `documents.ts:200` and `:254`, reactor-browser
  `actions/document.ts:566` and `:1117`.

```ts
// id of a v2-required document
id = base64url(sha256(canonicalJson({
  documentType, createdAtUtcIso, nonce: header.sig.nonce, protocolVersions,
})))
```

- `createPresignedHeader` (`packages/shared/document-model/header.ts:158`)
  derives the id this way when `protocolVersions.signature` is set, from a
  fresh random nonce, and takes a random id otherwise as today.
- A legacy CREATE whose id has the derived shape (43 base64url characters)
  is refused as `ID_MISMATCH`; otherwise a legacy CREATE could claim the id a
  v2-required one derives and downgrade it on peers that see it first.
- A reactor with no signer stores synthesized operations with an empty tuple,
  which every peer refuses on a v2-required document, so a host that writes
  to such documents must configure a signer.
- The verifier reads the target document's header from the write cache or
  document meta. For `CREATE_DOCUMENT`, and for later actions in the same
  batch, it reads the CREATE input. A v2-required CREATE must carry an id
  that recomputes from its input and a v2 tuple, or the job fails.
- A document-scope action that writes to another document
  (`ADD_RELATIONSHIP` writes to `input.sourceId`) is verified under that
  document's header. Use the same `targetDocumentId` the write path uses
  (`executor/util.ts:71`), as #2974 did.
- Model upgrade reducers receive the whole document; the executor restores
  `header.protocolVersions` after any reducer runs.

### v2 tuple

```ts
preimage = canonicalJson([
  "v2", documentId, branch, scope, type, id, timestampUtcMs, input,
  signer.user.address, signer.user.networkId, signer.user.chainId,
  signer.app.key,
])
tuple = [
  signedAtUnixSeconds,                  // decimal digits
  signer.app.key,                       // did:key P-256, must equal tuple[1]
  "v2:" + base64url(sha256(preimage)),  // unpadded, exactly 43 chars after the prefix
  prevStateHash,                        // informational, may be ""
  "0x" + hex(ecdsaP256(message)),       // lowercase, 128 hex digits
]
message = "\x19Signed Operation:\n" + len + tuple[0..3].join("")   // unchanged
```

- `canonicalJson` is `safe-stable-stringify` with sorted keys, the same
  function the state hash uses. `input` may be any JSON value. Sign time
  rejects `undefined`, BigInt, NaN, Infinity, sparse arrays and lone
  surrogates. It is computed from parsed values, so it survives the jsonb
  round trip.
- `documentId` is the id of the log the operation is stored in. Slugs are
  resolved at the client boundary before signing, never in the verifier.
  `branch` is the job's branch; for CREATE that is `header.branch`, and the
  create paths pass it as the job branch instead of hard-coding `main`
  (`core/reactor.ts:537`).
- No nonce. `id` is in the preimage and admission refuses an action id that
  is already live in the stream, so a v2 signature is single-use.
- Empty `documentId` or `branch` is rejected at sign time and verify time.
- Only the last tuple in `signer.signatures` is checked, as today.

```ts
// ISigner gains the coordinates it signs
signAction(action: Action, target: { documentId: string; branch: string },
           signal?: AbortSignal): Promise<Signature>
```

### Verification

```ts
// reactor-owned, always on, no host wiring; runs once per write at admission
verify(action, op, target, header): "ok" | Refusal
  // 0. no signer, or signer.app.key === "" (PassthroughSigner):
  //      v2-required → UNSIGNED_REQUIRED, legacy → ok
  // 1. tuple[1] must equal signer.app.key, else KEY_MISMATCH
  // 2. tuple[2] starts with "v2:":
  //      parse strictly, else MALFORMED_TUPLE
  //      op.timestampUtcMs must equal action.timestampUtcMs, else TIMESTAMP_MISMATCH
  //      recompute preimage, must match, else HASH_MISMATCH; ECDSA, else BAD_SIGNATURE
  // 3. otherwise legacy:
  //      v2-required        → SCHEME_BELOW_POLICY
  //      mutation admission → recompute by length (44 = renown SHA-256,
  //                           28 = shared SHA-1, else MALFORMED_TUPLE); ECDSA
  //      load admission     → ECDSA only
  // 4. action id already live in (documentId, scope, branch) → DUPLICATE_ACTION,
  //    unless stored byte-identical (canonicalJson): committed, not rewritten
  // 5. unsigned with signer.user.address !== "" → UNSIGNED_IDENTITY, any policy
  // 6. host hook: authorizeSigner(...) false → SIGNER_UNAUTHORIZED

// host-provided, admission only
type SignatureTrustPolicy = {
  authorizeSigner(signer: ActionSigner, key: string,
                  documentId: string): Promise<boolean>;
};
```

- Admission is per write, not per job. Stored operations that
  `positionByTimestamp` merges into a mutation job (`:1426`) and existing
  operations a load job reshuffles (`:2040`) are not re-verified.
- The live-id check uses the derived operation id, which the store already
  indexes. It covers the whole stream, not the conflicting window. The action
  the executor synthesizes from an UNDO or REDO takes an id derived from the
  submitted one, so the submitted id is live once that operation is stored.
- Refusals are carried by `InvalidSignatureError` with a `code` from the set
  above and the target document id. The error name must reach
  `JobInfo.error`. A mutation job fails on the first refusal. A load job
  drops refused operations and continues; a refusal is never stored.
- The hook returning `false` is a refusal. The hook throwing or timing out
  is a job error, retried, never a drop. Admission bounds the hook at
  `min(10s, jobTimeoutMs / 2)`, so a slow hook fails the job before the
  executor manager's own timeout, which does not retry.
- The reactor accepts its own signer's key for its own `signer.user` before
  asking the hook, so every policy, the default included, admits the
  operations the reactor signs. A configured hook is asked whatever the
  flags; the default is the only part that reads `authEnforcement`.
- Switchboard's hook is `createRenownTrustPolicy` (`@renown/sdk`), installed
  only under `authEnforcement`. Renown has no issuer key: the credential is
  an EIP-712 VC the wallet signs, issued by
  `did:pkh:<networkId>:<chainId>:<address>` to the app `did:key`. The hook
  checks that binding and that the proof recovers to the address; Renown is
  trusted to return the credential, not to vouch for it. It ignores expiry
  and revocation (the read-model query sets `includeRevoked`; the legacy
  REST fallback returns only the active credential), caches acceptances per
  (address, key) with no expiry, and remembers a refusal for 60s so a
  credential written after the first ask is still found. A failed lookup
  throws. Revocation goes through auth-scope grants. The hook accepts the
  switchboard's own key for its own address. Pooled workers import it by
  path, like the signer; a switchboard that reads its own renown read model
  (`RENOWN_SOURCE=self`) has no spec to give them, so its pooled workers
  apply the default.
  Connect and switchboard may answer differently; the switchboard is
  authoritative and a refused push is handled like any rejected push today.
- `SignerConfig` (`packages/reactor/src/signer/types.ts`) loses `verifier`
  and gains `trustPolicy`; `signer` is threaded into the executor for
  synthesized operations. Worker pools load both through a `FactorySpec`
  like the verifier does today (`executor/worker/protocol.ts:111`).
- Decompressed P-256 keys are cached per process; decompression does BigInt
  `modPow` on every call today (`signer.ts:291`).
- Log-only mode is a reactor config option, `signatureVerification: "log" |
  "enforce"`, with a `signature_refusals_total{scheme,path,code}` metric.
- A mutation write already stored byte-identical is committed: it is not
  written again, the rest of its job is, and the job's result and
  `JOB_WRITE_READY` re-emit the stored operations with their indexed ordinals.

## Phases

Each phase merges green to main on its own.

| Phase | Change | Behaviour change |
|---|---|---|
| P1 Reactor-owned verifier | Integrity checking moves into the executor, always on, replacing the host-wired `SignatureVerificationHandler`. Recognises `v2:` (ECDSA only until P2). Recomputes legacy at mutation admission by hash length. Live-id check. Per-write admission. Load drops refused operations. Empty-key tuples are unsigned. Key cache. Log-only mode, default `log`. Delete `verifyOperations`; deprecate shared `verifyOperationSignature` and update the academy pages that recommend it and `createSignatureVerifier`. | Tampered legacy input is refused at mutation admission once `enforce` is set. Worker pools verify. |
| P2 v2 scheme and signers | `hashActionV2`, `canonicalJson`, strict tuple parsing, timestamp equality, the `ISigner` change. Port #2974's target-document resolution and slug resolution before signing. Every signer emits v2: `ReactorClient` `execute`/`executeAsync`/`executeBatch`, the reactor's create/delete/relationship paths, the drive client, `reactor-drive-client.ts`, `migrate-legacy-state.ts`, reactor-browser `signing.ts` and `remote-controller.ts`, `actions/sign.ts` (retire the SHA-1 path), the Connect worker, the switchboard e2e helper, the bench host. Default flips to `enforce`. | New writes carry v2 tuples that verify everywhere, including on old peers. Tampered v2 operations are refused on every path. |
| P3 Reactor signer | `SignerConfig.signer` reaches the executor and workers. NOOP from UNDO and the rebuilt REDO action are signed before the write. | Synthesized operations carry the reactor's signature. |
| P4 v2-required documents | `protocolVersions.signature`, content-addressed ids, id recompute on CREATE, `SCHEME_BELOW_POLICY` and `UNSIGNED_REQUIRED`, header restored after upgrade reducers. Remove `REQUIRE_SIGNATURES` / `identity.requireSignatures`. | None until a document is created v2-required. |
| P5 Identity hook | `SignatureTrustPolicy.authorizeSigner`, admission-only, default by `authEnforcement`, `FactorySpec` for workers. Switchboard's Renown credential check. | Under `authEnforcement`, a key that cannot sign as its claimed address is refused. |
| P6 v2-required by default | `baseCreateDocument`, and so every model's `createDocument`, sets `signature: 2` and derives the id; `createEmpty`, `drives.create`, copies of legacy documents and the host create paths follow a creation default, `v2-required` unless overridden. `create` and `addFile` keep the header they are handed. | New documents refuse unsigned and legacy operations. |

## Mixed-version rollout

- P1 and P2 deploy in any order across a fleet. A v2 tuple passes an old
  verifier because the message format is unchanged, and a P1 verifier
  accepts a v2 tuple on ECDSA alone. A legacy tuple from an old signer
  passes a new verifier on a legacy document.
- P3 and P4 change nothing for legacy documents. A pre-P4 reactor that
  receives a v2-required document copies the header and admits whatever it
  would have admitted before, then forwards it; upgraded peers drop those
  operations. So no document is created v2-required until every peer that
  syncs it is on P4. P6 flips the default only after that. Browser clients
  update on their own schedule, so the gate is a release note and the
  refusal metric, not a check.
- The creation default is one host setting, read only when a document is
  born: `ReactorClientBuilder.withCreateSignaturePolicy`, switchboard's
  `CREATE_SIGNATURE_POLICY` and Connect's
  `connect.reactor.createSignaturePolicy`, each `v2-required` unless set to
  `legacy`. It decides what `createEmpty`, `drives.create`, a copy of a legacy
  document, and the documents reactor-browser, reactor-api's create
  mutations and switchboard's default drive make are born as. It never
  changes an existing document and gates nothing at admission: a reactor
  creating legacy documents verifies a v2-required one it receives like any
  other. A fleet sets it to `legacy` until every peer runs P4, and a
  switchboard with no signer falls back to `legacy` and warns, because it
  could not sign its own writes to a v2-required document. A document handed
  to `create` or `addFile` keeps the policy its header carries, since a
  v2-required id is fixed when the header is made; a `.phd` import keeps the
  policy it was exported with, because its signed history is bound to it.

## Tests

- **Preimage:** sorted keys, BigInt and undefined rejected, no unicode
  normalization; changing any preimage field including `signer.user` changes
  the hash; a multi-key input verifies after a Postgres jsonb round trip;
  strict `v2:` parsing rejects wrong lengths and alphabets.
- **Replay:** the same tuple onto another document, branch or scope, with
  mutated input, relabelled `signer.user`, resubmitted under the same action
  id on mutation and on load with a later operation timestamp, or under a
  fresh action id, is refused.
- **Admission:** stored operations re-appended by a backdated mutation, a
  load reshuffle or a reevaluation are not re-verified and do not hit the
  hook or the live-id check.
- **Failures:** a mutation refusal fails the job with the code in
  `JobInfo.error`; a load refusal drops only that operation and the job
  succeeds; nothing is stored or forwarded for it; a hook error fails the
  load job instead.
- **Policy:** v2-required refuses unsigned, empty-key and legacy;
  legacy documents accept all of them; CREATE is verified under its own
  input; later actions in the create batch too; `ADD_RELATIONSHIP` under the
  target document's header; a CREATE whose id does not recompute from its
  input is refused; an upgrade reducer cannot change `protocolVersions`.
- **Synthesized:** UNDO and REDO on a v2-required document produce signed
  operations that a peer accepts.
- **Legacy:** renown and shared tuples both recompute at mutation admission;
  a legacy tuple of another length is refused there; a stored legacy
  operation with reordered keys is accepted at load admission.
- **Wire:** a `v2:` tuple survives `serializeSignature` and an old
  `deserializeSignature`; an old `createSignatureVerifier` accepts it.
- **Hook:** the default denies under `authEnforcement` and accepts
  otherwise; the reactor's own key is accepted for its own address.
- **Workers:** verification runs inside a pooled executor worker.
- **Bench:** always-on verification on a reshuffle-heavy load, with the key
  cache.
- Run through the real `pnpm test` per package, not isolated `vitest run`.

## Not in this plan

- The load path reuses the remote's declared operation hash and keeps stale
  hashes on moved operations (`packages/shared/document-model/reducer.ts:639`).
  Document-scope operations store `hash: ""`. Recomputing state hashes is a
  convergence concern and gets its own issue.
- On a plain append the load path keeps a remote-supplied `skip`
  (`simple-job-executor.ts:2033`), which is unsigned. Whether the receiver
  should derive `skip` itself is a convergence question for the same issue.
- Switchboard's ReactorClient signs unsigned GraphQL mutations with the
  server's key (`core/utils.ts:282`), so those operations attest the server,
  not the caller. Requiring client signatures over GraphQL is a follow-up.
- Withholding operations cannot be detected per operation.
- GDPR erasure deletes whole documents. There is no operation-level
  redaction, so no signature void marker is needed.
- No migration tool for existing documents. They stay legacy.
