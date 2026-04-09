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
 * Metadata provided alongside attachment data during sync.
 * The remaining fields (hash, status, source, createdAtUtc, lastAccessedAtUtc)
 * are set by the store when it creates the attachment record.
 */
export type AttachmentMetadata = {
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  extension: string | null;
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
 * Created by reserve(), deleted when upload.send() completes.
 */
export type Reservation = {
  reservationId: string;
  mimeType: string;
  fileName: string;
  extension: string | null;
  createdAtUtc: string;
};
