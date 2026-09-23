# Plan: Action signature integrity (#2894)

Date: 2026-09-23
Replaces: #2970, #2974, #2975 (closed)

## Problem

`createSignatureVerifier` (`packages/renown/src/crypto/signer.ts:159`) checks
ECDSA over the tuple's own params. It never recomputes the hash from the
action, so any valid tuple verifies on any action in any document. In
addition:

- Two hash schemes disagree: renown `hashAction` (`signer.ts:116`) covers
  `scope+type+input`; shared `buildOperationSignatureParams`
  (`packages/shared/document-model/crypto.ts:66`) covers
  `documentId+scope+type+input` with SHA-1 and a non-injective `join("")`.
  Neither covers id, nonce, timestamp or branch.
- Tuple element [3] (previous state) is signed but never checked.
- `SignatureVerifier.verifyOperations`
  (`packages/reactor/src/executor/signature-verifier.ts:65`) has no caller, so
  load and sync operations are never verified.
- Whether signatures are required is a host flag, not a document property.

## Decisions

1. **The reactor checks integrity, not identity.** The reactor proves that a
   signature covers the action and that the key in the tuple made it. Whether
   that key belongs to `signer.user` is the host's job (switchboard, Connect),
   supplied through a hook. Hosts that want Renown credential binding
   implement it there.
2. **Signature policy is document state.** The document scope declares the
   scheme and whether signatures are required. The reactor enforces what the
   document declares at each operation's position. No host flag decides it.
3. **The branch is in the preimage.** A signature doesn't transfer between
   branches.
4. **Reshuffles are countersigned.** A reactor that moves an operation appends
   its own signature over the new position and keeps the author's signature.
   Receivers decide which reshufflers they trust through a host hook.
5. **Load and sync verify under the same rules as local writes.**
6. **Mixed-version safety comes from opt-in.** A document stays on legacy
   until an action moves it to v2, and that happens only after verifiers
   support v2.

## Design

### Document signature policy

```ts
// PHDocumentState gains:
type SignaturePolicy = {
  scheme: "legacy" | "v2";
  required: boolean;
};
// absent => { scheme: "legacy", required: false }, which is today's behaviour

// new document-scope action, handled in document-action-handler.ts
type SetSignaturePolicyAction = {
  type: "SET_SIGNATURE_POLICY";
  scope: "document";
  input: SignaturePolicy;
};
```

- The action is verified under the policy in effect before it. The new
  policy applies from the next operation.
- The auth scope grants control who can set it.
- The verifier resolves the policy in effect at each operation's position,
  the same way the auth scope resolves grants at a position. Reshuffle and
  reevaluation re-verify stored operations under the policy they were written
  under, so old legacy operations keep passing after a document moves to v2.

### v2 preimage

```ts
hash = sha256(canonicalJson([
  "v2", documentId, branch, scope, type, id, nonce, timestampUtcMs, input,
]))
message = lengthPrefixed([signedAtTimestamp, appKey, hash, prevStateHash])
```

- `canonicalJson`: sorted keys, BigInt encoded as a string, and unicode
  normalized the way the reducer's `stringifyJson` does it.
- An empty `documentId` or `branch` is rejected at sign time and verify time.
- `documentId` is the canonical id of the document the action writes to, not
  the job's document and not a slug. Port #2974's target-document resolution
  (drive `ADD_RELATIONSHIP`, slug → id).
- The tuple stays five elements. The scheme comes from the document's policy
  at that position, not from a tag in the tuple, so a signature can't be
  relabelled to a weaker scheme and the GraphQL wire format doesn't change.

### Verification

```ts
// reactor-owned: integrity only
verify(op, policy): IntegrityResult
  // 1. unsigned: reject if policy.required, else accept
  // 2. recompute hash under policy.scheme from op.action; must equal tuple[2]
  // 3. ECDSA over the message with tuple[1] (the key)
  // 4. previous state (v2 only), see below

// host-provided
type SignatureTrustPolicy = {
  // is this key allowed to sign as signer.user? default: accept
  authorizeSigner(signer: ActionSigner, key: string, documentId: string): Promise<boolean>;
  // may this key reorder operations in this document? default: own key only
  trustReshuffler(key: string, documentId: string): Promise<boolean>;
};
```

`SignerConfig` (`packages/reactor/src/signer/types.ts`) takes the trust policy
next to the verifier. Errors name the action's target document.

### Previous state and countersignatures

- The author's tuple[3] declares the scope state hash the author signed
  against.
- On apply, the reactor compares it with the actual pre-apply state hash.
- If they match, the operation passes.
- If they don't, the operation needs a countersignature from a trusted
  reshuffler whose declared previous state matches.
- Resulting hashes are checked after apply against what the reducer produced.
  They are never trusted as declared.

