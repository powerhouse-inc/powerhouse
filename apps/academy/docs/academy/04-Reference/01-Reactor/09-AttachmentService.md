---
toc_max_heading_level: 3
---

# Attachment service

The `@powerhousedao/reactor-attachments` package decouples large binaries (images, files, avatars) from the action and operation pipeline. Instead of carrying base64-encoded `data` strings inside actions, document state holds opaque refs of the form `attachment://v1:<sha256>`, and the bytes flow through a dedicated `IAttachmentService`. Storage is content-addressed, so identical uploads dedupe to the same ref.

```typescript
import type { AttachmentRef, AttachmentHash } from "@powerhousedao/reactor";
import {
  type IAttachmentService,
  createRemoteAttachmentService,
} from "@powerhousedao/reactor-attachments";
```

`AttachmentRef` and `AttachmentHash` are defined in `@powerhousedao/reactor`; reactor-attachments re-exports neither. Of the ref-related symbols, only the `InvalidAttachmentRef` error class lives in reactor-attachments. The service and client symbols come from `@powerhousedao/reactor-attachments` and `@powerhousedao/reactor-attachments/client`.

The package exposes two layers. `IAttachmentService` is the low-level, transport-facing interface — reserve a slot, stream the bytes, read them back by ref. `IAttachmentClient` wraps a service with convenience helpers; most notably `preprocess()`, which hashes a file up front so its ref is known before the bytes are uploaded. Build a client with `createAttachmentClient(service)`, and import it from the `/client` entrypoint:

```typescript
import {
  createAttachmentClient,
  type IAttachmentClient,
  type PreprocessResult,
} from "@powerhousedao/reactor-attachments/client";
```

The React hooks in `@powerhousedao/reactor-browser` are built on the client.

For an architectural overview see [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor). For the full design — storage layout, eviction, transports, the hash-first/pending protocol, and the planned S3 backend — see the deep-dive docs `packages/reactor/docs/attachments.md` and `packages/reactor/docs/attachments-hash-first.md` in the monorepo.

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
import type { JwtHandler } from "@powerhousedao/reactor";

const attachments = createRemoteAttachmentService({
  remoteUrl: "https://switchboard.example.com",
  // Optional: provide a JWT handler if the switchboard requires auth.
  // jwtHandler,
  // Optional: inject a custom fetch (defaults to globalThis.fetch).
  // fetchFn,
});
```

`JwtHandler` is `(url: string) => Promise<string | undefined>`, defined in `@powerhousedao/reactor`.

:::tip
The switchboard remote service is the supported client implementation right now. Other transports (S3, peer-to-peer) are designed but not yet stable — prefer `createRemoteAttachmentService` until these docs call out a replacement.
:::

On the server side (inside a subgraph, processor, or trigger), an `IAttachmentClient` is already wired into the host context by `@powerhousedao/reactor-api` and is available as `context.attachments`. There is no need to construct one yourself — the server builds the service and wraps it with `createAttachmentClient(...)`; see `packages/reactor-api/src/server.ts` for the wiring.

The package root also exports the pieces for a local, embedded service: `AttachmentBuilder` (fluent), `KyselyAttachmentStore`, `KyselyReservationStore`, `runAttachmentMigrations`, `ATTACHMENT_SCHEMA`, `DEFAULT_RESERVATION_TTL_MS`, `DirectAttachmentUpload`/`DirectAttachmentUploadFactory`, and `NullAttachmentTransport`. These are on the root entrypoint only, not `/client`. Assemble one with `AttachmentBuilder` if you need an in-process store; the switchboard remote service remains the supported client today.

## The general flow

Every interaction with the package comes down to three operations: reserve a slot, send the bytes, then later read them back by ref.

There are two reservation modes. They are equivalent in capability — neither is preferred, so pick whichever fits the caller:

- **Upload-first** — reserve with just `{ mimeType, fileName }`. The content hash, and therefore the final ref, is only known _after_ `send()` completes. Simplest when you can stream the bytes straight through and do not need the ref until the upload finishes.
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
const upload = await attachments.reserve({
  mimeType,
  fileName: `${agent.id}-avatar`,
});
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

`get()` succeeds for any ref whose bytes are available. If the bytes were evicted from local storage, the service transparently re-fetches them through the transport. A hash-first ref can also be _pending_ — reserved, with state already referencing it, but the bytes not yet uploaded. During that window `get()` throws `AttachmentPending`, while `stat()` succeeds and returns a header with `status: "pending"`, the declared `sizeBytes`, and `expiresAtUtc` set to the reservation expiry.

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

await attachments.reserve(results.options, (handle) =>
  handle.send(results.stream()),
);
```

