import type { AttachmentHash, LocalChannelPort } from "@powerhousedao/reactor";
import type { IAttachmentTransport } from "../interfaces.js";
import type { TransportFetchResult } from "../types.js";
import {
  DEFAULT_LOCAL_REQUEST_TIMEOUT_MS,
  isLocalAttachmentResponse,
  LOCAL_ATTACHMENT_PROTOCOL,
  type LocalAttachmentResponse,
} from "./protocol.js";

export type LocalAttachmentTransportOptions = {
  /**
   * The brokered port to the peer -- the same `LocalChannelPort` abstraction
   * `LocalChannel` sync runs over (W1.1), on its own channel so byte traffic
   * never interleaves with the sync wire.
   */
  port: LocalChannelPort;
  /**
   * How long to wait for the NEXT message of a request before abandoning it.
   * Reset by every message, so a slow but progressing transfer is not cut off
   * while a silent peer is. Defaults to
   * {@link DEFAULT_LOCAL_REQUEST_TIMEOUT_MS}.
   */
  requestTimeoutMs?: number;
  /** Swapped in tests; defaults to the realm's timers. */
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Identifies this instance's request ids; defaults to a random nonce. */
  instanceId?: string;
};

type Pending = {
  hash: AttachmentHash;
  settle: (result: TransportFetchResult) => void;
  fail: (error: Error) => void;
  /** Set once `begin` has arrived and the body stream exists. */
  controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  nextSeq: number;
  timer: unknown;
  detachAbort: (() => void) | undefined;
};

/**
 * `IAttachmentTransport` over a brokered `LocalChannelPort`: one monitor-linked
 * reactor pulling attachment bytes straight from its peer, with no Switchboard
 * and no HTTP (multi-reactor W3.4).
 *
 * The counterpart of {@link LocalAttachmentServer}, and a pair of them runs on
 * each end of one port: a reactor both asks for bytes and serves them. The two
 * halves share the port and ignore each other's messages (see
 * `isLocalAttachmentRequest` / `isLocalAttachmentResponse`), and request ids
 * are namespaced per instance so two peers that both start counting at 1 never
 * match each other's replies.
 *
 * Pull-only by design. The agreed byte-movement model is lazy
 * fetch-on-reference, so {@link announce} is a no-op and {@link push} refuses
 * by name rather than silently succeeding: a push that reported success while
 * moving nothing would make an eager-replication caller believe bytes had
 * landed on a peer.
 */
export class LocalAttachmentTransport implements IAttachmentTransport {
  private readonly port: LocalChannelPort;
  private readonly requestTimeoutMs: number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly instanceId: string;
  private readonly pending = new Map<string, Pending>();
  private readonly detachPort: () => void;
  private nextRequest = 0;
  private closed = false;

  constructor(options: LocalAttachmentTransportOptions) {
    this.port = options.port;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_LOCAL_REQUEST_TIMEOUT_MS;
    this.setTimer =
      options.setTimer ??
      ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer =
      options.clearTimer ??
      ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.instanceId =
      options.instanceId ?? Math.random().toString(36).slice(2, 10);
    this.detachPort = this.port.onMessage((data) => this.onMessage(data));
  }