```ts
// appended to signer.signatures by a reactor that reshuffles
countersignature = [
  signedAtTimestamp, reshufflerKey,
  sha256(canonicalJson(["v2-reshuffle", operationId, index, skip,
                        sha256(authorSignature)])),
  prevStateHash + ":" + resultingStateHash,
  signatureHex,
]
```

- Every reactor that reshuffles, locally or on load, countersigns with its own
  host-provided signer and trusts its own key.
- A chain of reshuffles appends one countersignature per move. The latest
  countersignature has to match the actual position.
- Under legacy policy the previous-state check is skipped.

## Phases

Each phase merges green to main on its own.

| Phase | Change | Behaviour change |
|---|---|---|
| P1 Recompute legacy hash | The verifier recomputes the legacy hash from the action and compares it with tuple[2]. Add a log-only mode and a dry-run script over stored operations. Errors name the target document. | Rejects tampered input. Run the dry-run first; stored operations signed through the shared SHA-1 path or carrying BigInt input could fail re-verification during reshuffle. |
| P2 Document policy | `SignaturePolicy` in `PHDocumentState`, `SET_SIGNATURE_POLICY`, position-aware lookup, `required` enforced from policy. Remove the host `requireSignature` flag once the policy covers it. | None until a document sets a policy. |
| P3 v2 verify | `hashActionV2` and the length-prefixed message (port from #2974). The verifier handles v2 where the policy says so. Signers read the target document's policy and sign v2 when it is set. | Only documents that opted in. |
| P4 Trust hook and countersignatures | `SignatureTrustPolicy`; previous-state check under v2; reshuffle paths (`simple-job-executor.ts:1426`, `:1941`) countersign; the reactor needs its own signer. | v2 documents: an uncountersigned moved operation is rejected. |
| P5 Load and sync | Call `verifyOperations` in load jobs with the same rules. Remove the dead path in `packages/shared/document-model/actions.ts` `verifyOperationSignature`. | Tampered remote operations are rejected. |
| P6 Signers and defaults | ReactorClient `execute`/`executeAsync`/`executeBatch`, the drive client, reactor-browser `signing.ts` (align its `prevOpHash` with the pre-apply hash), the switchboard test helper. New documents are created with v2 policy by default. | New documents start on v2. |

## Mixed-version rollout

- P1 to P5 change verifiers only. Signers keep emitting legacy until the
  target document's policy says v2.
- A document moves to v2 only by a `SET_SIGNATURE_POLICY` action. Once it
  has, a reactor from before P2 can't process it.
- The document is the gate: nobody should set v2 on a document until every
  peer that syncs it is on P3 or later.
- Sync capability: remotes advertise the schemes they support in the
  handshake. A reactor doesn't push a v2 document to a remote that doesn't
  advertise v2, and logs that it didn't.
- Before P2 ships, check what an unupgraded reactor does with an unknown
  document-scope action (it dead-letters, or it throws in the reducer). The
  result decides whether the capability check is required or advisory.
- P6's "new documents default to v2" lands only after P3 and P4 are released
  and deployed on the switchboards that sync those documents.

## Tests

- **Preimage:** canonical JSON key order, BigInt, unicode; changing any
  preimage field changes the hash; v2 relabelled as legacy under a v2 policy
  is rejected.
- **Replay:** the same tuple onto another document, branch or scope, mutated
  input, and resubmission under a fresh action id are all rejected by the
  executor, not only at the hash level.
- **Policy:** the policy in effect at a position; legacy operations before a
  switch re-verify during reshuffle and reevaluation; `required` rejects
  unsigned actions.
- **Countersignatures:** concurrent writers reshuffled by a trusted reactor
  pass; a countersignature from an untrusted reactor is rejected; a forged
  resulting hash is rejected after apply.
- **Sync:** a tampered operation over load is rejected; a two-node test with
  one pre-P3 peer respects the capability gate.
- Run through the real `pnpm test` per package, not isolated `vitest run`.

## Open questions

1. **Downgrading policy.** Can a document go from v2 back to legacy, or from
   required to optional? Governed by the auth scope either way, but a one-way
   scheme is simpler to reason about.
2. **P1 dry-run result.** If stored operations fail the legacy recompute,
   decide whether to accept them as grandfathered or treat them as corrupt.
3. **Position semantics across scopes.** The policy lives in the document
   scope and applies to operations in other scopes. Reuse the auth scope's
   cross-scope positioning.
4. **The reactor's own signing key.** Countersigning needs every reshuffling
   reactor to hold a key. Decide how hosts provision one: switchboard config,
   and Connect's worker-side renown key.
5. **GDPR redaction.** `input` is in the v2 hash, so redacting it voids the
   signature. The subject-redaction plan already requires voiding and logging
   such signatures; make sure the verifier treats a voided signature as
   intentionally removed and not as tampering.
