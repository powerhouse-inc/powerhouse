import type { AttachmentHash, LocalChannelPort } from "@powerhousedao/reactor";
import { AttachmentPending } from "../errors.js";
import type { IAttachmentStore } from "../interfaces.js";
import type { IAttachmentReferenceReader } from "../read-models/attachment-reference/types.js";
import { createRef } from "../ref.js";
import {
  DEFAULT_LOCAL_CHUNK_BYTES,
  isLocalAttachmentRequest,
  LOCAL_ATTACHMENT_PROTOCOL,
  type LocalAttachmentFetchRequest,
} from "./protocol.js";

/**
 * Decides whether `documentId` authorizes reading `hash` from this reactor.
 *
 * Returning false is answered as `not-found` on the wire, deliberately
 * indistinguishable from absent bytes; see
 * `LocalAttachmentNotFoundResponse`.
 */
export type LocalAttachmentAuthorizer = (
  hash: AttachmentHash,
  documentId: string,
) => Promise<boolean>;

export type LocalAttachmentServerOptions = {
  /** The brokered port to the peer; the same one the transport half uses. */
  port: LocalChannelPort;
  /** The store bytes are served FROM. Only locally held bytes are served. */
  store: IAttachmentStore;
  /**
   * Defaults to refusing every read. Pass {@link attachmentReferenceAuthorizer}
   * over this reactor's reference index.
   */
  authorize?: LocalAttachmentAuthorizer;
  /** Bytes per `chunk` message; defaults to {@link DEFAULT_LOCAL_CHUNK_BYTES}. */
  chunkSizeBytes?: number;
  onDiagnostic?: (message: string, error?: unknown) => void;
};

/**
 * Authorizes a byte read through this reactor's own attachment reference
 * index: the document must actually reference the attachment.
 *
 * This is the component whose lag the requester's bounded `not-found` retries
 * exist for -- a reference index is a read model and trails its own reactor's
 * sync, so a document that genuinely references a hash can be refused here for
 * a while after the operation arrives. That is reported as `not-found` and
 * retried, never papered over.
 *
 * Version 1 is the only defined ref version (SHA-256 hex), so the hash is
 * checked as a `v1` ref. A future version would need the reader to answer by
 * hash rather than by ref.
 */
export function attachmentReferenceAuthorizer(
  reader: IAttachmentReferenceReader,
): LocalAttachmentAuthorizer {
  return (hash, documentId) => reader.hasReference(documentId, createRef(hash));
}

/**
 * Serves attachment bytes to a brokered local peer from this reactor's own
 * store (multi-reactor W3.4).
 *
 * The answering half of {@link LocalAttachmentTransport}; both run on the same
 * `LocalChannelPort` and ignore each other's messages.
 *
 * It never chains. The store is read WITHOUT a document id, which means a
 * `LocalAttachmentStore` serves only bytes it actually holds and cannot reach
 * for its own transport on the requester's behalf. Without that, two peers
 * linked to each other would answer a miss by asking each other, and a hash
 * neither held would bounce between them.
 */
export class LocalAttachmentServer {
  private readonly port: LocalChannelPort;
  private readonly store: IAttachmentStore;
  private readonly authorize: LocalAttachmentAuthorizer;
  private readonly chunkSizeBytes: number;
  private readonly onDiagnostic: (message: string, error?: unknown) => void;
  private readonly cancelled = new Set<string>();
  private readonly inFlight = new Set<string>();
  private readonly detachPort: () => void;
  private served = 0;
  private bytesServed = 0;
  private refused = 0;
  private closed = false;

  constructor(options: LocalAttachmentServerOptions) {
    this.port = options.port;
    this.store = options.store;
    this.authorize =
      options.authorize ?? ((): Promise<boolean> => Promise.resolve(false));
    this.chunkSizeBytes = options.chunkSizeBytes ?? DEFAULT_LOCAL_CHUNK_BYTES;
    this.onDiagnostic = options.onDiagnostic ?? ((): void => undefined);
    this.detachPort = this.port.onMessage((data) => this.onMessage(data));
  }

  /** What this peer has handed out, for the monitor's attachments panel. */
  stats(): { served: number; bytesServed: number; refused: number } {
    return {
      served: this.served,
      bytesServed: this.bytesServed,
      refused: this.refused,
    };
  }

