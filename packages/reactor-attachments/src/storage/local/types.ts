import type { AttachmentHash } from "@powerhousedao/reactor";

/**
 * One attachment's metadata row in a local, realm-resident store.
 *
 * The committed subset of {@link AttachmentHeader}: no `pending` status and no
 * `expiresAtUtc`, because a local store of this kind holds no reservation
 * table. Pending is a property of an in-flight UPLOAD, which belongs to the
 * server-side `KyselyAttachmentStore`/`IReservationStore` pair; a replicating
 * store only ever learns "pending" from a transport answer and never persists
 * it.
 */
export type LocalAttachmentRecord = {
  hash: AttachmentHash;
  mimeType: string;
  fileName: string;
  /**
   * The byte length actually held (or last held, for an evicted record), not
   * the producer's claim. `AttachmentMetadata.sizeBytes` arrives over a wire
   * and is only as honest as its sender; `storageUsed()` sums this field, so
   * it is measured from the bytes received.
   */
  sizeBytes: number;
  extension: string | null;
  status: "available" | "evicted";
  source: "local" | "sync";
  createdAtUtc: string;
  lastAccessedAtUtc: string;
};

/**
 * The persistence seam under {@link LocalAttachmentStore}: a content-addressed
 * record store plus a blob store, and nothing else.
 *
 * Every `IAttachmentStore` semantic -- dedup on put, evicted-then-restored,
 * access-time bumping, transport re-fetch, what `has()` means -- lives in
 * {@link LocalAttachmentStore} above this interface, so the two backends
 * (IndexedDB for a browser, a memory twin for Node) cannot drift on behaviour.
 * A backend only has to move bytes and rows.
 *
 * Bytes cross this interface as whole `Uint8Array`s rather than streams on
 * purpose: IndexedDB has no streaming value API, so a chunked backend would
 * have to reassemble anyway, and a browser-side attachment store is bounded by
 * what the realm can hold regardless.
 */
export interface ILocalAttachmentBackend {
  /** The record for `hash`, or undefined when the hash is unknown. */
  readRecord(hash: AttachmentHash): Promise<LocalAttachmentRecord | undefined>;

  /**
   * Writes `record` and `bytes` as ONE unit, replacing whatever was there.
   *
   * Atomicity matters: a record claiming `available` with no blob behind it
   * reads as a store that holds bytes it cannot serve, which is exactly the
   * state the replicator would never retry.
   */
  write(record: LocalAttachmentRecord, bytes: Uint8Array): Promise<void>;

  /** The bytes for `hash`, or undefined when none are held. */
  readBytes(hash: AttachmentHash): Promise<Uint8Array | undefined>;

  /**
   * Writes `record` (expected to carry `status: "evicted"`) and deletes its
   * blob as one unit. The record is retained so the hash stays known.
   */
  evict(record: LocalAttachmentRecord): Promise<void>;

  /** Sets `lastAccessedAtUtc` on an existing record; a no-op for an unknown hash. */
  touch(hash: AttachmentHash, lastAccessedAtUtc: string): Promise<void>;

  /** Summed `sizeBytes` of every record whose status is `available`. */
  availableBytes(): Promise<number>;

  /** Releases the underlying handle. Idempotent. */
  close(): Promise<void>;
}
