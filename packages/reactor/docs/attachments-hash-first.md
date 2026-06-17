# Hash-First Attachment Refs

## Summary

This document extends [attachments.md](./attachments.md). It does not replace it -- the interfaces, lifecycle, storage, and transport designs described there remain in force except where amended below.

The current upload flow forces a strict ordering: reserve, upload all bytes, receive the `AttachmentRef`, and only then submit the domain action that uses the ref. Because the ref _is_ the content hash (`attachment://v1:<sha256>`), and the hash is computed server-side at the end of the upload stream, the user cannot submit an action until a potentially lengthy upload completes.

The fix is to recognize that the hash does not require the upload -- it requires one local pass over the bytes. The client computes the SHA-256 itself, constructs the ref immediately, submits the action right away, and uploads concurrently or in the background. The server verifies the claimed hash on ingest and rejects mismatches.

Nothing about the ref format, the `Attachment` scalar, codegen, the reducer contract, the operation store, or operation sync changes. The only things that change are _who computes the hash_, _when the ref becomes known_, and _how the system represents an attachment whose bytes have been promised but not yet delivered_.

Three design commitments anchor this extension:

1. **`reserve()` rejects a hash it can already serve.** Dedup moves from after-upload to before-reservation. A client claiming a hash whose data is available is told so immediately, with the canonical ref, and uploads nothing.
2. **`upload.send()` rejects on hash mismatch.** If the server-computed hash of the uploaded bytes does not equal the reservation's claimed hash, the upload fails, nothing is committed, and the reservation is retained for retry.
3. **Pending is a transport-visible state.** A hash that is reserved-but-not-yet-uploaded is queryable as `pending` -- locally via `stat()`, and across reactors through `IAttachmentTransport` -- so peers that receive an action referencing an in-flight upload can distinguish "coming, retry later" from "unknown, possibly never".

## Why this design

The investigation that produced this design evaluated four approaches: client-side hashing (this document), a dual-nature scalar carrying a reservation id that later resolves to a hash, provisional refs with a second-phase link step, and pure client-side orchestration (defer dispatch until upload completes).

Client-side hashing won decisively because the ref in document state is bit-identical to a server-issued ref:

- **Content-addressing and dedup are preserved end-to-end.** Two clients attaching the same file independently produce the same ref string in document state. Reservation-keyed or provisional refs permanently break ref equality for identical content.
- **No resolution layer.** Reservation-keyed refs would turn the transient reservation table into permanent, must-sync, must-never-lose mapping infrastructure, because operations are immutable and the refs inside them would depend on that table forever.
- **No new actions, no reducer changes, no codegen changes.** Link-step designs require a new base action through `DocumentActionSchema`, add one operation per upload to the document log, and strand the document in a provisional state if the link is lost.
- **The action is durable immediately.** Deferring dispatch until upload completion (a pure client-side queue) improves perceived latency but fails the actual requirement: collaborators, sync peers, and server-side processors see nothing until the upload finishes.

Two facts about the existing implementation make client-side hashing nearly free:

- The browser upload path already buffers the entire file: `RemoteAttachmentUpload.send()` collects the stream into a Blob before the PUT, because streaming request bodies are not universally supported in browsers. Hashing that buffer is a single `crypto.subtle.digest("SHA-256", ...)` call over memory the client is already paying for. `crypto.subtle` is already a dependency of this codebase (operation signing, header hashing). This buffering is strictly a browser-client limitation -- the switchboard ingest path is and remains fully streaming (see Hash verification on ingest).
- The architecture already tolerates refs without local data ("lazy data availability", design principle 4 in attachments.md). The reactor core, read models, and sync treat refs as opaque strings. What is new is tolerating a ref before _any_ reactor has the data -- a difference in degree, not in kind.

Node and CLI clients hash with `crypto.createHash("sha256")` over a first streaming pass (files on disk are re-readable). Callers with true one-shot streams that cannot be hashed up front simply omit the client hash and get the existing upload-first flow -- both modes coexist on the same interfaces.

## The flow