`client.reserve(options, send)` reserves the slot and hands the upload handle to your `send` callback. If an attachment with the same hash already exists it short-circuits and returns the existing ref without uploading. Pass `results.stream()` — which returns a fresh `ReadableStream` on each call — rather than the single-use `results.data` if the upload might be retried. `send()` accepts any `ReadableStream<Uint8Array>`, so on the server you can stream from the original source instead of the buffered copy.

Execute and reserve are awaited separately so each failure is handled on its own — a failed upload does not roll back the action, and a failed action does not strand an upload. If you do not need that separation, run them concurrently:

```typescript
await Promise.all([
  client.execute(documentId, "main", [
    attachInvoice({ scan: results.ref, vendorName: "Acme" }),
  ]),
  attachments.reserve(results.options, (handle) =>
    handle.send(results.stream()),
  ),
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

The integration surface between document models and the attachment system is a single GraphQL scalar: `AttachmentRef`. Declare attachment-bearing fields with it, and codegen will emit a branded TypeScript string (`` `attachment://v${number}:${string}` ``) plus a Zod validator that enforces the ref protocol.

```graphql
scalar AttachmentRef

input SetAgentImageInput {
  attachment: AttachmentRef!
}

type AgentInfo {
  attachment: AttachmentRef
}
```

The reducer stores the value verbatim — no special handling needed:

```typescript
setAgentImageOperation(state, action) {
  state.agent.attachment = action.input.attachment; // AttachmentRef
}
```

## API reference

### `IAttachmentService`

| Method              | Returns                       | Description                                                                                              |
| ------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `reserve(options)`  | `Promise<IAttachmentUpload>`  | Reserve a new attachment slot and return an upload handle.                                               |
| `stat(ref)`         | `Promise<AttachmentHeader>`   | Look up metadata for an existing ref. Throws `AttachmentNotFound` if the ref is unknown.                 |
| `get(ref, signal?)` | `Promise<AttachmentResponse>` | Retrieve the bytes. Re-fetches transparently if the data was evicted. Accepts an optional `AbortSignal`. |

### `IAttachmentUpload`

| Member          | Type                                                              | Description                                                                                                       |
| --------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `reservationId` | `string`                                                          | Unique identifier for this reservation.                                                                           |
| `ref`           | `AttachmentRef \| null`                                           | The ref this upload will produce. Set immediately in hash-first mode; `null` in upload-first until `send()` resolves. |
| `expiresAtUtc`  | `string`                                                          | ISO 8601 UTC reservation expiry (readonly). Use it to bound retry windows.                                        |
| `send(data)`    | `(ReadableStream<Uint8Array>) => Promise<AttachmentUploadResult>` | Stream the bytes through the handle. Returns `{ hash, ref, header }`. Dedup against existing hashes is automatic. |

### `IAttachmentClient`

