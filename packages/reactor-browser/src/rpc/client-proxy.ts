import type {
  DocumentChangeEvent,
  IDocumentModelRegistry,
  IReactorClient,
  PagingOptions,
  SearchFilter,
  ViewFilter,
} from "@powerhousedao/reactor";
import { fromErrorInfo } from "./error-info.js";
import type { MessageRouter } from "./message-router.js";
import { rehydratePage } from "./paging.js";
import { createCorrelatedSubscriptions } from "./subscription.js";

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
  /** Tab-local registry for module lookups (reducers/editors can't cross the worker boundary). */
  registry?: IDocumentModelRegistry;
};

export function createReactorClientProxy(
  router: MessageRouter,
  options: ReactorClientProxyOptions = {},
): IReactorClient {
  const registry = options.registry;

  function fetchPage(token: string): Promise<unknown> {
    return router.request((id) => ({ k: "page", id, token }), {
      transform: rehydrate,
    });
  }

  function rehydrate(value: unknown): unknown {
    return rehydratePage(value, fetchPage);
  }

  const changeSubs = createCorrelatedSubscriptions<
    ChangeCallback,
    "event",
    "sub-err"
  >(router, {
    idPrefix: "sub",
    eventKind: "event",
    errKind: "sub-err",
    onEvent: (callback, msg) => callback(msg.change as DocumentChangeEvent),
    onError: (_callback, msg) =>
      console.error("Reactor subscription failed:", fromErrorInfo(msg.error)),
    close: (id) => ({ k: "unsub", id }),
  });
  router.on("reload", (msg) => {
    options.onReload?.(msg.reason, msg.workerGen);
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
    return router.request(
      (id) => ({ k: "req", id, method, args: wire, abortAt }),
      {
        transform: rehydrate,
        setup: (id) => {
          if (abortAt === undefined) {
            return;
          }
          const signal = args[abortAt] as AbortSignal;
          const sendAbort = () => router.post({ k: "abort", targetId: id });
          if (signal.aborted) {
            sendAbort();
            return;
          }
          signal.addEventListener("abort", sendAbort, { once: true });
          return () => signal.removeEventListener("abort", sendAbort);
        },
      },
    );
  };

  const subscribe = (
    search: SearchFilter,
    callback: ChangeCallback,
    view?: ViewFilter,
  ): (() => void) =>
    changeSubs.subscribe(callback, (id) => ({ k: "sub", id, search, view }));

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