```ts
// 1. Hash locally -- one pass over bytes, no network.
const hash = await sha256Hex(file);
const ref = createRef(hash); // attachment://v1:<hash>

// 2. Reserve with the claimed hash. Rejects if the content is already known.
let upload: IAttachmentUpload | null = null;
try {
  upload = await attachmentService.reserve({
    mimeType: "application/pdf",
    fileName: "invoice",
    extension: "pdf",
    clientHash: hash,
    sizeBytes: file.size,
  });
} catch (err) {
  if (err instanceof AttachmentAlreadyExists) {
    // Content is already on the server. Use err.ref; upload nothing.
  } else {
    throw err;
  }
}

// 3. Submit the action immediately -- the ref is already known.
//    Upload concurrently (or in the background).
await Promise.all([
  reactor.execute(docId, "main", [
    {
      type: "ATTACH_INVOICE",
      input: { scan: ref, vendorName: "Acme" },
      scope: "global",
    },
  ]),
  upload ? upload.send(file.stream()) : Promise.resolve(),
]);
```

The action is durable, indexed, and syncing to peers while the bytes are still in flight. If the upload fails, the client retries through the same reservation; if it is abandoned, the ref dangles -- a state the architecture already tolerates (see Failure modes).

## Interface changes

### ReserveAttachmentOptions

```ts
type ReserveAttachmentOptions = {
  mimeType: string;
  fileName: string;
  extension?: string | null;

  /**
   * Content hash claimed by the client (lowercase SHA-256 hex).
   * When present, the service operates in hash-first mode: the ref is
   * known at reservation time, reserve() rejects if the content is
   * already available, and send() verifies the uploaded bytes against
   * this claim. When absent, the legacy upload-first flow applies.
   */
  clientHash?: AttachmentHash;

  /**
   * Declared size in bytes. Required when clientHash is present.
   * Reported by stat() during the pending window and enforced on
   * ingest: an upload whose actual byte count differs is rejected.
   */
  sizeBytes?: number;
};
```

### IAttachmentService.reserve

```ts
interface IAttachmentService {
  /**
   * Reserve a new attachment slot and return an upload handle.
   *
   * When options.clientHash is provided:
   * - @throws AttachmentAlreadyExists if data for that hash is available.
   *   The error carries the canonical ref; the caller uses it directly
   *   and uploads nothing. This is the dedup fast path -- duplicate
   *   content never leaves the client.
   * - If the hash is known but evicted, the reservation is created:
   *   the client holds the only guaranteed copy of the bytes, and the
   *   upload restores them (see Dedup and eviction below).
   * - The returned handle's `ref` field is set immediately.
   */
  reserve(options: ReserveAttachmentOptions): Promise<IAttachmentUpload>;

  // stat() and get() unchanged in signature; see Pending status for
  // behavior changes.
}
```

### IAttachmentUpload

```ts
interface IAttachmentUpload {
  reservationId: string;

  /**
   * The ref this upload will produce. Set immediately when the
   * reservation carries a client hash; null in the legacy flow,
   * where the ref is only known after send() completes.
   */
  ref: AttachmentRef | null;

  /**
   * Reservation TTL contract, from the server in remote mode.
   * ISO 8601 UTC string indicating when the reservation expires.
   * Clients use this to bound retry windows and populate the pending-upload queue.
   */
  readonly expiresAtUtc: string;

  /**
   * Stream attachment data through this handle.
   *
   * When the reservation carries a client hash, the handle verifies
   * the received bytes against the claims:
   * - @throws SizeMismatch if the byte count differs from the declared
   *   sizeBytes. The handle may reject mid-stream as soon as the count
   *   exceeds the declaration, without consuming the rest.
   * - @throws HashMismatch if the server-computed hash differs from
   *   the claimed hash. Nothing is committed (the bytes are NOT stored
   *   under the actual hash -- the in-flight action references the
   *   claimed hash, and committing under the actual hash would create
   *   an orphan that masks the client bug).
   * In both cases the temp data is discarded and the reservation is
   * retained so the client can retry with the correct bytes.
   */
  send(data: ReadableStream<Uint8Array>): Promise<AttachmentUploadResult>;
}
```

### Errors