| Method                    | Returns                           | Description                                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preprocess(file, opts?)` | `Promise<PreprocessResult>`       | Read and hash a `Blob` up front. Returns the ref, hash, declared size, hash-first reserve options, and the buffered bytes (as a single-use `data` stream and a re-readable `stream()` factory). `opts` may override `{ fileName, mimeType }`. |
| `reserve(options, send)`  | `Promise<AttachmentUploadResult>` | Reserve a hash-first slot and run `send(handle)`. Short-circuits to the existing ref if the hash is already stored (`AttachmentAlreadyExists` is handled internally).                                                                         |

### Key types

| Type                                  | Shape                                                                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AttachmentRef`                       | `` `attachment://v${number}:${string}` `` — opaque ref string used in document state.                                                                                                     |
| `ReserveAttachmentOptions`            | `UploadFirstReserveAttachmentOptions \| HashFirstReserveAttachmentOptions` — discriminated on `clientHash`.                                                                               |
| `UploadFirstReserveAttachmentOptions` | `{ mimeType: string; fileName: string; extension?: string \| null }` — no `clientHash`; ref known only after `send()`.                                                                    |
| `HashFirstReserveAttachmentOptions`   | `{ mimeType: string; fileName: string; extension?: string \| null; clientHash: AttachmentHash; sizeBytes: number }` — ref known at reserve time.                                          |
| `PreprocessResult`                    | `{ ref: AttachmentRef; hash: AttachmentHash; sizeBytes: number; options: HashFirstReserveAttachmentOptions; data: ReadableStream<Uint8Array>; stream: () => ReadableStream<Uint8Array> }` |
| `AttachmentUploadResult`              | `{ hash: AttachmentHash; ref: AttachmentRef; header: AttachmentHeader }`                                                                                                                  |
| `AttachmentStatus`                    | `"available" \| "evicted" \| "pending"` — `pending` is synthesized at query time from a live hash-first reservation; the bytes are not uploaded yet.                                       |
| `AttachmentHeader`                    | `{ hash; mimeType; fileName; sizeBytes; extension; status: AttachmentStatus; source; createdAtUtc; lastAccessedAtUtc; expiresAtUtc: string \| null }` — `expiresAtUtc` is `null` for committed attachments and carries the reservation expiry while `pending`. |
| `AttachmentResponse`                  | `{ header: AttachmentHeader; body: ReadableStream<Uint8Array> }`                                                                                                                          |

### Errors

| Class                     | When it is thrown                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AttachmentNotFound`      | `stat(ref)` or `get(ref)` called with a ref the store does not know.                                                                                      |
| `InvalidAttachmentRef`    | A string passed where a ref is expected does not match `attachment://v<N>:<hash>`.                                                                        |
| `UploadTooLarge`          | `upload.send()` exceeded the server's configured byte cap. Maps to HTTP 413.                                                                              |
| `ReservationNotFound`     | `upload.send()` after the reservation expired or was deleted.                                                                                             |
| `AttachmentAlreadyExists` | Hash-first `reserve()` for content whose hash is already stored. The client's `reserve()` catches this and returns the existing ref instead of uploading. |
| `AttachmentPending`       | `get(ref)` for a hash that is reserved but whose bytes have not finished uploading. Carries `readonly hash`, `readonly expiresAtUtc: string`, and `readonly metadata?: { mimeType; fileName; sizeBytes }` so the caller can show the declared size and retry timing. Intentionally not a subclass of `AttachmentNotFound` — pending is "retry later", not "unknown". |
| `HashMismatch`            | Hash-first `send()` whose uploaded bytes do not match the claimed `clientHash`.                                                                           |
| `SizeMismatch`            | Hash-first `send()` whose actual byte count differs from the declared `sizeBytes`.                                                                        |

### Helpers

`parseRef(ref)` and `createRef(hash, version?)` are exported from the package, but refs should be treated as opaque outside the service itself. Reach for them only if you genuinely need to inspect or reconstruct a ref (for example, in tests or debugging tooling).

## Storage backends and direct transfer

Attachment bytes are stored through a pluggable, provider-neutral backend (`IAttachmentBackend`): the filesystem backend keeps the existing proxy-through-Switchboard behavior, and the S3-compatible backend transfers bytes directly between the client and object storage using short-lived presigned URLs. Switchboard always remains the control plane — authentication, authorization, metadata, reservations, and presigning — while in S3 mode object storage becomes the byte plane. Document models are unaffected either way: they store only opaque `AttachmentRef` values and never see storage configuration, credentials, or transfer mechanics.

