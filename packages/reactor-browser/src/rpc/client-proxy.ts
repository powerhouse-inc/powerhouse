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
import type { IRpcTransport } from "./transport.js";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  cleanup?: () => void;
};

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
  let counter = 0;
  const nextId = (): CorrelationId => `c${++counter}`;
  const pending = new Map<CorrelationId, Pending>();
  const subscribers = new Map<CorrelationId, ChangeCallback>();

  const fetchPage = (token: string): Promise<unknown> => {
    const id = nextId();
    const promise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    transport.post({ k: "page", id, token });
    return promise;
  };

  const rehydrate = (value: unknown): unknown => {
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
  };

  transport.onMessage((message) => {
    const msg = message as OwnerMessage;
    if (msg.k === "res") {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        entry.cleanup?.();
        entry.resolve(rehydrate(msg.value));
      }
      return;
    }
    if (msg.k === "err") {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        entry.cleanup?.();
        entry.reject(fromErrorInfo(msg.error));
        return;
      }
      // err for a subscription id: surface it and drop the dead subscriber.
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
    const id = nextId();
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
    const promise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    transport.post({ k: "req", id, method, args: wire, abortAt });
    if (abortAt !== undefined) {
      const signal = args[abortAt] as AbortSignal;
      const sendAbort = () => transport.post({ k: "abort", targetId: id });
      if (signal.aborted) {
        sendAbort();
      } else {
        signal.addEventListener("abort", sendAbort, { once: true });
        const entry = pending.get(id);
        if (entry) {
          entry.cleanup = () => signal.removeEventListener("abort", sendAbort);
        }
      }
    }
    return promise;
  };

  const subscribe = (
    search: SearchFilter,
    callback: ChangeCallback,
    view?: ViewFilter,
  ): (() => void) => {
    const id = nextId();
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
