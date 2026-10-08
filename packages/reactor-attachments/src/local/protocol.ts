import type { AttachmentHash } from "@powerhousedao/reactor";
import type { AttachmentMetadata } from "../types.js";

/**
 * Wire tag on every message, so one `LocalChannelPort` can carry this
 * request/response protocol without being confused with anything else on the
 * port, and so a version skew is a readable refusal rather than a crash.
 */
export const LOCAL_ATTACHMENT_PROTOCOL = "ph-attachment/v1";

/** Default bytes per `chunk` message. */
export const DEFAULT_LOCAL_CHUNK_BYTES = 256 * 1024;

/** Default wait for the next message of a request before it is abandoned. */
export const DEFAULT_LOCAL_REQUEST_TIMEOUT_MS = 30_000;

/** Ask a peer for the bytes of `hash`, authorized by `documentId`. */
export type LocalAttachmentFetchRequest = {
  protocol: typeof LOCAL_ATTACHMENT_PROTOCOL;
  kind: "fetch";
  /** Unique per requesting instance; the peer echoes it on every reply. */
  id: string;
  hash: AttachmentHash;
  documentId: string;
};

/** Abandon an in-flight `fetch` so the peer stops reading and sending. */
export type LocalAttachmentCancelRequest = {
  protocol: typeof LOCAL_ATTACHMENT_PROTOCOL;
  kind: "cancel";
  id: string;
};

export type LocalAttachmentRequest =
  | LocalAttachmentFetchRequest
  | LocalAttachmentCancelRequest;

/**
 * The peer holds the bytes and is about to stream them. `metadata` arrives up
 * front so the requester can start a body stream before the first byte.
 */
export type LocalAttachmentBeginResponse = {
  protocol: typeof LOCAL_ATTACHMENT_PROTOCOL;
  kind: "begin";
  id: string;
  hash: AttachmentHash;
  metadata: AttachmentMetadata;
};

/**
 * One slice of the body. `bytes` is a `Uint8Array`, which both a browser
 * `MessagePort` and a `node:worker_threads` one structured-clone natively.
 * `seq` lets a receiver assert ordering rather than assume it.
 */
export type LocalAttachmentChunkResponse = {
  protocol: typeof LOCAL_ATTACHMENT_PROTOCOL;
  kind: "chunk";
  id: string;
  seq: number;
  bytes: Uint8Array;
};

/** The body is complete. */
export type LocalAttachmentEndResponse = {
  protocol: typeof LOCAL_ATTACHMENT_PROTOCOL;
  kind: "end";
  id: string;
};

/** The peer has a reservation for the hash but no committed bytes yet. */
export type LocalAttachmentPendingResponse = {
  protocol: typeof LOCAL_ATTACHMENT_PROTOCOL;
  kind: "pending";
  id: string;
  hash: AttachmentHash;
  expiresAtUtc: string;
  retryAfterMs: number;
};

/**
 * The peer will not serve the hash: it does not hold the bytes, or the
 * document does not authorize the read.
 *
 * The two are deliberately one answer. Distinguishing them would tell a peer
 * which hashes exist without authorization, and the requester's handling is
 * the same either way -- a bounded retry, because an unauthorized answer is
 * most often the serving reactor's attachment reference index lagging its own
 * sync (see `AttachmentRetryPolicy.notFoundAttempts`).
 */
export type LocalAttachmentNotFoundResponse = {
  protocol: typeof LOCAL_ATTACHMENT_PROTOCOL;
  kind: "not-found";
  id: string;
};

/** The peer failed while serving; the requester treats this as a retryable error. */
export type LocalAttachmentErrorResponse = {
  protocol: typeof LOCAL_ATTACHMENT_PROTOCOL;
  kind: "error";
  id: string;
  message: string;
};

export type LocalAttachmentResponse =
  | LocalAttachmentBeginResponse
  | LocalAttachmentChunkResponse
  | LocalAttachmentEndResponse
  | LocalAttachmentPendingResponse
  | LocalAttachmentNotFoundResponse
  | LocalAttachmentErrorResponse;

export type LocalAttachmentMessage =
  | LocalAttachmentRequest
  | LocalAttachmentResponse;

const REQUEST_KINDS = new Set(["fetch", "cancel"]);
const RESPONSE_KINDS = new Set([
  "begin",
  "chunk",
  "end",
  "pending",
  "not-found",
  "error",
]);

function tagged(value: unknown): value is { kind: string; id: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.protocol === LOCAL_ATTACHMENT_PROTOCOL &&
    typeof record.kind === "string" &&
    typeof record.id === "string"
  );
}

/**
 * Whether `value` is a request for this protocol.
 *
 * Both halves live on one port -- each peer runs a transport AND a server over
 * the same `LocalChannelPort` -- so each half has to recognise only its own
 * side of the conversation and ignore the rest rather than treat it as
 * malformed.
 */
export function isLocalAttachmentRequest(
  value: unknown,
): value is LocalAttachmentRequest {
  return tagged(value) && REQUEST_KINDS.has(value.kind);
}

/** Whether `value` is a response for this protocol. */
export function isLocalAttachmentResponse(
  value: unknown,
): value is LocalAttachmentResponse {
  return tagged(value) && RESPONSE_KINDS.has(value.kind);
}