```ts
/** reserve() rejection: content for the claimed hash is already available. */
class AttachmentAlreadyExists extends Error {
  readonly hash: AttachmentHash;
  readonly ref: AttachmentRef;
}

/** send() rejection: uploaded bytes do not hash to the claimed value. */
class HashMismatch extends Error {
  readonly claimed: AttachmentHash;
  readonly actual: AttachmentHash;
}

/** send() rejection: uploaded byte count does not equal the declared sizeBytes. */
class SizeMismatch extends Error {
  readonly declared: number;
  readonly actual: number;
}

/**
 * get() rejection: the hash is reserved by an in-flight upload; bytes
 * are not yet available. Deliberately NOT a subclass of
 * AttachmentNotFound -- callers must be able to distinguish "retry
 * later" from "unknown".
 */
class AttachmentPending extends Error {
  readonly hash: AttachmentHash;
  /** When the pending window closes; after this, the hash reads as not found. */
  readonly expiresAtUtc: string;
}
```

### AttachmentStatus

```ts
type AttachmentStatus = "available" | "evicted" | "pending";
```

`pending` is a _virtual_ status. It never appears in the `attachment` table (whose primary key is the hash and whose rows mean "bytes are or were stored"). It is synthesized at query time from live, hash-bearing reservations -- see Storage below.

## Reservation semantics

### reserve() with a known hash

`reserve({ clientHash })` checks the attachment store before creating a reservation:

| Store state for the hash                                    | reserve() outcome                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row exists, `status = 'available'`                          | **Rejects** with `AttachmentAlreadyExists` carrying the canonical ref. The client uses the ref directly. Zero bytes are transmitted -- today's flow uploads everything before dedup is even detectable.                                                                                                    |
| Row exists, `status = 'evicted'`                            | **Succeeds.** Metadata is known but the bytes are gone from this reactor. The client holds the bytes; the upload restores them through the existing evicted-restore commit path. Rejecting here would discard the only guaranteed copy and leave restoration dependent on some peer still having the data. |
| No row, live reservation with the same `client_hash` exists | **Succeeds.** Concurrent reservations for the same hash are deliberately permitted -- see below.                                                                                                                                                                                                           |
| No row, no live reservation                                 | **Succeeds.** Normal case.                                                                                                                                                                                                                                                                                 |

The evicted case is a deliberate refinement of "reject if the hash is already known": the rejection criterion is _can this reactor currently serve the bytes_, not _has it ever seen the hash_. An evicted hash is known but not servable, and the reserving client is, at that moment, the most reliable source of the bytes.

### Concurrent reservations for the same hash

Multiple live reservations may claim the same `client_hash`. This is intentional:

- **No uniqueness race.** Enforcing one-live-reservation-per-hash requires either a partial unique index (which is known-broken under the `withSchema("attachments")` migration setup -- see the comment in migration 001) or application-level locking, and creates a rejected-reserver problem: what does the second client do while the first uploads?
- **No reservation squatting.** If a second reserve were rejected in favor of an existing reservation, a client could reserve a hash it never intends to upload and block that content for the reservation TTL (24h). Independent reservations make squatting harmless: anyone with the bytes can upload them.
- **Commit-time convergence already exists.** Whichever upload finishes first inserts the attachment row (`INSERT ... ON CONFLICT (hash) DO NOTHING`). A later `send()` for the same hash lands in the existing dedup path and returns the existing record. Each `send()` soft-deletes only its own reservation; stragglers age out via the TTL.

The cost is a bounded amount of duplicate upload bandwidth in the rare concurrent case -- strictly no worse than today, where _every_ duplicate upload transmits all bytes.

### Hash verification on ingest

**Ingest hashing on the switchboard is streaming, never buffered.** The upload endpoint pipes the request body through the hasher and to the temp file chunk by chunk:

```ts
const hasher = crypto.createHash("sha256");
for await (const chunk of body) {
  hasher.update(chunk);
  // ...written to the temp file in the same pass
}
const actual = hasher.digest("hex");
```

This is a normative requirement of the design, not an implementation detail: server memory per upload is O(chunk), independent of file size, preserving the stream-large-files property that motivated the attachment system in the first place. It is also how `streamHashAndWrite` already works today -- the request stream from `makeUploadHandler` (`Readable.toWeb(req)`) is fed through `crypto.createHash("sha256")` via `hash.update(chunk)` while being written to disk, with `hash.digest("hex")` at stream end. At no point may the upload body be collected into memory (no `Buffer.concat`, no Blob) on the server.

