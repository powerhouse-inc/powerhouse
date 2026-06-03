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

The package exposes two layers. `IAttachmentService` is the low-level, transport-facing interface — reserve a slot, stream the bytes, read them back by ref. `IAttachmentClient` wraps a service with convenience helpers; most notably `preprocess()`, which hashes a file up front so its ref is known before the bytes are uploaded. Build a client with `createAttachmentClient(service)`, and import it from the `/client` entrypoint:

```typescript
import {
  createAttachmentClient,
  type IAttachmentClient,
  type PreprocessResult,
} from "@powerhousedao/reactor-attachments/client";
```

The React hooks in `@powerhousedao/reactor-browser` are built on the client.

For an architectural overview see [Working with the Reactor](/academy/Architecture/WorkingWithTheReactor). For the full design — storage layout, eviction, transports, the hash-first/pending protocol, and the planned S3 backend — see the deep-dive docs `packages/reactor/docs/attachments.md` and `packages/reactor/docs/attachments-hash-first.md` in the monorepo.

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

On the server side (inside a subgraph, processor, or trigger), an `IAttachmentClient` is already wired into the host context by `@powerhousedao/reactor-api` and is available as `context.attachments`. There is no need to construct one yourself — the server builds the service and wraps it with `createAttachmentClient(...)`; see `packages/reactor-api/src/server.ts` for the wiring.

## The general flow

Every interaction with the package comes down to three operations: reserve a slot, send the bytes, then later read them back by ref.

There are two reservation modes. They are equivalent in capability — neither is preferred, so pick whichever fits the caller:

- **Upload-first** — reserve with just `{ mimeType, fileName }`. The content hash, and therefore the final ref, is only known *after* `send()` completes. Simplest when you can stream the bytes straight through and do not need the ref until the upload finishes.
- **Hash-first** — hash the content up front and reserve with `{ clientHash, sizeBytes, ... }`. The ref is known at reservation time, so it can be written into document state before (or in parallel with) the upload, and dedup can short-circuit before any bytes are sent. The trade-off is that the whole file must be read to hash it. `IAttachmentClient.preprocess()` does that hashing for you.