### Selecting a backend

Filesystem is the default and requires no configuration. S3 is enabled per Switchboard environment exclusively through environment variables:

| Variable | Required | Meaning |
| --- | --- | --- |
| `PH_ATTACHMENT_STORAGE` | — | `s3` enables S3; absent or `filesystem` keeps current behavior. |
| `PH_ATTACHMENT_S3_ENDPOINT` | in S3 mode | HTTPS endpoint of the S3-compatible provider. |
| `PH_ATTACHMENT_S3_REGION` | in S3 mode | Provider region. |
| `PH_ATTACHMENT_S3_BUCKET` | in S3 mode | Private bucket name. |
| `PH_ATTACHMENT_S3_ACCESS_KEY_ID` / `PH_ATTACHMENT_S3_SECRET_ACCESS_KEY` | in S3 mode | Permanent credentials; available only to Switchboard, never to clients. |
| `S3_ATTACHMENT_PREFIX` | no | Object key prefix, default `attachments`. |
| `PH_ATTACHMENT_S3_FORCE_PATH_STYLE` | no | `true` for path-style addressing, default `false`. |
| `PH_ATTACHMENT_S3_UPLOAD_TTL_SECONDS` / `PH_ATTACHMENT_S3_DOWNLOAD_TTL_SECONDS` | no | Presigned URL lifetimes, defaults 900 / 300 seconds. |

An incomplete or invalid S3 configuration fails startup loudly; S3 mode never falls back to filesystem silently. Object keys are `<prefix>/<first2>/<next2>/<sha256>` — the same content addressing as the filesystem layout.

### Direct S3 upload

The client hashes the file locally (the existing hash-first flow) and reserves through the same `POST /attachments/reservations` route. In S3 mode the reservation response carries a `presigned-put` upload target whose signed headers include the Base64 SHA-256 checksum (`x-amz-checksum-sha256`) and content type; the client PUTs the bytes directly to the provider with exactly those headers — never with a Switchboard JWT — and S3 itself rejects bytes that do not match the signed checksum. There is no finalize endpoint, no post-upload verification request, no temporary object, no CopyObject promotion, and no multipart path. A PUT 2xx (or a confirmed dedup, where the reservation short-circuits to the existing ref) is the signal after which the application may dispatch the `AttachmentRef` into a document operation. Because metadata becomes `available` optimistically at reserve time, an abandoned upload URL can leave metadata pointing at a missing object; a later reservation detects the missing object and issues a fresh target, and a direct GET of a missing object surfaces as `AttachmentNotFound`.

### Document-authorized download

Knowing a hash or ref is not download authority. Downloads are authorized per document through one new route:

```
GET /attachments/:hash/download-target?documentId=<id-or-slug>
```

It returns a validated, non-cacheable (`Cache-Control: no-store`) download target — `switchboard` (the existing authenticated byte route) for filesystem, or a short-lived `presigned-get` for S3. The decision requires both of the following, in order, before any metadata or presigner access:

1. The verified caller can read the document (`IAuthorizationService.canRead` — the canonical service that already handles admins, owners, unprotected documents, READ/WRITE/ADMIN and inherited grants; attachment code does not reimplement these rules).
2. The document has historically referenced the attachment, per the reference index below.

The caller identity comes exclusively from verified bearer authentication; identity headers or query parameters are ignored. An unreadable document and an absent relationship both return the same `404 { "error": "Attachment not found" }`. The legacy `GET /attachments/:hash` byte route is unchanged in this phase; restricting it for ordinary clients in S3 mode is deferred hardening. There is no attachment policy package, plugin mechanism, ACL, or owner table — authorization is canonical document permission plus the indexed relationship, nothing else.