In hash-first mode, the upload handle verifies both claims against the streamed bytes before committing:

1. **Size, during the stream.** The handle counts bytes as chunks arrive. The moment the count exceeds the declared `sizeBytes`, it aborts without consuming the rest of the stream, deletes the temp file, retains the reservation, and throws `SizeMismatch`. If the stream ends short of the declaration, same outcome at stream end.
2. **Hash, at stream end.** The streamed digest is compared to the reservation's `client_hash`. On mismatch: delete the temp file, retain the reservation, throw `HashMismatch`.
3. **Both match:** commit exactly as today (insert row or dedup/restore), soft-delete the reservation, return the result.

The size check is checked first because it can fail early (mid-stream), but the hash check is the integrity guarantee -- the size check exists so that the declared `sizeBytes` is a contract, not a hint: no upload can complete without honoring it. Verification therefore adds only a byte counter and a string comparison to the existing streaming pass -- no second read, no buffering.

Because verification happens on ingest, the content-addressed store can never serve wrong bytes for a hash, regardless of what a client claims. A false claim produces, at worst, a dangling ref -- see Trust model.

## Pending status

### Storage

The `attachment_reservation` table gains two columns:

```sql
ALTER TABLE attachment_reservation ADD COLUMN client_hash TEXT;
ALTER TABLE attachment_reservation ADD COLUMN size_bytes BIGINT;

-- Non-unique. Partial unique indexes are not used here: raw SQL index
-- predicates do not respect withSchema() (see migration 001), and
-- uniqueness is deliberately not a requirement (see Concurrent
-- reservations above).
CREATE INDEX idx_reservation_client_hash
  ON attachment_reservation (client_hash);
```

The `attachment` table is untouched. No ghost rows exist before bytes are committed; the hash primary key invariant is preserved.

### stat()

`KyselyAttachmentStore.stat(hash)` gains a second lookup. If no `attachment` row exists, it checks for a live, unexpired, hash-bearing reservation:

```sql
SELECT r.client_hash, r.mime_type, r.file_name, r.extension,
       r.size_bytes, r.created_at_utc, r.expires_at_utc
FROM attachment_reservation r
LEFT JOIN attachment a ON a.hash = r.client_hash
WHERE r.client_hash = $hash
  AND r.deleted_at_utc IS NULL
  AND r.expires_at_utc > $now        -- pending is time-bounded in the query
  AND a.hash IS NULL                 -- not yet committed
```

If a row matches, `stat()` returns an `AttachmentHeader` with `status: 'pending'` and the client-declared `sizeBytes`. Otherwise it throws `AttachmentNotFound` as today.

The `expires_at_utc > now` predicate is load-bearing: **pending self-expires in the query**. Liveness does not depend on the reservation sweep actually running. A hash whose upload was abandoned reads as `pending` until the reservation TTL elapses and then honestly reads as not found, even if no sweep ever deletes the row. The sweep (`deleteExpired()`) remains necessary for storage hygiene, but it is no longer a correctness dependency.

The declared `sizeBytes` in a pending header is enforced on ingest -- no upload can complete with a different byte count (see Hash verification on ingest). During the pending window it is still a claim, but a claim the upload must honor, so consumers may rely on it for file-size labels and progress states. It is excluded from storage accounting by construction (`storageUsed()` sums the `attachment` table, which has no pending rows).

### get()

`KyselyAttachmentStore.get(hash)`:

1. `attachment` row exists: unchanged (serve, or restore-from-transport if evicted).
2. No row, pending reservation matches: throw `AttachmentPending` with the reservation's expiry. The bytes have not arrived _anywhere_; there is nothing to fetch.
3. No row, no pending reservation: fetch via transport as today. The transport may itself report pending (see next section), which surfaces as `AttachmentPending` with the remote's expiry.

There is no store-level wait option. `get()` always throws `AttachmentPending` immediately; polling across the pending window is the caller's loop, bounded by the error's `expiresAtUtc`. A wait inside the store would hold server request handlers open across multi-second windows and hide retry policy where callers cannot tune it.

## Syncing pending state through the transport

Pending state is part of the attachment transport's contract, not just a local store concern. When reactor B receives a synced operation whose input references hash `H`, and B fetches the data while the source client is still uploading, B must be able to distinguish three answers, not two:

| Answer      | Meaning                                                             | Correct peer behavior                                                    |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| data        | Bytes available                                                     | Store via `put()`, serve                                                 |
| **pending** | An upload for this hash is in flight at the source; expiry attached | Bounded retry with backoff until `expiresAtUtc`, then treat as not found |
| not found   | No data, no in-flight upload                                        | Long backoff or give up; the ref may be permanently dangling             |

The current `fetch(): Promise<TransportResponse | null>` conflates the last two. The interface changes to make the three-way result explicit:

```ts
type TransportFetchResult =
  | { kind: "data"; response: TransportResponse }
  | {
      kind: "pending";
      hash: AttachmentHash;
      expiresAtUtc: string;
      retryAfterMs: number;
    }
  | { kind: "not-found" };

interface IAttachmentTransport {
  fetch(
    hash: AttachmentHash,
    signal?: AbortSignal,
  ): Promise<TransportFetchResult>;
  // announce/push unchanged; see Future topologies.
}
```

### What syncs and what does not

Reservation rows themselves are **not replicated**. A reservation is node-local, single-writer state owned by the upload target, with a TTL. Replicating it would create distributed-expiry consistency problems for no benefit. Instead, pending is a _queryable_ state: peers learn it on demand through the transport's fetch/stat path, exactly as they learn data availability. The authoritative answer always comes from the reactor holding the reservation.

**Cross-reactor stat limitation.** `stat()` and `HEAD /attachments/:hash` are authoritative only on the reservation-holding reactor. A peer reactor's local `stat()` reports not-found for a hash that is pending remotely -- pending is discovered on the data path (`get()` / transport fetch), not via a peer's stat. This is a deliberate consequence of reservations being node-local, single-writer state: a peer must perform a transport fetch (which surfaces the 202 pending response from the source reactor) to learn that a hash is in flight. The local `stat()` shortcut, which queries only the local attachment and reservation tables, cannot cross this boundary.

In the current client-server topology this works without extra hops: clients reserve and upload against the switchboard, so the switchboard -- the same node every peer fetches from -- is authoritative for pending. A peer's lazy fetch hits the switchboard and receives `pending` directly.

In a local-first topology (a reactor reserving against its own direct store, syncing operations outward before pushing bytes), remote peers querying _their_ configured transport see `not-found` until the source pushes or announces the data. That matches the existing lazy-data-availability principle: a ref may precede data availability, and the UI treats unfetchable refs gracefully. An eager `announce`-style pending hint (broadcasting "hash H is pending at me until T") is deliberately deferred -- see Future topologies.

### HTTP mapping (switchboard)

All attachment endpoints below sit behind upload-equivalent authorization -- see the dedup oracle entry in Trust model.

