import type { AttachmentHash, LocalChannelPort } from "@powerhousedao/reactor";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import {
  isAttachmentHash,
  readGateAllowsAttachmentRead,
  scopeGateAllowsAttachmentRead,
  type AttachmentReadGate,
  type IDocumentScopeGate,
} from "../access/attachment-read-gate.js";
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

/** The peer a server answers: which reactor, over which channel. */
export type AttachmentPeerLink = { peerId: string; channelName: string };

/**
 * Decides whether the linked peer may read `hash` through `documentId`. False
 * is answered as `not-found`, indistinguishable from absent bytes.
 */
export type LocalAttachmentAuthorizer = (
  link: AttachmentPeerLink,
  hash: AttachmentHash,
  documentId: string,
) => Promise<boolean>;

export type LocalAttachmentServerOptions = {
  /** The brokered port to the peer; the same one the transport half uses. */
  port: LocalChannelPort;
  /** Who is asking; handed to {@link authorize}. */
  link: AttachmentPeerLink;
  /** The store bytes are served FROM. Only locally held bytes are served. */
  store: IAttachmentStore;
  /** Defaults to refusing every read; see {@link readGateAttachmentAuthorizer}. */
  authorize?: LocalAttachmentAuthorizer;
  /** Bytes per `chunk` message; defaults to {@link DEFAULT_LOCAL_CHUNK_BYTES}. */
  chunkSizeBytes?: number;
  /** Requests served at once; one past it is answered `pending`. */
  maxConcurrentServes?: number;
  onDiagnostic?: (message: string, error?: unknown) => void;
};

/** Default {@link LocalAttachmentServerOptions.maxConcurrentServes}. */
export const DEFAULT_LOCAL_MAX_CONCURRENT_SERVES = 4;

/** A macrotask, so a cancel posted by the peer is handled between slices. */
function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export type ReadGateAttachmentAuthorizerOptions = {
  readGate: AttachmentReadGate;
  /** `SyncScopeGate`; a reactor without a policy model passes one over `BareReadGate`. */
  scopeGate: IDocumentScopeGate;
  references: Pick<IAttachmentReferenceReader, "referencingScopes">;
  /** The subject a link reads as; undefined refuses every read on it. */
  subjectOf: (link: AttachmentPeerLink) => AuthSubject | undefined;
};

/**
 * Authorizes a peer read the way the Switchboard's attachment route does: the
 * link's subject may read the document's `global` scope, the reactor serves
 * the document to it, and a scope it may read references the hash.
 */
export function readGateAttachmentAuthorizer(
  options: ReadGateAttachmentAuthorizerOptions,
): LocalAttachmentAuthorizer {
  return async (link, hash, documentId) => {
    const subject = options.subjectOf(link);
    if (!subject) {
      return false;
    }
    const readable = await scopeGateAllowsAttachmentRead(
      options.scopeGate,
      documentId,
      subject,
    );
    if (!readable) {
      return false;
    }
    return readGateAllowsAttachmentRead(
      options.readGate,
      options.references,
      documentId,
      createRef(hash),
      subject,
    );
  };
}

/**
 * Serves attachment bytes to a brokered local peer from this reactor's own
 * store.
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
  private readonly link: AttachmentPeerLink;
  private readonly store: IAttachmentStore;
  private readonly authorize: LocalAttachmentAuthorizer;
  private readonly chunkSizeBytes: number;
  private readonly maxConcurrentServes: number;
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
    this.link = { ...options.link };
    this.store = options.store;
    this.authorize =
      options.authorize ?? ((): Promise<boolean> => Promise.resolve(false));
    this.chunkSizeBytes = options.chunkSizeBytes ?? DEFAULT_LOCAL_CHUNK_BYTES;
    this.maxConcurrentServes =
      options.maxConcurrentServes ?? DEFAULT_LOCAL_MAX_CONCURRENT_SERVES;
    this.onDiagnostic = options.onDiagnostic ?? ((): void => undefined);
    this.detachPort = this.port.onMessage((data) => this.onMessage(data));
  }

  /** What this peer has handed out. */
  stats(): { served: number; bytesServed: number; refused: number } {
    return {
      served: this.served,
      bytesServed: this.bytesServed,
      refused: this.refused,
    };
  }

  /** Detaches from the port. In-flight serves stop at their next slice. */
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
    // Any answer would settle the requester's live request under that id.
    if (this.inFlight.has(data.id)) {
      this.onDiagnostic(
        `ignoring a duplicate attachment request id ${data.id}`,
      );
      return;
    }
    if (
      !isAttachmentHash(data.hash) ||
      typeof data.documentId !== "string" ||
      data.documentId === ""
    ) {
      this.refuse(data);
      return;
    }
    if (this.inFlight.size >= this.maxConcurrentServes) {
      // Busy is a wait, not a fault; the expiry outlasts a slow delivery,
      // since the requester reads an expired pending as not-found.
      this.post({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "pending",
        id: data.id,
        hash: data.hash,
        expiresAtUtc: new Date(Date.now() + BUSY_PENDING_TTL_MS).toISOString(),
        retryAfterMs: BUSY_RETRY_MS,
      });
      return;
    }
    void this.serve(data);
  }

  private stopped(id: string): boolean {
    return this.closed || this.cancelled.has(id);
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
      const authorized = await this.authorize(
        { ...this.link },
        request.hash,
        request.documentId,
      );
      if (!authorized) {
        this.refuse(request);
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
    if (this.stopped(request.id)) {
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
    if (this.stopped(request.id)) {
      return;
    }
    if (!held) {
      this.refuse(request);
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
      this.onDiagnostic(`serving attachment ${request.hash} failed`, error);
      this.refuse(request);
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
        if (this.stopped(request.id)) {
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
          if (offset > 0) {
            await nextTurn();
          }
          if (this.stopped(request.id)) {
            await reader.cancel();
            return;
          }
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

  /** Refused and absent are one answer, so a peer learns nothing from it. */
  private refuse(request: LocalAttachmentFetchRequest): void {
    this.refused += 1;
    this.post({
      protocol: LOCAL_ATTACHMENT_PROTOCOL,
      kind: "not-found",
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

/** Retry hint sent with the `pending` that answers a request over the serve cap. */
const BUSY_RETRY_MS = 1_000;

/** Expiry of that `pending`; long enough that a slow delivery is still live. */
const BUSY_PENDING_TTL_MS = 60_000;
