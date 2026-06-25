import { fromErrorInfo } from "./error-info.js";
import type { ClientMessage, CorrelationId, OwnerMessage } from "./protocol.js";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  cleanup?: () => void;
  transform?: (value: unknown) => unknown;
};

export type RpcRequestOptions = {
  /** Reject if no response arrives within this many ms; omit for no timeout. */
  timeoutMs?: number;
  /** Maps a successful response value (e.g. paged-result rehydration). */
  transform?: (value: unknown) => unknown;
  /** Runs after the post; may return a cleanup invoked when the request settles. */
  setup?: (id: CorrelationId) => (() => void) | void;
};

/** Anything that can send a client message (the router). */
export type RpcPoster = { post(message: ClientMessage): void };

/**
 * Request/response correlation shared by every RPC proxy: one pending map,
 * res/err settlement, and per-request timeout/transform/cleanup.
 */
export class RpcCorrelator {
  private counter = 0;
  private readonly pending = new Map<CorrelationId, Pending>();

  constructor(
    private readonly poster: RpcPoster,
    private readonly prefix = "r",
  ) {}

  nextId(): CorrelationId {
    return `${this.prefix}${++this.counter}`;
  }

  /** Settle the pending request a res/err refers to; a missing id is a no-op. */
  handleMessage(message: OwnerMessage): void {
    if (message.k !== "res" && message.k !== "err") {
      return;
    }
    const entry = this.pending.get(message.id);
    if (!entry) {
      return;
    }
    this.pending.delete(message.id);
    if (entry.timer) {
      clearTimeout(entry.timer);
    }
    entry.cleanup?.();
    if (message.k === "res") {
      entry.resolve(
        entry.transform ? entry.transform(message.value) : message.value,
      );
    } else {
      entry.reject(fromErrorInfo(message.error));
    }
  }

  /** Send a request, resolving on its res/err. `build` stamps the generated id. */
  request(
    build: (id: CorrelationId) => ClientMessage,
    options: RpcRequestOptions = {},
  ): Promise<unknown> {
    const id = this.nextId();
    const message = build(id);
    const method = (message as { method?: unknown }).method;
    const label =
      typeof method === "string" ? `${message.k} "${method}"` : message.k;
    const promise = new Promise<unknown>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (options.timeoutMs !== undefined) {
        const timeoutMs = options.timeoutMs;
        timer = setTimeout(() => {
          if (this.pending.delete(id)) {
            reject(
              new Error(
                `Reactor worker did not respond to ${label} within ${timeoutMs}ms; the worker may have failed to load`,
              ),
            );
          }
        }, timeoutMs);
      }
      this.pending.set(id, {
        resolve,
        reject,
        timer,
        transform: options.transform,
      });
    });
    this.poster.post(message);
    const cleanup = options.setup?.(id);
    if (cleanup) {
      const entry = this.pending.get(id);
      if (entry) {
        entry.cleanup = cleanup;
      }
    }
    return promise;
  }
}