| Endpoint                                            | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /attachments/reservations`                    | Accepts optional `clientHash` (validated against `/^[a-f0-9]{64}$/`, normalized to lowercase) and `sizeBytes` (required with `clientHash`). Returns `201 { reservationId, ref, expiresAtUtc }`. Returns **`409 Conflict { error: "already_exists", ref }`** when the hash is available -- the dedup rejection. The body carries the canonical ref only; it never exposes another client's `reservationId` (that would let one principal complete or poison another's in-flight upload).           |
| `PUT /attachments/reservations/:reservationId`      | The handler pipes the request stream directly through `hash.update(chunk)` and to disk -- the body is never buffered in server memory (see Hash verification on ingest). On size mismatch returns **`422 Unprocessable Entity { error: "size_mismatch", declared, actual }`** (the handler may abort mid-stream once the count exceeds the declaration); on hash mismatch returns **`422 Unprocessable Entity { error: "hash_mismatch", claimed, actual }`**. Reservation retained in both cases. |
| `GET /attachments/:hash`, `HEAD /attachments/:hash` | When the hash is pending: **`202 Accepted`** with `Retry-After: <seconds>` and an `Attachment-Pending` header carrying `{ expiresAtUtc, mimeType, fileName, sizeBytes }`. Empty body. The normal `Attachment-Metadata`/`Content-Length` headers of the 200 path are not sent, so no consumer can mistake a pending response for a zero-byte attachment.                                                                                                                                           |

Client-side mappings:

- `RemoteReservationStore.create()` maps 409 to `AttachmentAlreadyExists`. (Today it throws a generic error on any non-2xx; this becomes a typed mapping.)
- `RemoteAttachmentUpload.send()` maps 422 to `HashMismatch` or `SizeMismatch` by the error body's discriminant.
- `RemoteAttachmentStore.stat()` maps 202 to a `pending` header; `RemoteAttachmentStore.get()` maps 202 to `AttachmentPending`. **These branches are mandatory.** Without them, a 202 falls through the existing `response.ok` check and is parsed as a successful zero-length response -- which a receiving store would then persist as a real zero-byte attachment under a hash that has actual content. That is permanent data corruption; tests must pin the 202 path on every transport client.
- `SwitchboardAttachmentTransport.fetch()` maps 202 to `{ kind: "pending", ... }`.

### Future topologies

`announce()` today is a no-op for the switchboard transport (data is already on the server after upload). When peer-to-peer transports arrive, `announce(hash)` on commit slots in as already specified in attachments.md. In this design, pending propagates pull-only -- peers learn it through fetch/stat. Whether an eager pending announcement mechanism is ever warranted is a question for the p2p transport work, not for this design; nothing here precludes one.

## Trust model

Today, every ref in document state is server-attested: the server computed the hash. Under hash-first, refs become **client-claimed, server-verified**:

- The _store_ is exactly as trustworthy as before. Ingest verification means no sequence of client actions can cause wrong bytes to be served for a hash.
- The _ref in document state_ is a claim until the upload commits. A client that lies (or has a bug) produces a ref whose upload is rejected by `HashMismatch` -- leaving a dangling ref, which is precisely the state produced by an abandoned upload, and which the architecture already tolerates.
- **Dedup oracle -- closed by default.** `reserve()` rejection (and `stat()` on an arbitrary hash) reveals whether given content exists on the server. This oracle already exists today -- any client can `stat()` any hash -- and hash-first makes probing cheaper and more natural. Therefore every endpoint that reveals hash existence (`POST /attachments/reservations`, `GET`/`HEAD /attachments/:hash`) **requires upload-equivalent authorization by default**: probing for content is treated as privileged as adding content. The switchboard mounts all attachment routes behind the same authorization gate as the upload endpoint, and transports carry those credentials on fetch (as the transport design in attachments.md already assumes via `authHeaders()`). The 409 body's metadata surface stays minimal by design (ref only -- no file name, no size).
- The 409 rejection must never include an existing `reservationId`. Reservation ids are upload capabilities; leaking one across principals lets an attacker complete or poison someone else's in-flight upload.

## Failure modes

| Scenario                                                                       | Behavior                                                                                                                                                               | Mitigation                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload abandoned after action submitted                                        | Hash reads `pending` until the reservation expires, then `AttachmentNotFound`. The ref dangles in document state -- the already-tolerated lazy-availability state.     | Client retries by re-reserving the same hash (allowed: no attachment row exists). UI renders the pending/broken state from `stat()`.                                                                              |
| Hash or size mismatch on ingest                                                | `send()` throws `HashMismatch` or `SizeMismatch` (size can fail mid-stream); nothing committed; reservation retained. The ref dangles unless a correct upload follows. | Client retries with correct bytes through the same reservation. Monitoring should count mismatches; they indicate client bugs or tampering.                                                                       |
| Peer fetches during pending window                                             | Transport returns `pending` with expiry; peer backs off and retries until expiry.                                                                                      | Bounded by `expiresAtUtc` -- no infinite polling. After expiry the peer treats the hash as not found.                                                                                                             |
| Concurrent reservations, same hash                                             | Both upload in the worst case; first commit wins, second `send()` dedups against the committed row. Straggler reservations expire via TTL.                             | None needed. Bandwidth cost is bounded and no worse than today's upload-then-dedup.                                                                                                                               |
| Reservation expires mid-upload                                                 | `send()` completing after expiry finds the reservation soft-deleted or expired.                                                                                        | The upload handle treats an expired reservation as `ReservationNotFound`; the client re-reserves (same hash -- if some other upload completed it meanwhile, reserve rejects with the ref and the client is done). |
| `reserve()` rejects (available), data evicted before client ever calls `get()` | Standard eviction semantics: `get()` restores via transport.                                                                                                           | Deployments without a functioning transport (e.g. `NullAttachmentTransport`) must not enable eviction at all -- this constraint predates hash-first.                                                              |
| Client crashes / tab closes mid-upload                                         | Action is already durable server-side; only the upload is lost.                                                                                                        | The pending-upload queue (below) re-drives the upload on next visit; otherwise the ref dangles until a retry or the reservation expires.                                                                          |

## Client integration: pending upload queue

A small helper in `reactor-browser` makes background uploads survivable:

- On `reserve()`, persist `{ reservationId, hash, ref, expiresAtUtc }` plus the file bytes (or a `FileSystemHandle` where available) to IndexedDB.
- On `send()` success or terminal failure (`HashMismatch`, expiry), remove the record.
- On app start, re-drive any persisted uploads whose reservations have not expired: verify the stored bytes still hash to the recorded value, then `send()` through a fresh reservation if the original expired.

Because the _action_ is already durable in the event log, IndexedDB protects only the upload bytes -- the cheap half of durability. The queue should hash and upload the same `Blob` reference rather than reading the file twice, and may use a chunked WASM hasher (e.g. `hash-wasm`) for files large enough that `blob.arrayBuffer()` is undesirable on memory-constrained devices; `crypto.subtle.digest` suffices for the common case.

## What does not change

- `AttachmentRef` format, `parseRef`, `createRef`, and the version-prefix scheme.
- The `Attachment` scalar, codegen, and the document-model author experience.
- The reactor core: executor, queue, read models, processors, and operation sync continue to treat refs as opaque strings inside `action.input`.
- The streaming ingest path on the switchboard: uploads are hashed chunk-wise (`crypto.createHash` / `hash.update` / `hash.digest`) while being written to disk, with O(chunk) server memory per upload regardless of file size.
- The `attachment` table schema and the commit paths (`INSERT ... ON CONFLICT`, evicted-restore, sync `put()`).
- The legacy upload-first flow: omitting `clientHash` preserves today's behavior exactly, including for callers with one-shot streams that cannot be hashed up front.

## Prerequisites and adjacent fixes

These are required or strongly advised alongside this work; the first predates it:

1. **Wire the reservation sweep.** `IReservationStore.deleteExpired()` currently has no production caller -- no cron or interval exists in switchboard or reactor-api, despite documentation claiming a periodic sweep. With time-bounded pending this is hygiene rather than correctness, but expired hash-bearing reservation rows still accumulate. `AttachmentBuilder` should accept a sweep interval and own the timer, with a `destroy()` to clear it.
2. **Return `expiresAtUtc` from `POST /attachments/reservations`.** Today the response carries only `{ reservationId }` and the remote client synthesizes the TTL from its own clock. Hash-first clients need the authoritative expiry to bound retry windows and to populate the pending-upload queue.
3. **Pin the 202 path with tests on every transport client** (`RemoteAttachmentStore`, `SwitchboardAttachmentTransport`). The silent zero-byte-corruption failure described above is the single most dangerous regression this design can introduce.
4. (Unrelated but adjacent) `SwitchboardAttachmentTransport.push()` targets `PUT /attachments/:hash`, which has no registered route; and attachments.md describes reservation deletion as a hard delete while the implementation soft-deletes. Both should be reconciled when touching this code.

## Rollout

1. **Service and store** (`reactor-attachments`): `ReserveAttachmentOptions.clientHash/sizeBytes`, `IAttachmentUpload.ref`, reservation columns migration, `AttachmentAlreadyExists`/`HashMismatch`/`AttachmentPending`, pending `stat()`/`get()` in `KyselyAttachmentStore`, ingest verification in `DirectAttachmentUpload`, `TransportFetchResult`.
2. **HTTP surface** (switchboard routes + remote clients): 409/422/202 mappings, `expiresAtUtc` in the reserve response, sweep wiring.
3. **Client helper** (`reactor-browser`): hashing utility, pending upload queue, first UI integration.

There is no migration burden on existing consumers: the attachment service currently has no client-side integration in Connect or reactor-browser, and the legacy reserve/upload contract is preserved bit-for-bit when `clientHash` is omitted.
