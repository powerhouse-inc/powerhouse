import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";

/**
 * Status of attachment data in the local store.
 * 'pending' is a virtual status synthesized at query time from live,
 * hash-bearing reservations -- it never appears in the attachment table.
 */
export type AttachmentStatus = "available" | "evicted" | "pending";

/**
 * Metadata about an attachment. For committed attachments (available/evicted),
 * expiresAtUtc is null. For pending attachments synthesized from a live
 * reservation, expiresAtUtc carries the reservation expiry so callers can
 * emit Retry-After or bound polling loops.
 */
export type AttachmentHeader = {
  hash: AttachmentHash;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  extension: string | null;
  status: AttachmentStatus;
  source: "local" | "sync";
  createdAtUtc: string;
  lastAccessedAtUtc: string;
  expiresAtUtc: string | null;
};

/**
 * Metadata provided alongside attachment data during sync, and returned
 * via the switchboard's `Attachment-Metadata` header on GET/HEAD.
 * `createdAtUtc` is the original upload time, propagated from the source
 * so that the receiving store preserves it instead of synthesizing the
 * fetch time. `lastAccessedAtUtc` is the source reactor's most recent
 * access time; it is optional because not every producer (e.g. a fresh
 * `put` from a transport) tracks access yet. Receiving stores that
 * persist locally (LRU concerns) reset it on every read regardless.
 *
 * Reliability note: `lastAccessedAtUtc` arriving over the wire is
 * best-effort. When the producer omits it, the consumer (see
 * `RemoteAttachmentStore` / `SwitchboardAttachmentTransport`) coalesces
 * with `createdAtUtc`, so the field can silently equal `createdAtUtc`
 * even on a server that has never been read. Do NOT use the wire value
 * for LRU eviction or staleness decisions on remote data; always read
 * the field from the local store after persistence, where the receiving
 * store is the authority.
 */
export type AttachmentMetadata = {
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  extension: string | null;
  createdAtUtc: string;
  lastAccessedAtUtc?: string;
};

/**
 * Legacy upload-first reservation. clientHash and sizeBytes are absent;
 * the ref is only known after send() completes.
 */
export type LegacyReserveAttachmentOptions = {
  mimeType: string;
  fileName: string;
  extension?: string | null;
  clientHash?: undefined;
  sizeBytes?: undefined;
};

/**
 * Hash-first reservation. clientHash is present and sizeBytes is required.
 * The ref is known at reservation time; send() verifies the uploaded bytes
 * against the claimed hash and declared size. The explicit "?: undefined"
 * on LegacyReserveAttachmentOptions makes clientHash a narrowing discriminant:
 * checking options.clientHash !== undefined narrows sizeBytes to number.
 */
export type HashFirstReserveAttachmentOptions = {
  mimeType: string;
  fileName: string;
  extension?: string | null;
  /**
   * Content hash claimed by the client (lowercase SHA-256 hex).
   */
  clientHash: AttachmentHash;
  /**
   * Declared size in bytes. Required when clientHash is present.
   * Reported by stat() during the pending window and enforced on
   * ingest: an upload whose actual byte count differs is rejected.
   */
  sizeBytes: number;
};

/**
 * Options provided when reserving an attachment slot.
 *
 * Use HashFirstReserveAttachmentOptions when clientHash is known up front;
 * the service then operates in hash-first mode: reserve() rejects if the
 * content is already available, and send() verifies the uploaded bytes.
 *
 * Use LegacyReserveAttachmentOptions (or omit clientHash) for the legacy
 * upload-first flow where the ref is only known after send() completes.
 */
export type ReserveAttachmentOptions =
  | LegacyReserveAttachmentOptions
  | HashFirstReserveAttachmentOptions;

/**
 * Result of uploading attachment data through a handle.
 */
export type AttachmentUploadResult = {
  hash: AttachmentHash;
  ref: AttachmentRef;
  header: AttachmentHeader;
};

/**
 * Response when retrieving attachment data from the local store.
 */
export type AttachmentResponse = {
  header: AttachmentHeader;
  body: ReadableStream<Uint8Array>;
};

/**
 * Response when fetching attachment data from a remote transport.
 * Lighter than AttachmentResponse -- a remote peer cannot meaningfully
 * populate status or source, which are local reactor concerns.
 * The store assigns those fields when it calls put() on receipt.
 */
export type TransportResponse = {
  hash: AttachmentHash;
  metadata: AttachmentMetadata;
  body: ReadableStream<Uint8Array>;
};

/**
 * Three-way result from IAttachmentTransport.fetch(). Replaces
 * TransportResponse | null to make the pending state explicit, so
 * peers receiving a synced operation whose attachment is in-flight can
 * distinguish "retry later" from "permanently unknown".
 */
export type TransportFetchResult =
  | { kind: "data"; response: TransportResponse }
  | {
      kind: "pending";
      hash: AttachmentHash;
      expiresAtUtc: string;
      retryAfterMs: number;
    }
  | { kind: "not-found" };

/**
 * Configuration for creating an attachment transport instance.
 */
export type AttachmentTransportConfig = {
  type: string;
  parameters: Record<string, unknown>;
};

/**
 * A reservation for an in-progress attachment upload.
 * Created by reserve(), deleted when upload.send() completes or
 * once expiresAtUtc has passed and a sweep runs.
 * clientHash and sizeBytes are set in hash-first mode and null in
 * legacy upload-first mode.
 */
export type Reservation = {
  reservationId: string;
  mimeType: string;
  fileName: string;
  extension: string | null;
  createdAtUtc: string;
  expiresAtUtc: string;
  clientHash: string | null;
  sizeBytes: number | null;
};
