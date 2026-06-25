import { fromErrorInfo } from "./error-info.js";
import type { ClientMessage, CorrelationId, OwnerMessage } from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
  cleanup?: () => void;
};

export type RpcCorrelatorOptions = {
  // Correlation-id prefix; keeps ids unique across proxies sharing a transport.
  prefix: string;
  // Reject a request that gets no response after this long; omit for no timeout.
  timeoutMs?: number;
  // Op label used in the timeout message (e.g. "sync-op").
  label?: string;
  // Applied to a successful response value (e.g. paged-result rehydration).
  transform?: (value: unknown) => unknown;
};

// Request/response correlation over a transport: one pending map, res/err
// settlement, an optional timeout, and a per-request cleanup hook. Shared by the
// reactor RPC proxies so the matching scaffold lives in exactly one place.
export class RpcCorrelator {
  private counter = 0;
  private readonly pending = new Map<CorrelationId, Pending>();
  private readonly prefix: string;
  private readonly timeoutMs?: number;
  private readonly label: string;
  private readonly transform: (value: unknown) => unknown;

  constructor(
    private readonly transport: IRpcTransport,
    options: RpcCorrelatorOptions,
  ) {
    this.prefix = options.prefix;
    this.timeoutMs = options.timeoutMs;
    this.label = options.label ?? "request";
    this.transform = options.transform ?? ((value) => value);
  }

  nextId(): CorrelationId {
    return `${this.prefix}${++this.counter}`;
  }

  // Route a transport message; returns true when it settles a pending request.
  // A non-res/err message, or an id this correlator did not issue, returns false
  // so a shared listener can fall through to other consumers (e.g. subscriptions).
  handleMessage(message: OwnerMessage): boolean {
    if (message.k !== "res" && message.k !== "err") {
      return false;
    }
    const entry = this.pending.get(message.id);
    if (!entry) {
      return false;
    }
    this.pending.delete(message.id);
    if (entry.timer) {
      clearTimeout(entry.timer);
    }
    entry.cleanup?.();
    if (message.k === "res") {
      entry.resolve(this.transform(message.value));
    } else {
      entry.reject(fromErrorInfo(message.error));
    }
    return true;
  }

  // Convenience for proxies whose transport carries only this correlator's
  // res/err; proxies that also handle other kinds should call handleMessage.
  attach(): () => void {
    return this.transport.onMessage((message) => {
      this.handleMessage(message as OwnerMessage);
    });
  }

  // Send a request and resolve when its res/err arrives. `build` stamps the
  // generated id onto the wire message; `setup` runs after the post (so a
  // synchronous abort can't beat it) and may return a cleanup run on settle.
  request(
    build: (id: CorrelationId) => ClientMessage,
    setup?: (id: CorrelationId) => (() => void) | void,
  ): Promise<unknown> {
    const id = this.nextId();
    const message = build(id);
    const method = (message as { method?: unknown }).method;
    const opLabel =
      typeof method === "string" ? `${this.label} "${method}"` : this.label;
    const promise = new Promise<unknown>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (this.timeoutMs !== undefined) {
        timer = setTimeout(() => {
          if (this.pending.delete(id)) {
            reject(
              new Error(
                `Reactor worker did not respond to ${opLabel} within ${this.timeoutMs}ms; the worker may have failed to load`,
              ),
            );
          }
        }, this.timeoutMs);
      }
      this.pending.set(id, { resolve, reject, timer });
    });
    this.transport.post(message);
    const cleanup = setup?.(id);
    if (cleanup) {
      const entry = this.pending.get(id);
      if (entry) {
        entry.cleanup = cleanup;
      }
    }
    return promise;
  }
}
