---
toc_max_heading_level: 3
---

# Attachment service

The `@powerhousedao/reactor-attachments` package decouples large binaries (images, files, avatars) from the action and operation pipeline. Instead of carrying base64-encoded `data` strings inside actions, document state holds opaque refs of the form `attachment://v1:<sha256>`, and the bytes flow through a dedicated `IAttachmentService`. Storage is content-addressed, so identical uploads dedupe to the same ref.

```typescript
import {
  type IAttachmentService,
  type AttachmentRef,
  createRemoteAttachmentService,
} from "@powerhousedao/reactor-attachments";
```

For an architectural overview see [Working with the Reactor](/academy/Architecture/WorkingWithTheReactor). For the full design — storage layout, eviction, transports, the planned S3 backend — see the deep-dive doc at `packages/reactor/docs/attachments.md` in the monorepo.

## When to use it

Reach for the attachment service whenever a field would otherwise be a base64 `data` string or a long data URI. Typical cases:

- File or image uploads from an editor (chat input bars, document attachments, exports).
- Agent or user avatars carried alongside document state.
- Any binary that must round-trip through sync or GraphQL, where inlining the bytes would bloat operations and sync channels.

If the field is small, fixed-length, and not really binary (a short string, a number, a JSON blob), keep it inline — attachments are designed for arbitrary-sized binary content.

## Getting an `IAttachmentService` instance

The recommended client today is the switchboard-backed remote service. It targets a running switchboard's REST endpoints for reservations, uploads, and downloads:

```typescript
import { createRemoteAttachmentService } from "@powerhousedao/reactor-attachments";

const attachments = createRemoteAttachmentService({
  remoteUrl: "https://switchboard.example.com",
  // Optional: provide a JWT handler if the switchboard requires auth.
  // jwtHandler,
  // Optional: inject a custom fetch (defaults to globalThis.fetch).
  // fetchFn,
});
```

:::tip
The switchboard remote service is the supported client implementation right now. Other transports (S3, peer-to-peer) are designed but not yet stable — prefer `createRemoteAttachmentService` until these docs call out a replacement.
:::

On the server side (inside a subgraph, processor, or trigger), the service is already wired into `ReactorContext` by `@powerhousedao/reactor-api` and is available as `reactor.attachments`. There is no need to construct one yourself — see `packages/reactor-api/src/server.ts` for the wiring.

## The general flow

Every interaction with the package is one of three operations on `IAttachmentService`: reserve a slot, send the bytes, then later read them back by ref.

### 1. Reserve an upload slot

`reserve()` returns an `IAttachmentUpload` handle. The handle hides the transport — the caller never sees URLs, headers, or auth tokens.

```typescript
const upload = await attachments.reserve({
  mimeType: "image/png",
  fileName: "avatar.png",
});
```

The handle is valid until its reservation expires (default 24h). Aborted uploads are cleaned up by a periodic sweep on the server; clients do not need to release reservations manually.

### 2. Send the bytes

`upload.send()` takes a `ReadableStream<Uint8Array>` and resolves to `{ hash, ref, header }`. Identical bytes always produce the same hash and ref — dedup is automatic.

Browser upload:

```typescript
const resp = await fetch(file.url); // blob: or data: URL staged by the input
if (!resp.body) throw new Error("Could not read staged file");

const upload = await attachments.reserve({
  mimeType: file.mediaType,
  fileName: file.filename ?? "attachment",
});
const { ref } = await upload.send(resp.body);
```

Server upload from a data URI or remote URL:

```typescript
async function resolveImageSource(image: string) {
  const dataUriMatch = image.match(/^data:([^;]+);base64,/);
  if (dataUriMatch) {
    const mimeType = dataUriMatch[1];
    const bytes = Buffer.from(image.slice(dataUriMatch[0].length), "base64");
    return { mimeType, stream: new Blob([bytes]).stream() };
  }
  const res = await fetch(image);
  if (!res.ok || !res.body) throw new Error(`Failed to fetch ${image}`);
  return {
    mimeType: res.headers.get("content-type") ?? "application/octet-stream",
    stream: res.body,
  };
}

const { mimeType, stream } = await resolveImageSource(agent.image);
const upload = await attachments.reserve({ mimeType, fileName: `${agent.id}-avatar` });
const { ref } = await upload.send(stream);
```

### 3. Use and read the ref

Store `result.ref` in document state through a normal action — there are no special "attach" actions. The reducer treats the ref like any other string field.

```typescript
await reactor.client.execute(documentId, "main", [
  setAgentImage({ attachment: ref }),
]);
```

Later, anywhere the bytes are needed, call `service.get(ref)` and stream the body. In the browser, drain the stream into a `Blob` and hand it to `URL.createObjectURL` for an `<img>` or `<a download>`:

```typescript
const response = await attachments.get(ref);

const chunks: Uint8Array[] = [];
const reader = response.body.getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
}

const blob = new Blob(chunks as BlobPart[], { type: response.header.mimeType });
const objectUrl = URL.createObjectURL(blob);
// ...later: URL.revokeObjectURL(objectUrl);
```

`get()` always succeeds for a known ref. If the bytes were evicted from local storage, the service transparently re-fetches them through the transport.

## Declaring attachment fields in a document model

The integration surface between document models and the attachment system is a single GraphQL scalar: `Attachment`. Declare attachment-bearing fields with it, and codegen will emit a TypeScript `string` (specifically `AttachmentRef`).

```graphql
scalar Attachment

input SetAgentImageInput {
  attachment: Attachment!
}

type AgentInfo {
  attachment: Attachment
}
```

The reducer stores the value verbatim — no special handling needed:

```typescript
setAgentImageOperation(state, action) {
  state.agent.attachment = action.input.attachment; // AttachmentRef string
}
```

## API reference

### `IAttachmentService`

| Method                              | Returns                          | Description                                                                                                  |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `reserve(options)`                  | `Promise<IAttachmentUpload>`     | Reserve a new attachment slot and return an upload handle.                                                   |
| `stat(ref)`                         | `Promise<AttachmentHeader>`      | Look up metadata for an existing ref. Throws `AttachmentNotFound` if the ref is unknown.                     |
| `get(ref, signal?)`                 | `Promise<AttachmentResponse>`    | Retrieve the bytes. Re-fetches transparently if the data was evicted. Accepts an optional `AbortSignal`.     |

### `IAttachmentUpload`

| Member             | Type                                                            | Description                                                                                                       |
| ------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `reservationId`    | `string`                                                        | Unique identifier for this reservation.                                                                           |
| `send(data)`       | `(ReadableStream<Uint8Array>) => Promise<AttachmentUploadResult>` | Stream the bytes through the handle. Returns `{ hash, ref, header }`. Dedup against existing hashes is automatic. |

### Key types

| Type                       | Shape                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `AttachmentRef`            | `` `attachment://v${number}:${string}` `` — opaque ref string used in document state.                                     |
| `ReserveAttachmentOptions` | `{ mimeType: string; fileName: string; extension?: string \| null }`                                                      |
| `AttachmentUploadResult`   | `{ hash: AttachmentHash; ref: AttachmentRef; header: AttachmentHeader }`                                                  |
| `AttachmentHeader`         | `{ hash; mimeType; fileName; sizeBytes; extension; status; source; createdAtUtc; lastAccessedAtUtc }`                     |
| `AttachmentResponse`       | `{ header: AttachmentHeader; body: ReadableStream<Uint8Array> }`                                                          |

### Errors

| Class                  | When it is thrown                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `AttachmentNotFound`   | `stat(ref)` or `get(ref)` called with a ref the store does not know.               |
| `InvalidAttachmentRef` | A string passed where a ref is expected does not match `attachment://v<N>:<hash>`. |
| `UploadTooLarge`       | `upload.send()` exceeded the server's configured byte cap. Maps to HTTP 413.       |
| `ReservationNotFound`  | `upload.send()` after the reservation expired or was deleted.                      |

### Helpers

`parseRef(ref)` and `createRef(hash, version?)` are exported from the package, but refs should be treated as opaque outside the service itself. Reach for them only if you genuinely need to inspect or reconstruct a ref (for example, in tests or debugging tooling).

## Migrating from inline `data` fields

If a document model previously inlined binary content, the migration is small and mechanical:

- **Schema** — replace `data: String` (or composite fields like `{ image, imageMediaType, imageUrl }`) with a single `attachment: Attachment` field on the input and the state type.
- **Write path** — replace the base64-encoding step with `attachments.reserve({ mimeType, fileName })` followed by `upload.send(stream)`. Dispatch the action with `result.ref`.
- **Read path** — replace data-URI assembly with `attachments.get(ref)`. In a browser, drain the stream into a `Blob` and use `URL.createObjectURL` (remember to `revokeObjectURL` on cleanup).
- **Graceful degradation** — code paths that may run without an attachment service (mock environments, tests, off-line previews) should branch on `if (!attachments)`. Writers should surface a clear error to the user; readers should skip the attachment and render a placeholder.

## Deep dive

See `packages/reactor/docs/attachments.md` in the monorepo for the full design: storage internals, the LRU eviction policy, the `IAttachmentStore` and `IAttachmentTransport` interfaces, the switchboard upload protocol, and the planned S3 backend.