### The attachment reference index

`AttachmentReferenceReadModel` is a global read model (standard `BaseReadModel`, registered once through `ReactorBuilder.withReadModelFactory`) that observes successful document operations and maintains an append-only `documentId ↔ AttachmentRef` relationship. Discovery is schema-aware: values are extracted only from fields whose operation schema declares `AttachmentRef` — including nested inputs, lists, and nullable fields — so untyped string lookalikes never create authorization evidence. Extraction plans are compiled lazily per concrete document-model module and action, cached by module identity, and reused on the hot path; operations without attachment fields take a fast path with no database writes. The read model consults the live document-model registry at operation time, so packages installed after Switchboard startup are indexed without a restart (interpretation uses the latest registered schema for the type). Removing a ref from current document state does not erase the historical relationship: a user who can read the document history can still resolve attachments it referenced.

The index persists in its own `attachment_reference_read_model` SQL schema with its own migrations and store (built by `AttachmentReferenceIndexBuilder`), sharing the physical database but leaving the original `attachments` schema, its migrations, and `AttachmentBuilder` untouched. Cursor recovery for failed batches is attachment-specific and scoped to this read model; generic `BaseReadModel` behavior is unchanged. In compositions where the projection cannot be hosted (an unusual caller-provided Reactor with a custom coordinator), Switchboard still starts with all existing routes and only the download-target route fails closed with a 503.

### Client and hook additions

`IAttachmentService.get` accepts an options form carrying the authorization anchor: `get(ref, { documentId, signal })`. Remote downloads negotiate the download target with the Switchboard JWT, then execute it — `switchboard` targets keep the authenticated byte semantics, `presigned-get` targets receive exactly the returned headers and never the JWT. `IAttachmentClient` adds `upload(input)`, document-aware `download({ documentId, ref })`, and bounded-concurrency `uploadMany` / `downloadMany` batch operations built on a reusable `runWithConcurrency` runner: concurrency bounds hashing and transfer together, results preserve input order, successes survive sibling failures, per-item signals cancel one item, and a batch signal stops unstarted work. Stage callbacks report `hashing`, `reserving`, `uploading`, `requesting-download-target`, `downloading`, `done`, and `error`; remote transfer failures throw `AttachmentTransferError` with a `stage` and no URL, signature, or credential detail. `useAttachments()` in `@powerhousedao/reactor-browser` returns this extended client; `useAttachmentUpload()` is unchanged and remains supported.

## Migrating from inline `data` fields

If a document model previously inlined binary content, the migration is small and mechanical:

- **Schema** — replace `data: String` (or composite fields like `{ image, imageMediaType, imageUrl }`) with a single `attachment: AttachmentRef` field on the input and the state type.
- **Write path** — replace the base64-encoding step with a reservation and upload. Either reserve on the service directly (`attachments.reserve({ mimeType, fileName })` then `upload.send(stream)`, dispatching with `result.ref`), or use the client (`attachments.preprocess(file)` then `client.execute(...)` with `results.ref` and `attachments.reserve(results.options, ...)`). In the browser, `useAttachmentUpload()` wraps the client flow.
- **Read path** — replace data-URI assembly with `attachments.get(ref)`. In a browser, drain the stream into a `Blob` and use `URL.createObjectURL` (remember to `revokeObjectURL` on cleanup).
- **Graceful degradation** — code paths that may run without an attachment service (mock environments, tests, off-line previews) should branch on `if (!attachments)`. Writers should surface a clear error to the user; readers should skip the attachment and render a placeholder.

## Deep dive

See `packages/reactor/docs/attachments.md` in the monorepo for the full design: storage internals, the LRU eviction policy, the `IAttachmentStore` and `IAttachmentTransport` interfaces, the switchboard upload protocol, and the S3 backend. For the hash-first reservation mode, hash/size verification on ingest, and the pending-upload lifecycle, see `packages/reactor/docs/attachments-hash-first.md`.
