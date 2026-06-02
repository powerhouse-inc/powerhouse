import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";

/**
 * Thrown when an attachment ref or hash is not known to the store.
 */
export class AttachmentNotFound extends Error {
  constructor(identifier: string) {
    super(`Attachment not found: ${identifier}`);
    this.name = "AttachmentNotFound";
  }
}

/**
 * Thrown when a reservation ID is not found in the reservation store.
 */
export class ReservationNotFound extends Error {
  constructor(reservationId: string) {
    super(`Reservation not found: ${reservationId}`);
    this.name = "ReservationNotFound";
  }
}

/**
 * Thrown when an attachment ref string does not match the expected format.
 */
export class InvalidAttachmentRef extends Error {
  constructor(ref: string) {
    super(`Invalid attachment ref: ${ref}`);
    this.name = "InvalidAttachmentRef";
  }
}

/**
 * Thrown when an upload exceeds the configured maximum byte cap.
 * Route handlers should map this to HTTP 413 Payload Too Large.
 */
export class UploadTooLarge extends Error {
  readonly maxBytes: number;
  constructor(maxBytes: number) {
    super(`Upload exceeds maximum size of ${maxBytes} bytes`);
    this.name = "UploadTooLarge";
    this.maxBytes = maxBytes;
  }
}

/**
 * Thrown by reserve() when the claimed hash is already available in the store.
 * The caller should use err.ref directly and upload nothing -- this is the
 * dedup fast path: duplicate content never leaves the client.
 */
export class AttachmentAlreadyExists extends Error {
  readonly hash: AttachmentHash;
  readonly ref: AttachmentRef;
  constructor(hash: AttachmentHash, ref: AttachmentRef) {
    super(`Attachment already exists for hash: ${hash}`);
    this.name = "AttachmentAlreadyExists";
    this.hash = hash;
    this.ref = ref;
  }
}

/**
 * Thrown by send() when the server-computed hash of the uploaded bytes
 * does not match the hash claimed at reservation time. Nothing is committed;
 * the reservation is retained so the client can retry with correct bytes.
 */
export class HashMismatch extends Error {
  readonly claimed: AttachmentHash;
  readonly actual: AttachmentHash;
  constructor(claimed: AttachmentHash, actual: AttachmentHash) {
    super(`Hash mismatch: claimed ${claimed} but computed ${actual}`);
    this.name = "HashMismatch";
    this.claimed = claimed;
    this.actual = actual;
  }
}

/**
 * Thrown by send() when the uploaded byte count does not equal the
 * sizeBytes declared at reservation time. The handle may reject
 * mid-stream as soon as the count exceeds the declaration.
 * Nothing is committed; the reservation is retained for retry.
 *
 * "actual" is the byte count received from the stream before aborting --
 * it includes the chunk that crossed the declaration and can exceed bytes
 * persisted. On mid-stream aborts the true total is unknown; at least
 * "actual" bytes were sent.
 */
export class SizeMismatch extends Error {
  readonly declared: number;
  readonly actual: number;
  constructor(declared: number, actual: number) {
    super(`Size mismatch: declared ${declared} bytes but received ${actual}`);
    this.name = "SizeMismatch";
    this.declared = declared;
    this.actual = actual;
  }
}

/**
 * Thrown by get() when the hash is reserved by an in-flight upload and
 * bytes are not yet available anywhere. Deliberately NOT a subclass of
 * AttachmentNotFound -- callers must distinguish "retry later" from "unknown".
 * After expiresAtUtc has passed the hash reads as not found.
 *
 * metadata is populated when the reservation is local and its fields are
 * known (mimeType, fileName, sizeBytes). It is undefined when the pending
 * state is learned from a remote transport that did not supply the full
 * Attachment-Pending header (transport-pending / degraded wire case).
 */
export class AttachmentPending extends Error {
  readonly hash: AttachmentHash;
  readonly expiresAtUtc: string;
  readonly metadata:
    | {
        readonly mimeType: string;
        readonly fileName: string;
        readonly sizeBytes: number;
      }
    | undefined;

  constructor(
    hash: AttachmentHash,
    expiresAtUtc: string,
    meta?: { mimeType: string; fileName: string; sizeBytes: number },
  ) {
    super(
      `Attachment pending upload for hash: ${hash}, expires: ${expiresAtUtc}`,
    );
    this.name = "AttachmentPending";
    this.hash = hash;
    this.expiresAtUtc = expiresAtUtc;
    this.metadata = meta;
  }
}