  /** Detaches from the port. In-flight serves stop at their next chunk. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.detachPort();
    // Nothing will ever consume these again; a closed server holds no requests.
    this.cancelled.clear();
    this.inFlight.clear();
  }

  private onMessage(data: unknown): void {
    if (!isLocalAttachmentRequest(data)) {
      return;
    }
    if (data.kind === "cancel") {
      // Only track a cancel for a request that is actually in flight. A cancel
      // that arrives after a request has finished (or for one that never
      // started) would otherwise accumulate in the set forever, since nothing
      // downstream would ever match and drop it.
      if (this.inFlight.has(data.id)) {
        this.cancelled.add(data.id);
      }
      return;
    }
    void this.serve(data);
  }

  private async serve(request: LocalAttachmentFetchRequest): Promise<void> {
    this.inFlight.add(request.id);
    try {
      await this.serveInner(request);
    } finally {
      this.inFlight.delete(request.id);
      this.cancelled.delete(request.id);
    }
  }

  private async serveInner(
    request: LocalAttachmentFetchRequest,
  ): Promise<void> {
    try {
      const authorized = await this.authorize(request.hash, request.documentId);
      if (!authorized) {
        this.refused += 1;
        this.post({
          protocol: LOCAL_ATTACHMENT_PROTOCOL,
          kind: "not-found",
          id: request.id,
        });
        return;
      }
    } catch (error) {
      this.onDiagnostic(
        `authorizing attachment ${request.hash} for ${request.documentId} failed`,
        error,
      );
      this.post({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "error",
        id: request.id,
        message: "authorization check failed",
      });
      return;
    }

    let held: boolean;
    try {
      held = await this.store.has(request.hash);
    } catch (error) {
      this.failRequest(
        request,
        "reading the local attachment store failed",
        error,
      );
      return;
    }
    if (!held) {
      this.refused += 1;
      this.post({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "not-found",
        id: request.id,
      });
      return;
    }

    await this.stream(request);
  }

  private async stream(request: LocalAttachmentFetchRequest): Promise<void> {
    // No document id: a local store must serve its OWN bytes here and never
    // chain out to its transport on the requester's behalf. See the class doc.
    let response;
    try {
      response = await this.store.get(request.hash);
    } catch (error) {
      if (error instanceof AttachmentPending) {
        this.post({
          protocol: LOCAL_ATTACHMENT_PROTOCOL,
          kind: "pending",
          id: request.id,
          hash: request.hash,
          expiresAtUtc: error.expiresAtUtc,
          retryAfterMs: DEFAULT_PENDING_RETRY_MS,
        });
        return;
      }
      // Anything else -- including a hash that went away between has() and
      // get() -- is reported as absent rather than as a server fault, which is
      // what it is from the requester's point of view.
      this.refused += 1;
      this.onDiagnostic(`serving attachment ${request.hash} failed`, error);
      this.post({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "not-found",
        id: request.id,
      });
      return;
    }

    this.post({
      protocol: LOCAL_ATTACHMENT_PROTOCOL,
      kind: "begin",
      id: request.id,
      hash: request.hash,
      metadata: {
        mimeType: response.header.mimeType,
        fileName: response.header.fileName,
        sizeBytes: response.header.sizeBytes,
        extension: response.header.extension,
        createdAtUtc: response.header.createdAtUtc,
        lastAccessedAtUtc: response.header.lastAccessedAtUtc,
      },
    });

    const reader = response.body.getReader();
    let seq = 0;
    try {
      for (;;) {
        if (this.closed || this.cancelled.has(request.id)) {
          this.cancelled.delete(request.id);
          await reader.cancel();
          return;
        }
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        for (
          let offset = 0;
          offset < value.byteLength;
          offset += this.chunkSizeBytes
        ) {
          const slice = value.subarray(
            offset,
            Math.min(offset + this.chunkSizeBytes, value.byteLength),
          );
          // Copied: a `subarray` shares its buffer, and a structured clone of
          // a view that outlives this loop is not something to rely on.
          const bytes = new Uint8Array(slice.byteLength);
          bytes.set(slice);
          this.post({
            protocol: LOCAL_ATTACHMENT_PROTOCOL,
            kind: "chunk",
            id: request.id,
            seq: seq++,
            bytes,
          });
          this.bytesServed += bytes.byteLength;
        }
      }
    } catch (error) {
      this.onDiagnostic(`streaming attachment ${request.hash} failed`, error);
      this.post({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "error",
        id: request.id,
        message: "reading the attachment body failed",
      });
      return;
    }

    this.served += 1;
    this.post({
      protocol: LOCAL_ATTACHMENT_PROTOCOL,
      kind: "end",
      id: request.id,
    });
  }

  private failRequest(
    request: LocalAttachmentFetchRequest,
    message: string,
    error: unknown,
  ): void {
    this.onDiagnostic(`${message} (${request.hash})`, error);
    this.post({
      protocol: LOCAL_ATTACHMENT_PROTOCOL,
      kind: "error",
      id: request.id,
      message,
    });
  }

  private post(message: unknown): void {
    try {
      this.port.postMessage(message);
    } catch (error) {
      this.onDiagnostic("posting an attachment response failed", error);
    }
  }
}

/**
 * Retry hint sent with a `pending` answer. A local store has no reservation
 * table, so this only arises when the served store is a server-side one; the
 * value mirrors `SwitchboardAttachmentTransport`'s own default.
 */
const DEFAULT_PENDING_RETRY_MS = 5_000;
