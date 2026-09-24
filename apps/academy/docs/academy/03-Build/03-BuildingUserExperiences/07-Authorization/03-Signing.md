# Signing

Powerhouse uses two complementary signing mechanisms to establish trust across the document lifecycle:

- **Header signing** ties a document's identity to its creator via a cryptographic signature that becomes the document ID.
- **Action signing** ensures every mutation to a document is attributable to a specific user and app, and can be verified offline.

Both mechanisms use **ECDSA with the P-256 curve and SHA-256** via the Web Crypto API.

## Header Signing (Document Identity)

Every Powerhouse document has a header containing immutable identity fields. A header signed as below makes the document's `id` a cryptographic signature, so the document's identity is inseparable from its creator. Such an id is not the one a v2-required document derives, so a document with a signed header is created legacy; see [v2-required documents](#v2-required-documents).

### How it works

When a document is created, the system:

1. Generates a **presigned header** with placeholder values via `createPresignedHeader()`.
2. Builds a deterministic payload from the signing parameters: `documentType + createdAtUtcIso + nonce`.
3. Signs that payload with the creator's private key.
4. Sets the resulting signature as the document's `id`.

The header stores everything needed for self-contained verification:

| Field                    | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `header.id`              | The cryptographic signature (also the document ID) |
| `header.sig.publicKey`   | The creator's public key (JWK format)              |
| `header.sig.nonce`       | Random nonce used as salt during signing           |
| `header.documentType`    | The document model type                            |
| `header.createdAtUtcIso` | Creation timestamp                                 |

### Verification

Anyone can verify a document's authenticity using only its header. The `validateHeader()` function reconstructs a verification-only signer from the embedded public key, regenerates the payload from `documentType + createdAtUtcIso + nonce`, and verifies the signature matches the document ID.

```typescript
import { validateHeader } from "document-model/core";

// Throws if the header signature is invalid
await validateHeader(document.header);
```

### Key functions

| Function                        | Location                            | Purpose                                                     |
| ------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `createPresignedHeader()`       | `document-model/src/core/header.ts` | Creates an unsigned header with placeholder fields          |
| `createSignedHeader()`          | `document-model/src/core/header.ts` | Signs a presigned header, setting `id` to the signature     |
| `createSignedHeaderForSigner()` | `document-model/src/core/header.ts` | Convenience: creates and signs a header in one step         |
| `validateHeader()`              | `document-model/src/core/header.ts` | Verifies a header's signature using its embedded public key |

## Action Signing (Operation Authenticity)

When a user dispatches an action (e.g., editing a field, adding a record), that action can be cryptographically signed to prove who performed it and that the content has not been tampered with.

### The ISigner interface

The `ISigner` interface is the core abstraction for all signing operations:

```typescript
interface ISigner {
  user?: UserActionSigner; // { address: string; networkId: string; chainId: number }
  app?: AppActionSigner; // { name, key }
  publicKey: CryptoKey;

  sign(data: Uint8Array): Promise<Uint8Array>;
  verify(data: Uint8Array, signature: Uint8Array): Promise<void>;
  signAction(
    action: Action,
    target: { documentId: string; branch: string },
    abortSignal?: AbortSignal,
  ): Promise<Signature>;
}
```

It serves two purposes:

- `sign()` / `verify()` handle raw data signing, used for **header signing**.
- `signAction()` produces a structured `Signature` tuple, used for **action signing**. `target` names the document and branch whose log stores the action; the signature is bound to it.

### The Signature tuple

A signed action produces a 5-element `Signature` tuple:

```
[timestamp, signerKey, actionHash, hashField, signatureHex]
```

| Index | Field          | Description                                                                         |
| ----- | -------------- | ----------------------------------------------------------------------------------- |
| 0     | `timestamp`    | Unix timestamp (seconds) when the action was signed                                 |
| 1     | `signerKey`    | The signer's public key identifier (typically a `did:key` URI)                      |
| 2     | `actionHash`   | `v2:` followed by the unpadded base64url SHA-256 of the preimage below (43 chars)   |
| 3     | `hashField`    | Previous state hash, or `prevStateHash:resultingStateHash` for offline verification |
| 4     | `signatureHex` | The ECDSA signature bytes as a `0x`-prefixed hex string                             |

The signed message uses the prefix `\x19Signed Operation:\n{length}` followed by the concatenation of elements 0-3, matching the pattern used by Ethereum-style message signing.

The preimage is the sorted-key JSON (`canonicalJson`) of:

```typescript
[
  "v2",
  documentId,
  branch,
  scope,
  type,
  id,
  timestampUtcMs,
  input,
  signer.user.address,
  signer.user.networkId,
  signer.user.chainId,
  signer.app.key,
];
```

So a tuple is valid for one action, in one document and branch, attributed to one user and key. Signing refuses an empty `documentId` or `branch`, an action with no `input`, and input values JSON storage would not return unchanged: `BigInt`, `NaN`, `Infinity`, sparse arrays and lone surrogates. Object properties holding `undefined` are omitted, as JSON omits them.

A document-scope action is signed for the document it writes to: `ADD_RELATIONSHIP`, `UPDATE_RELATIONSHIP` and `REMOVE_RELATIONSHIP` for `input.sourceId`, the others for `input.documentId`.

### ActionSigner context

Each signed action carries an `ActionSigner` context that identifies both the user and the application:

```typescript
type ActionSigner = {
  user: UserActionSigner; // { address: string; networkId: string; chainId: number }
  app: AppActionSigner; // { name, key (DID) }
  signatures: Signature[];
};
```

`networkId` is the CAIP-2 namespace (`"eip155"`), and `chainId` is the numeric chain id (`1`) — not a string.

This context is attached to the action's `context.signer` field and flows through the entire system -- from the client, through the reactor, into storage, and out through the GQL API.

### Key functions

| Function                | Location                               | Purpose                                                         |
| ----------------------- | -------------------------------------- | --------------------------------------------------------------- |
| `signActionV2()`        | `@powerhousedao/shared/document-model` | Builds a v2 `Signature` tuple from an action, target and signer |
| `hashActionV2()`        | `@powerhousedao/shared/document-model` | Computes element [2] for an action, target and signer           |
| `canonicalJson()`       | `@powerhousedao/shared/document-model` | The sorted-key JSON the preimage is encoded with                |
| `actionSigningTarget()` | `@powerhousedao/shared/document-model` | The document and branch an action submitted to a job lands in   |

## ReactorClient Auto-Signing

The `ReactorClient` automatically signs all actions before submitting them to the reactor. You do not need to manually sign actions when using the client.

### How it works

`ReactorClient` holds an `ISigner` instance. Every mutation method -- `execute()`, `create()`, `createChild()`, `add()`, `remove()`, `move()` -- calls `signActions()` internally before submitting to the reactor. If an action already has valid signatures, it is passed through unchanged.

`execute()`, `executeAsync()` and `executeBatch()` resolve a slug to the document id before signing, because the signature is bound to the id the write is stored under.

A `RemoteDocumentController` built with a slug does the same. Before it signs a push, it asks the remote for the document's id. If the id cannot be resolved, the push fails and nothing is signed.

```typescript
// From reactor/src/core/utils.ts
const signAction = async (action, signer, target, signal?) => {
  // Skip if already signed
  const existingSignatures = action.context?.signer?.signatures;
  if (existingSignatures && existingSignatures.length > 0) {
    return action;
  }

  const signature = await signer.signAction(action, target, signal);

  return {
    ...action,
    context: {
      ...action.context,
      signer: { ...actionSignerIdentity(signer), signatures: [signature] },
    },
  };
};
```

### Wiring a signer

Use `ReactorClientBuilder.withSigner()` to configure signing. It accepts an `ISigner`, or a `SignerConfig` carrying one:

```typescript
import { ReactorClientBuilder } from "@powerhousedao/reactor";

const client = await new ReactorClientBuilder()
  .withReactorBuilder(reactorBuilder)
  .withSigner(mySigner)
  .build();
```

Verification needs no wiring. The reactor checks every write it stores; see [Signature Verification](#signature-verification).

If no signer is provided, the client falls back to an internal `PassthroughSigner` that returns empty signatures, so actions are submitted unsigned. An auth policy then sees an anonymous subject, and no `{ address }` grant matches. A v2-required document refuses unsigned actions, so such a client can only create and write legacy documents; see [The creation default](#the-creation-default). The class is not exported from `@powerhousedao/reactor`. To sign, pass your own `ISigner`.

### ISigner implementations

| Implementation       | Package                                           | Purpose                                                     |
| -------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `PassthroughSigner`  | `@powerhousedao/reactor` (internal, not exported) | No-op signer, used when signing is disabled                 |
| `RenownCryptoSigner` | `@renown/sdk`                                     | Production signer using ECDSA P-256 with `did:key` identity |

`RenownCryptoSigner` is the standard production implementation. It derives signing keys from the Renown identity system and identifies signers using DID URIs (`did:key:z...`).

## Signature Verification

The reactor's executor verifies signatures itself. There is nothing to configure on the client or the reactor builder.

### When a write is verified

A write is verified once, when this reactor first stores it:

- an action submitted to a mutation job (`execute`, `create`, and the other client mutations), or
- an incoming operation in a load job (operations arriving from sync or `reactor.load`).

Operations the reactor only moves are not verified again. That covers stored operations a backdated write or a load reshuffles into a new position, and operations a re-evaluation re-appends.

### What is checked

The last tuple in `context.signer.signatures` is checked:

1. An action with no `context.signer`, or with an empty `signer.app.key` (what `PassthroughSigner` produces), is unsigned. Steps 2 to 5 do not apply to it. An unsigned action with a non-empty `signer.user.address` is refused as `UNSIGNED_IDENTITY` on every document, because the auth scope would decide it as that address.
2. Element [1] of the tuple must equal `signer.app.key`.
3. A `v2:` hash must be `v2:` and 43 base64url characters, element [0] decimal seconds, and element [4] `0x` and 128 lowercase hex digits. The preimage is recomputed for the document and branch the write is stored in and must match, on mutations and loads alike. On a load, the incoming operation's timestamp must be the action's timestamp.
4. A hash without the prefix is a legacy tuple. On a mutation it is recomputed by length: 44 characters is the legacy Renown SHA-256 hash, 28 is the `buildOperationSignature` SHA-1 hash, and any other length is refused. On a load it is not recomputed, because stored input can come back with its keys reordered.
5. The ECDSA P-256 signature over elements [0] to [3] must verify under the `did:key` in element [1].
6. The action id must not already be stored in the document's stream for that scope and branch, unless it is stored with the same content. Such a write, from a retry or a resubmission after a lost response, is not written again: the job writes the rest and succeeds, and reports the stored operation as if it had just written it.
7. For a signed action, the host's trust policy must accept `signer.app.key` as a signer for `signer.user`. See [Trust policy](#trust-policy).

A mutation job fails on the first refusal, and nothing it carried is stored. A load job drops the refused operations, stores the rest, and succeeds.

### Trust policy

Steps 1 to 6 prove that the key in the tuple signed this action for this document. They do not prove that the key may sign as the address in `signer.user`. The host decides that through a `SignatureTrustPolicy`:

```typescript
type SignatureTrustPolicy = {
  authorizeSigner(
    signer: ActionSigner,
    key: string,
    documentId: string,
  ): Promise<boolean>;
};

const reactorBuilder = new ReactorBuilder().withTrustPolicy(
  policy,
  workerPolicySpec, // optional FactorySpec a pooled worker imports to build the same policy
);
```

A `SignerConfig` can carry it as `trustPolicy` and `workerTrustPolicy`, and `ReactorClientBuilder.withSigner()` hands it to a `ReactorBuilder` that has none.

- It is asked once per signed write at admission. Unsigned actions and re-appended operations never reach it.
- `false` refuses the write as `SIGNER_UNAUTHORIZED`.
- A throw, or no answer within 10 seconds (or half the job timeout, if shorter), fails the job, and the queue retries it. Nothing is dropped, so throw on a transient failure instead of returning `false`.
- The answer must not depend on when it is asked, because replicas admit the same write at different times. Cache an acceptance and never expire it.
- The reactor's own signer key, signing as the reactor's own user, is accepted without asking.
- The reactor's own user is read on every ask, so a login takes effect immediately. Key a policy's cache on (`signer.user`, `key`) only. Invalidate nothing when the local identity changes, because other users' verdicts do not depend on it.

With no policy, a signed write is refused while the `authEnforcement` feature flag is on and accepted otherwise, because the auth scope trusts `signer.user.address`.

Under `authEnforcement`, the switchboard uses `createRenownTrustPolicy` from `@renown/sdk`. It accepts a key when a Renown credential issued by `did:pkh:<networkId>:<chainId>:<address>` delegates to that `did:key`, and the credential's EIP-712 proof recovers to the address. The credential is read from the Renown instance the switchboard authenticates against (`RENOWN_SOURCE`, `RENOWN_URL`, `SWITCHBOARD_URL`), and a failed read fails the job for a retry. Its expiry and revocation are ignored; revoke a user's access through auth-scope grants.

A credential can reach a replica after the user's first writes do. While no credential is found, the lookup fails the job for a retry. This lasts for 5 minutes after the first miss for that address and key (`missingCredentialWindowMs` on `createRenownTrustPolicy`). After that the write is refused, and the refusal is remembered for 60 seconds.

With `RENOWN_SOURCE=self`, pooled executor workers get no trust policy. A switchboard with `REACTOR_WORKERS` above 0 and `REACTOR_AUTH_ENFORCEMENT` on therefore refuses to boot. Use a remote Renown source, or set `REACTOR_WORKERS=0`.

### v2-required documents

A document is legacy or v2-required, fixed when it is created. `protocolVersions.signature: 2` in the header makes it v2-required; without the key it is legacy, and the checks above are all it gets. New documents are v2-required unless the caller or host asks otherwise. Existing documents keep the policy they were created with. On a v2-required document:

- an unsigned action, or one with an empty `signer.app.key`, is refused as `UNSIGNED_REQUIRED`,
- a legacy tuple is refused as `SCHEME_BELOW_POLICY`.

The id of a v2-required document is `base64url(sha256(canonicalJson({ documentType, createdAtUtcIso, nonce, protocolVersions })))`: 43 base64url characters, not a UUID. Its requirement cannot be changed without changing its id, and it cannot take an id you choose. A model's `utils.createDocument()` derives the id when it builds the header, so `document.header.id` is final before the document is created:

```typescript
import { withSignaturePolicy } from "@powerhousedao/shared/document-model";

// v2-required, under a derived id
const document = module.utils.createDocument();
await client.create(document);
await client.createEmpty("powerhouse/document-model");
await client.drives.create({ global: { name: "Drive" } });

// legacy, for one document
await client.createEmpty("powerhouse/document-model", {
  signaturePolicy: "legacy",
});
await client.drives.create({
  global: { name: "Drive" },
  signaturePolicy: "legacy",
});
await client.create(
  withSignaturePolicy(module.utils.createDocument(), "legacy", {
    id: "my-document",
  }),
);
```

`client.create()` and `client.drives.addFile()` create the document under the header it carries. `withSignaturePolicy(document, policy, { id })` gives a document that has not been created a fresh header under `policy`; only a legacy header takes `id`.
Under `v2-required` a given `id` is ignored and the id is derived, so code that needs a fixed id must ask for `legacy`.

A `CREATE_DOCUMENT` whose id does not recompute from its own input is refused as `ID_MISMATCH`, and so is a legacy `CREATE_DOCUMENT` that takes an id of that shape. A copy of a v2-required document is v2-required, under a new derived id. A copy of a legacy document is created under the creation default below. An imported `.phd` keeps the policy it was exported with.

The NOOP an `UNDO` becomes and the action a `REDO` rebuilds are signed by the reactor's own signer. A reactor with no signer stores them unsigned, and every peer refuses them on a v2-required document, so a host that writes to v2-required documents must be given a signer. A client with no signer cannot create a v2-required document at all: its `CREATE_DOCUMENT` is unsigned.

### The creation default

What a host creates when the caller does not choose is set once per client:

```typescript
const client = await new ReactorClientBuilder()
  .withReactorBuilder(reactorBuilder)
  .withSigner(signer)
  .withCreateSignaturePolicy("legacy") // default: "v2-required"
  .build();

await client.getCreateSignaturePolicy(); // "legacy"
```

It applies to `createEmpty()`, `drives.create()`, copies of legacy documents, the documents reactor-browser's `addDocument` and `addDrive` create, and the documents a switchboard's `createEmptyDocument` and `createDocumentWithInitialState` mutations create. It never changes an existing document, and it does not change what a reactor accepts: a reactor creating legacy documents verifies a v2-required document it receives as strictly as any other.

| Host        | Setting                                                             |
| ----------- | ------------------------------------------------------------------- |
| Switchboard | `CREATE_SIGNATURE_POLICY=legacy` or `v2-required` (default)         |
| Connect     | `connect.reactor.createSignaturePolicy` in `powerhouse.config.json` |
| Library     | `ReactorClientBuilder.withCreateSignaturePolicy()`                  |

A switchboard with no identity (Renown failed to initialize) has no signer, so it creates legacy documents and logs a warning. A configured default drive with a fixed `id` is created legacy, because a v2-required document cannot take a chosen id.

Create v2-required documents only once every reactor that syncs them runs a release that verifies v2 policy. An older reactor stores whatever it would have stored before on such a document, and forwards it, and upgraded peers drop those operations. Until the whole fleet is upgraded, set the creation default to `legacy`.

### Log mode and enforcement

Verification runs in one of two modes, set through the executor config:

```typescript
const reactorBuilder = new ReactorBuilder().withExecutorConfig({
  signatureVerification: "log", // default: "enforce"
});
```

- `enforce` (the default) refuses the write.
- `log` records every refusal and stores the write anyway.

Each refusal emits a `SIGNATURE_REFUSED` event on the reactor event bus, with the refusal `code`, the signature `scheme`, the admission `path` (`mutation` or `load`), and whether it was `enforced`. `@powerhousedao/opentelemetry-instrumentation-reactor` counts these as `reactor.signature.refusals`.

A refused mutation fails with an `InvalidSignatureError`. Its message carries the code in brackets, for example `[HASH_MISMATCH]`, and the code is also on the error's `code` field. The codes are `UNSIGNED_REQUIRED`, `UNSIGNED_IDENTITY`, `KEY_MISMATCH`, `MALFORMED_TUPLE`, `TIMESTAMP_MISMATCH`, `HASH_MISMATCH`, `BAD_SIGNATURE`, `SCHEME_BELOW_POLICY`, `ID_MISMATCH`, `DUPLICATE_ACTION`, and `SIGNER_UNAUTHORIZED`.

## Signing at the GQL / Switchboard Level

When you interact with a reactor through its GraphQL API (the switchboard), signing is handled for you depending on how actions are submitted.

### Submitting actions via GQL mutations

The GQL mutations `mutateDocument` and `mutateDocumentAsync` accept actions as JSON objects. These actions are passed through the switchboard's `ReactorClient`, which auto-signs them using whatever `ISigner` was configured on that reactor instance.

This means:

- **If you submit unsigned actions** through the GQL API, the switchboard signs them on your behalf using its configured signer. An action whose `signer.app.key` or last tuple's key is empty is unsigned, whatever it carries in `signatures`, and is signed as the switchboard.
- **If you submit pre-signed actions** (actions that already have a `context.signer` with a key and signatures), the switchboard passes them through unchanged -- it does not re-sign.

### When the switchboard signs

The switchboard signs actions during any mutation that flows through the `ReactorClient`:

| Mutation                                                      | What gets signed                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `createDocument`                                              | CREATE_DOCUMENT + UPGRADE_DOCUMENT actions, plus parent relationship action if a parent is specified |
| `createEmptyDocument`                                         | Same as above, using a default initial state                                                         |
| `mutateDocument` / `mutateDocumentAsync`                      | All submitted actions                                                                                |
| `addRelationship` / `removeRelationship` / `moveRelationship` | Relationship actions on the source document(s)                                                       |
| `deleteDocument` / `deleteDocuments`                          | DELETE_DOCUMENT actions for the target and its descendants                                           |

### When you should pre-sign

If your client has its own `ISigner` (e.g., a `RenownCryptoSigner` tied to a specific user identity), you should sign actions before submitting them to the GQL API. This ensures the signatures reflect the actual user who performed the action, rather than the switchboard's server-side identity.

Pre-signed actions are detected by `action.context.signer`: if `signer.app.key` and the key in its last tuple are both non-empty, the `ReactorClient` skips signing.