The walkthrough below uses the low-level service in upload-first mode. The [attachment client](#the-attachment-client) section shows the hash-first flow.

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

`get()` succeeds for any ref whose bytes are available. If the bytes were evicted from local storage, the service transparently re-fetches them through the transport. A hash-first ref can also be *pending* — reserved, with state already referencing it, but the bytes not yet uploaded. During that window `get()` throws `AttachmentPending`, while `stat()` succeeds and reports the declared size.

## The attachment client

`IAttachmentClient` wraps an `IAttachmentService` with the hash-first flow. Build one with `createAttachmentClient(service)` (server code already receives one as `context.attachments`).

`preprocess(file)` reads the whole file, computes its SHA-256, and returns everything you need to both reference and upload it:

```typescript
const attachments = createAttachmentClient(service);

const results = await attachments.preprocess(file);
// results: { ref, hash, sizeBytes, options, data, stream }
```

Because it has to read the entire file to hash it, `preprocess` is async and buffers the bytes in memory — `file` is a `Blob`, not a stream.

With the ref in hand you can write it into document state through a normal action, then upload the bytes:

```typescript
await client.execute(documentId, "main", [
  attachInvoice({ scan: results.ref, vendorName: "Acme" }),
]);

await attachments.reserve(results.options, (handle) => handle.send(results.stream()));
```

`client.reserve(options, send)` reserves the slot and hands the upload handle to your `send` callback. If an attachment with the same hash already exists it short-circuits and returns the existing ref without uploading. Pass `results.stream()` — which returns a fresh `ReadableStream` on each call — rather than the single-use `results.data` if the upload might be retried. `send()` accepts any `ReadableStream<Uint8Array>`, so on the server you can stream from the original source instead of the buffered copy.

Execute and reserve are awaited separately so each failure is handled on its own — a failed upload does not roll back the action, and a failed action does not strand an upload. If you do not need that separation, run them concurrently:

```typescript
await Promise.all([
  client.execute(documentId, "main", [
    attachInvoice({ scan: results.ref, vendorName: "Acme" }),
  ]),
  attachments.reserve(results.options, (handle) => handle.send(results.stream())),
]);
```

### React

`@powerhousedao/reactor-browser` exposes hooks built on the client. `useAttachments()` returns an `IAttachmentClient` for the current service (or `undefined` if none is configured). `useAttachmentUpload()` drives the full preprocess + upload lifecycle and tracks its status:

```tsx
const client = useReactorClient();
const { preprocess, upload, status, progress, error } = useAttachmentUpload();

const submit = useCallback(async () => {
  // Buffers the file in memory and hands back the ref. Async because it has to
  // read the whole file to hash it.
  const results = await preprocess(file);

  // Execute with the generated ref. `scan` is just a string here; the action
  // and codegen never see the file or the attachments package.
  await client.execute(documentId, "main", [
    attachInvoice({ scan: results.ref, vendorName: "Acme" }),
  ]);

  // Upload the bytes. Awaited separately from execute() so each failure is
  // handled on its own.
  await upload(results);
}, [client, preprocess, upload, documentId, file]);
```

In render, read the lifecycle straight off the hook:

- `status` — `UploadStatus`: `None | Hashing | Uploading | Done | Error`
- `progress` — coarse/stage-based; the remote transport buffers then issues a single PUT, so byte-level progress is not available yet
- `error` — the upload failure, if any

`preprocess` and `upload` are stable callbacks. `upload(results)` wraps `client.reserve(results.options, (handle) => handle.send(results.stream()))` and updates `status`/`progress`/`error`. Because React runs in the browser, this mirrors the buffered flow above; the ref still only exists after `preprocess` resolves, so submission is async — you cannot produce a ref inside the synchronous action input.

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

### `IAttachmentClient`

| Method                    | Returns                            | Description                                                                                                                                                                          |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `preprocess(file, opts?)` | `Promise<PreprocessResult>`        | Read and hash a `Blob` up front. Returns the ref, hash, declared size, hash-first reserve options, and the buffered bytes (as a single-use `data` stream and a re-readable `stream()` factory). `opts` may override `{ fileName, mimeType }`. |
| `reserve(options, send)`  | `Promise<AttachmentUploadResult>`  | Reserve a hash-first slot and run `send(handle)`. Short-circuits to the existing ref if the hash is already stored (`AttachmentAlreadyExists` is handled internally).                |

### Key types

| Type                       | Shape                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `AttachmentRef`            | `` `attachment://v${number}:${string}` `` — opaque ref string used in document state.                                     |
| `ReserveAttachmentOptions` | `UploadFirstReserveAttachmentOptions \| HashFirstReserveAttachmentOptions` — discriminated on `clientHash`.                |
| `UploadFirstReserveAttachmentOptions` | `{ mimeType: string; fileName: string; extension?: string \| null }` — no `clientHash`; ref known only after `send()`. |
| `HashFirstReserveAttachmentOptions`   | `{ mimeType: string; fileName: string; extension?: string \| null; clientHash: AttachmentHash; sizeBytes: number }` — ref known at reserve time. |
| `PreprocessResult`         | `{ ref: AttachmentRef; hash: AttachmentHash; sizeBytes: number; options: HashFirstReserveAttachmentOptions; data: ReadableStream<Uint8Array>; stream: () => ReadableStream<Uint8Array> }` |
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
| `AttachmentAlreadyExists` | Hash-first `reserve()` for content whose hash is already stored. The client's `reserve()` catches this and returns the existing ref instead of uploading. |
| `AttachmentPending`    | `get(ref)` for a hash that is reserved but whose bytes have not finished uploading. |
| `HashMismatch`         | Hash-first `send()` whose uploaded bytes do not match the claimed `clientHash`.    |
| `SizeMismatch`         | Hash-first `send()` whose actual byte count differs from the declared `sizeBytes`. |

### Helpers

`parseRef(ref)` and `createRef(hash, version?)` are exported from the package, but refs should be treated as opaque outside the service itself. Reach for them only if you genuinely need to inspect or reconstruct a ref (for example, in tests or debugging tooling).

## Migrating from inline `data` fields

If a document model previously inlined binary content, the migration is small and mechanical:

- **Schema** — replace `data: String` (or composite fields like `{ image, imageMediaType, imageUrl }`) with a single `attachment: Attachment` field on the input and the state type.
- **Write path** — replace the base64-encoding step with a reservation and upload. Either reserve on the service directly (`attachments.reserve({ mimeType, fileName })` then `upload.send(stream)`, dispatching with `result.ref`), or use the client (`attachments.preprocess(file)` then `client.execute(...)` with `results.ref` and `attachments.reserve(results.options, ...)`). In the browser, `useAttachmentUpload()` wraps the client flow.
- **Read path** — replace data-URI assembly with `attachments.get(ref)`. In a browser, drain the stream into a `Blob` and use `URL.createObjectURL` (remember to `revokeObjectURL` on cleanup).
- **Graceful degradation** — code paths that may run without an attachment service (mock environments, tests, off-line previews) should branch on `if (!attachments)`. Writers should surface a clear error to the user; readers should skip the attachment and render a placeholder.

## Deep dive

See `packages/reactor/docs/attachments.md` in the monorepo for the full design: storage internals, the LRU eviction policy, the `IAttachmentStore` and `IAttachmentTransport` interfaces, the switchboard upload protocol, and the planned S3 backend. For the hash-first reservation mode, hash/size verification on ingest, and the pending-upload lifecycle, see `packages/reactor/docs/attachments-hash-first.md`.
