import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";

/**
 * Status of attachment data in the local store.
 */
export type AttachmentStatus = "available" | "evicted";

/**
 * Metadata about an attachment. Only exists after data is stored
 * (via upload.send for client uploads, or put for sync).
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
};

/**
 * Metadata provided alongside attachment data during sync, and returned
 * via the switchboard's `X-Attachment-Metadata` header on GET/HEAD.
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
 * Options provided when reserving an attachment slot.
 */
export type ReserveAttachmentOptions = {
  mimeType: string;
  fileName: string;
  extension?: string | null;
};

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
 */
export type Reservation = {
  reservationId: string;
  mimeType: string;
  fileName: string;
  extension: string | null;
  createdAtUtc: string;
  expiresAtUtc: string;
};
