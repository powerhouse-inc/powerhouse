import type {
  DocumentChangeEvent,
  IDocumentModelRegistry,
  IReactorClient,
  PagingOptions,
  SearchFilter,
  ViewFilter,
} from "@powerhousedao/reactor";
import { fromErrorInfo } from "./error-info.js";
import type { CorrelationId, OwnerMessage } from "./protocol.js";
import { RpcCorrelator } from "./rpc-correlator.js";
import type { IRpcTransport } from "./transport.js";

type Forwarder = (...args: unknown[]) => Promise<unknown>;

type ChangeCallback = (event: DocumentChangeEvent) => void;

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AbortSignal).aborted === "boolean" &&
    typeof (value as { addEventListener?: unknown }).addEventListener ===
      "function" &&
    // also require removeEventListener — call() attaches a listener it later detaches
    typeof (value as { removeEventListener?: unknown }).removeEventListener ===
      "function"
  );
}

export type ReactorClientProxyOptions = {
  onReload?: (reason: string, workerGen?: string) => void;
  // Document model modules carry reducer/editor functions that cannot cross the
  // worker boundary, so module lookups resolve from this tab-local registry.
  registry?: IDocumentModelRegistry;
};

export function createReactorClientProxy(
  transport: IRpcTransport,
  options: ReactorClientProxyOptions = {},
): IReactorClient {
  const registry = options.registry;
  const subscribers = new Map<CorrelationId, ChangeCallback>();
  // No timeout: the main reactor RPC has long-running calls; teardown on worker
  // death is handled by the heartbeat + reconnect, not a per-call timer.
  const correlator = new RpcCorrelator(transport, {
    prefix: "c",
    transform: rehydrate,
  });

  function fetchPage(token: string): Promise<unknown> {
    return correlator.request((id) => ({ k: "page", id, token }));
  }

  function rehydrate(value: unknown): unknown {
    if (
      value !== null &&
      typeof value === "object" &&
      typeof (value as { nextToken?: unknown }).nextToken === "string"
    ) {
      const token = (value as { nextToken: string }).nextToken;
      const result: Record<string, unknown> = {
        ...(value as Record<string, unknown>),
      };
      delete result.nextToken;
      result.next = () => fetchPage(token);
      return result;
    }
    return value;
  }

  transport.onMessage((message) => {
    const msg = message as OwnerMessage;
    if (correlator.handleMessage(msg)) {
      return;
    }
    if (msg.k === "err") {
      // err not claimed by a pending request: a failed subscription. Surface it
      // and drop the dead subscriber rather than leaving the caller "subscribed".
      if (subscribers.delete(msg.id)) {
        console.error("Reactor subscription failed:", fromErrorInfo(msg.error));
      }
      return;
    }
    if (msg.k === "reload") {
      options.onReload?.(msg.reason, msg.workerGen);
      return;
    }
    if (msg.k === "event") {
      subscribers.get(msg.id)?.(msg.change as DocumentChangeEvent);
    }
  });

  const call = (method: string, args: unknown[]): Promise<unknown> => {
    let abortAt: number | undefined;
    for (let i = 0; i < args.length; i++) {
      if (isAbortSignal(args[i])) {
        abortAt = i;
      }
    }
    let wire = args;
    if (abortAt !== undefined) {
      wire = args.slice();
      wire[abortAt] = undefined;
    }
    return correlator.request(
      (id) => ({ k: "req", id, method, args: wire, abortAt }),
      (id) => {
        if (abortAt === undefined) {
          return;
        }
        const signal = args[abortAt] as AbortSignal;
        const sendAbort = () => transport.post({ k: "abort", targetId: id });
        if (signal.aborted) {
          sendAbort();
          return;
        }
        signal.addEventListener("abort", sendAbort, { once: true });
        return () => signal.removeEventListener("abort", sendAbort);
      },
    );
  };

  const subscribe = (
    search: SearchFilter,
    callback: ChangeCallback,
    view?: ViewFilter,
  ): (() => void) => {
    const id = correlator.nextId();
    subscribers.set(id, callback);
    transport.post({ k: "sub", id, search, view });
    return () => {
      subscribers.delete(id);
      transport.post({ k: "unsub", id });
    };
  };

  const forwarders = new Map<string, Forwarder>();
  const forwarder = (method: string): Forwarder => {
    let fn = forwarders.get(method);
    if (!fn) {
      fn = (...args: unknown[]) => call(method, args);
      forwarders.set(method, fn);
    }
    return fn;
  };

  const drives = new Proxy(
    {},
    {
      get: (_target, prop) =>
        typeof prop === "string" ? forwarder(`drives.${prop}`) : undefined,
    },
  );

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (typeof prop !== "string" || prop === "then") {
        return undefined;
      }
      if (prop === "drives") {
        return drives;
      }
      if (prop === "subscribe") {
        return subscribe;
      }
      if (registry) {
        if (prop === "getDocumentModelModule") {
          return (documentType: string) =>
            Promise.resolve().then(() => registry.getModule(documentType));
        }
        if (prop === "getDocumentModelModules") {
          return (_namespace?: string, paging?: PagingOptions) =>
            Promise.resolve({
              results: registry.getAllModules(),
              options: paging ?? { cursor: "", limit: Number.MAX_SAFE_INTEGER },
            });
        }
      }
      return forwarder(prop);
    },
  };

  return new Proxy({}, handler) as unknown as IReactorClient;
}
