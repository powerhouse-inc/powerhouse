# Signing

Powerhouse uses two complementary signing mechanisms to establish trust across the document lifecycle:

- **Header signing** ties a document's identity to its creator via a cryptographic signature that becomes the document ID.
- **Action signing** ensures every mutation to a document is attributable to a specific user and app, and can be verified offline.

Both mechanisms use **ECDSA with the P-256 curve and SHA-256** via the Web Crypto API.

## Header Signing (Document Identity)

Every Powerhouse document has a header containing immutable identity fields. The document's `id` field is itself a cryptographic signature, meaning the document's identity is inseparable from its creator.

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
  user?: UserActionSigner; // { address, networkId, chainId }
  app?: AppActionSigner; // { name, key }
  publicKey: CryptoKey;

  sign(data: Uint8Array): Promise<Uint8Array>;
  verify(data: Uint8Array, signature: Uint8Array): Promise<void>;
  signAction(action: Action, abortSignal?: AbortSignal): Promise<Signature>;
}
```

It serves two purposes:

- `sign()` / `verify()` handle raw data signing, used for **header signing**.
- `signAction()` produces a structured `Signature` tuple, used for **action signing**.

### The Signature tuple

A signed action produces a 5-element `Signature` tuple:

```
[timestamp, signerKey, actionHash, hashField, signatureHex]
```

| Index | Field          | Description                                                                         |
| ----- | -------------- | ----------------------------------------------------------------------------------- |
| 0     | `timestamp`    | Unix timestamp (seconds) when the action was signed                                 |
| 1     | `signerKey`    | The signer's public key identifier (typically a `did:key` URI)                      |
| 2     | `actionHash`   | SHA-1 hash of `documentId + scope + actionType + JSON(input)`                       |
| 3     | `hashField`    | Previous state hash, or `prevStateHash:resultingStateHash` for offline verification |
| 4     | `signatureHex` | The ECDSA signature bytes as a `0x`-prefixed hex string                             |

The signed message uses the prefix `\x19Signed Operation:\n{length}` followed by the concatenation of elements 0-3, matching the pattern used by Ethereum-style message signing.

### ActionSigner context

Each signed action carries an `ActionSigner` context that identifies both the user and the application:

```typescript
type ActionSigner = {
  user: UserActionSigner; // { address, networkId (CAIP-2), chainId (CAIP-10) }
  app: AppActionSigner; // { name, key (DID) }
  signatures: Signature[];
};
```

This context is attached to the action's `context.signer` field and flows through the entire system -- from the client, through the reactor, into storage, and out through the GQL API.

### Key functions

| Function                           | Location                             | Purpose                                                      |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `buildOperationSignature()`        | `document-model/src/core/actions.ts` | Creates a Signature tuple from an action context             |
| `buildSignedAction()`              | `document-model/src/core/actions.ts` | Reduces an action, signs it, and attaches the signer context |
| `verifyOperationSignature()`       | `document-model/src/core/actions.ts` | Verifies a Signature tuple against its signer                |
| `buildOperationSignatureParams()`  | `document-model/src/core/crypto.ts`  | Builds the 4-element params from action context              |
| `buildOperationSignatureMessage()` | `document-model/src/core/crypto.ts`  | Constructs the prefixed message for signing                  |

## ReactorClient Auto-Signing

The `ReactorClient` automatically signs all actions before submitting them to the reactor. You do not need to manually sign actions when using the client.

### How it works

`ReactorClient` holds an `ISigner` instance. Every mutation method -- `execute()`, `create()`, `createChild()`, `add()`, `remove()`, `move()` -- calls `signActions()` internally before submitting to the reactor. If an action already has valid signatures, it is passed through unchanged.

```typescript
// From reactor/src/core/utils.ts
const signAction = async (action, signer, signal?) => {
  // Skip if already signed
  const existingSignatures = action.context?.signer?.signatures;
  if (existingSignatures && existingSignatures.length > 0) {
    return action;
  }

  const signature = await signer.signAction(action, signal);

  return {
    ...action,
    context: {
      ...action.context,
      signer: {
        user: { address: signer.user?.address || "", ... },
        app: { name: signer.app?.name || "", key: signer.app?.key || "" },
        signatures: [signature],
      },
    },
  };
};
```

### Wiring a signer

Use `ReactorClientBuilder.withSigner()` to configure signing. It accepts either a bare `ISigner` or a `SignerConfig` that includes an optional verifier:

```typescript
import { ReactorClientBuilder } from "reactor";
import { createSignatureVerifier, RenownCryptoSigner } from "renown";