  fetch(
    hash: AttachmentHash,
    documentId: string,
    signal?: AbortSignal,
  ): Promise<TransportFetchResult> {
    if (this.closed) {
      return Promise.reject(
        new Error("Local attachment transport is closed; the link is severed"),
      );
    }
    if (signal?.aborted) {
      return Promise.reject(new Error("Attachment fetch aborted"));
    }

    const id = `${this.instanceId}:${++this.nextRequest}`;
    return new Promise<TransportFetchResult>((resolve, reject) => {
      const entry: Pending = {
        hash,
        settle: resolve,
        fail: reject,
        controller: undefined,
        nextSeq: 0,
        timer: undefined,
        detachAbort: undefined,
      };
      this.pending.set(id, entry);
      this.arm(id, entry);

      if (signal) {
        const onAbort = (): void => {
          this.post({
            protocol: LOCAL_ATTACHMENT_PROTOCOL,
            kind: "cancel",
            id,
          });
          this.abandon(id, new Error("Attachment fetch aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        entry.detachAbort = () => signal.removeEventListener("abort", onAbort);
      }

      this.post({
        protocol: LOCAL_ATTACHMENT_PROTOCOL,
        kind: "fetch",
        id,
        hash,
        documentId,
      });
    });
  }

  /**
   * No-op: the agreed model is the peer PULLING on reference, so there is
   * nothing useful to tell it -- it will ask when one of its own operations
   * names the hash. An eager-announce protocol would need a peer that acts on
   * the notice, which nothing does.
   */
  announce(): Promise<void> {
    return Promise.resolve();
  }

  /** Refuses: this transport moves bytes only in answer to a peer's request. */
  push(): Promise<void> {
    return Promise.reject(
      new Error(
        "LocalAttachmentTransport is pull-only: a linked peer fetches bytes on reference, so there is no push path to a local peer",
      ),
    );
  }

  /** Detaches from the port and fails every in-flight request. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.detachPort();
    for (const id of [...this.pending.keys()]) {
      this.abandon(
        id,
        new Error(
          "Local attachment transport closed while a fetch was in flight",
        ),
      );
    }
  }

  private onMessage(data: unknown): void {
    if (!isLocalAttachmentResponse(data)) {
      return;
    }
    const entry = this.pending.get(data.id);
    if (!entry) {
      // A reply to a request this instance abandoned, or to the peer's own
      // conversation with someone else. Nothing to do.
      return;
    }
    this.arm(data.id, entry);
    this.handle(data.id, entry, data);
  }

  private handle(
    id: string,
    entry: Pending,
    message: LocalAttachmentResponse,
  ): void {
    switch (message.kind) {
      case "begin": {
        const body = new ReadableStream<Uint8Array>({
          start: (controller) => {
            entry.controller = controller;
          },
          cancel: () => {
            this.post({
              protocol: LOCAL_ATTACHMENT_PROTOCOL,
              kind: "cancel",
              id,
            });
            this.release(id, entry);
          },
        });
        entry.settle({
          kind: "data",
          response: {
            hash: message.hash,
            metadata: message.metadata,
            body,
          },
        });
        return;
      }
      case "chunk": {
        if (!entry.controller) {
          this.abandon(
            id,
            new Error(
              "Local attachment peer sent body bytes before announcing the attachment",
            ),
          );
          return;
        }
        if (message.seq !== entry.nextSeq) {
          // The port preserves order, so an out-of-order sequence means the
          // two sides disagree about the transfer; serving a body with a hole
          // in it would corrupt a content-addressed store.
          this.abandon(
            id,
            new Error(
              `Local attachment chunk out of order: expected ${entry.nextSeq}, got ${message.seq}`,
            ),
          );
          return;
        }
        entry.nextSeq += 1;
        entry.controller.enqueue(new Uint8Array(message.bytes));
        return;
      }
      case "end": {
        if (!entry.controller) {
          // A terminal reply with no body stream behind it: `end` arrived
          // without a `begin`, so the fetch promise was never settled. Failing
          // it (rather than silently releasing) rejects the awaiting fetch and
          // frees the concurrency slot, mirroring the `chunk`-before-`begin`
          // abandon path; a silent release would hang the fetch forever.
          this.abandon(
            id,
            new Error(
              "Local attachment peer ended the transfer before announcing the attachment",
            ),
          );
          return;
        }
        entry.controller.close();
        this.release(id, entry);
        return;
      }
      case "pending": {
        entry.settle({
          kind: "pending",
          hash: message.hash,
          expiresAtUtc: message.expiresAtUtc,
          retryAfterMs: message.retryAfterMs,
        });
        this.release(id, entry);
        return;
      }
      case "not-found": {
        entry.settle({ kind: "not-found" });
        this.release(id, entry);
        return;
      }
      case "error": {
        this.abandon(
          id,
          new Error(`Local attachment peer failed: ${message.message}`),
        );
        return;
      }
    }
  }

  /** Resets this request's silence timer. */
  private arm(id: string, entry: Pending): void {
    if (entry.timer !== undefined) {
      this.clearTimer(entry.timer);
    }
    entry.timer = this.setTimer(() => {
      this.post({ protocol: LOCAL_ATTACHMENT_PROTOCOL, kind: "cancel", id });
      this.abandon(
        id,
        new Error(
          `Local attachment peer went silent for ${this.requestTimeoutMs}ms while serving ${entry.hash}`,
        ),
      );
    }, this.requestTimeoutMs);
  }

  /** Forgets a request that completed normally. */
  private release(id: string, entry: Pending): void {
    if (entry.timer !== undefined) {
      this.clearTimer(entry.timer);
      entry.timer = undefined;
    }
    entry.detachAbort?.();
    this.pending.delete(id);
  }

  /**
   * Forgets a request that failed, pushing the failure to whichever side is
   * still listening: the fetch promise before `begin`, the body stream after.
   */
  private abandon(id: string, error: Error): void {
    const entry = this.pending.get(id);
    if (!entry) {
      return;
    }
    this.release(id, entry);
    if (entry.controller) {
      entry.controller.error(error);
      return;
    }
    entry.fail(error);
  }

  private post(message: unknown): void {
    try {
      this.port.postMessage(message);
    } catch {
      // A closed port throws on post in some realms. The silence timer (or
      // close()) is what turns that into a reported failure; there is nothing
      // useful to do with the throw itself.
    }
  }
}