// Option 1: Signing only (no server-side verification)
const client = await new ReactorClientBuilder()
  .withReactorBuilder(reactorBuilder)
  .withSigner(mySigner)
  .build();

// Option 2: Signing + verification
const client = await new ReactorClientBuilder()
  .withReactorBuilder(reactorBuilder)
  .withSigner({
    signer: mySigner,
    verifier: createSignatureVerifier(),
  })
  .build();
```

If no signer is provided, the client defaults to `PassthroughSigner` -- a no-op implementation that returns empty signatures, effectively disabling signing.

### ISigner implementations

| Implementation       | Package   | Purpose                                                     |
| -------------------- | --------- | ----------------------------------------------------------- |
| `PassthroughSigner`  | `reactor` | No-op signer, used when signing is disabled                 |
| `RenownCryptoSigner` | `renown`  | Production signer using ECDSA P-256 with `did:key` identity |

`RenownCryptoSigner` is the standard production implementation. It derives signing keys from the Renown identity system and identifies signers using DID URIs (`did:key:z...`).

## Signature Verification

Signature verification is optional and runs in the reactor's executor before actions are processed.

### How it works

The `SignatureVerifier` class sits in the executor pipeline. When a `SignatureVerificationHandler` is configured, it:

1. Inspects each incoming action for a `context.signer`.
2. If a signer is present but has no signatures, the action is rejected.
3. Calls the handler to verify the signature against the signer's public key.
4. Throws `InvalidSignatureError` if verification fails.

This applies to both action jobs (new mutations) and load jobs (operations arriving from sync).

### Configuration

Verification is enabled by passing a `verifier` in the `SignerConfig`:

```typescript
import { createSignatureVerifier } from "renown";

const client = await new ReactorClientBuilder()
  .withReactorBuilder(reactorBuilder)
  .withSigner({
    signer: mySigner,
    verifier: createSignatureVerifier(),
  })
  .build();
```

The `createSignatureVerifier()` function from the `renown` package returns a handler that uses the Web Crypto API to verify ECDSA P-256 signatures. It extracts the public key from the signer's DID and verifies the signature against the reconstructed message.

If no verifier is provided, all actions are accepted regardless of their signature status.

## Signing at the GQL / Switchboard Level

When you interact with a reactor through its GraphQL API (the switchboard), signing is handled for you depending on how actions are submitted.

### Submitting actions via GQL mutations

The GQL mutations `mutateDocument` and `mutateDocumentAsync` accept actions as JSON objects. These actions are passed through the switchboard's `ReactorClient`, which auto-signs them using whatever `ISigner` was configured on that reactor instance.

This means:

- **If you submit unsigned actions** through the GQL API, the switchboard signs them on your behalf using its configured signer.
- **If you submit pre-signed actions** (actions that already have a `context.signer` with signatures), the switchboard passes them through unchanged -- it does not re-sign.

### When the switchboard signs

The switchboard signs actions during any mutation that flows through the `ReactorClient`:

| Mutation                                          | What gets signed                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `createDocument`                                  | CREATE_DOCUMENT + UPGRADE_DOCUMENT actions, plus parent relationship action if a parent is specified |
| `createEmptyDocument`                             | Same as above, using a default initial state                                                         |
| `mutateDocument` / `mutateDocumentAsync`          | All submitted actions                                                                                |
| `addChildren` / `removeChildren` / `moveChildren` | Relationship actions on the parent document(s)                                                       |
| `deleteDocument` / `deleteDocuments`              | DELETE_DOCUMENT actions for the target and its descendants                                           |

### When you should pre-sign

If your client has its own `ISigner` (e.g., a `RenownCryptoSigner` tied to a specific user identity), you should sign actions before submitting them to the GQL API. This ensures the signatures reflect the actual user who performed the action, rather than the switchboard's server-side identity.

Pre-signed actions are detected by checking for existing signatures in `action.context.signer.signatures` -- if any are present, the `ReactorClient` skips signing.
