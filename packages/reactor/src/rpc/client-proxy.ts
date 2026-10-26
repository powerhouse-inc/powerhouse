import type { DocumentChangeEvent, IReactorClient } from "../client/types.js";
import type { IDocumentModelRegistry } from "../registry/index.js";
import type {
  ConsistencyToken,
  JobInfo,
  PagingOptions,
  SearchFilter,
  ViewFilter,
} from "../shared/types.js";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { normalizeDocumentModelVersion } from "@powerhousedao/shared/document-model/version";
import { fromErrorInfo } from "./error-info.js";
import type { MessageRouter } from "./message-router.js";
import { rehydratePage } from "./paging.js";
import { createCorrelatedSubscriptions } from "./subscription.js";
import { RemoteWriteHandles } from "./write-handles.js";

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

  // A write's handles are rebuilt tab-side over the read half's methods; see
  // rpc/write-handles.ts for how each stage is waited for.
  const remoteHandles = new RemoteWriteHandles({
    waitForJob: (jobId, signal) =>
      call("read.waitForJob", [jobId, signal]) as Promise<JobInfo>,
    getJobStatus: (jobId, signal) =>
      call("read.getJobStatus", [jobId, signal]) as Promise<JobInfo>,
    get: <TDocument extends PHDocument>(
      identifier: string,
      view: ViewFilter | undefined,
      signal: AbortSignal | undefined,
      consistencyToken: ConsistencyToken | undefined,
    ) =>
      call("read.get", [
        identifier,
        view,
        signal,
        consistencyToken,
      ]) as Promise<TDocument>,
  });

  const writeForwarders = new Map<string, Forwarder>();
  const writeForwarder = (method: string): Forwarder => {
    let fn = writeForwarders.get(method);
    if (!fn) {
      fn = async (...args: unknown[]) => {
        const signal = args.find(isAbortSignal);
        const value = await call(method, args);
        return remoteHandles.fromWire(value, signal);
      };
      writeForwarders.set(method, fn);
    }
    return fn;
  };

  /** Module lookups answered from the tab's registry, when it has one. */
  const registryMethod = (prop: string): unknown => {
    if (!registry) {
      return undefined;
    }
    if (prop === "getDocumentModelModule") {
      return (documentType: string) =>
        Promise.resolve().then(() => registry.getModule(documentType));
    }
    if (prop === "getDocumentModelModuleForDocument") {
      return (document: PHDocument) =>
        Promise.resolve().then(() =>
          registry.getModule(
            document.header.documentType,
            normalizeDocumentModelVersion(
              (document.state as Partial<typeof document.state>).document
                ?.version,
            ),
          ),
        );
    }
    if (prop === "getDocumentModelModules") {
      return (_namespace?: string, paging?: PagingOptions) =>
        Promise.resolve({
          results: registry.getAllModules(),
          options: paging ?? { cursor: "", limit: Number.MAX_SAFE_INTEGER },
        });
    }
    return undefined;
  };

  const drivesOf = (prefix: string, forward: (method: string) => Forwarder) =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          typeof prop === "string"
            ? forward(`${prefix}drives.${prop}`)
            : undefined,
      },
    );

  const drives = drivesOf("", forwarder);

  /**
   * One half of the client, served as `read.*` or `write.*` methods. The read
   * half shares the facade's subscription and registry lookups; the write
   * half's results come back with their handles rebuilt.
   */
  const half = (name: "read" | "write"): unknown => {
    const forward = name === "write" ? writeForwarder : forwarder;
    const halfDrives = drivesOf(`${name}.`, forward);
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (typeof prop !== "string" || prop === "then") {
            return undefined;
          }
          if (prop === "drives") {
            return halfDrives;
          }
          if (name === "read") {
            if (prop === "subscribe") {
              return subscribe;
            }
            const local = registryMethod(prop);
            if (local !== undefined) {
              return local;
            }
          }
          return forward(`${name}.${prop}`);
        },
      },
    );
  };
  const read = half("read");
  const write = half("write");

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (typeof prop !== "string" || prop === "then") {
        return undefined;
      }
      if (prop === "drives") {
        return drives;
      }
      if (prop === "read") {
        return read;
      }
      if (prop === "write") {
        return write;
      }
      if (prop === "subscribe") {
        return subscribe;
      }
      const local = registryMethod(prop);
      if (local !== undefined) {
        return local;
      }
      return forwarder(prop);
    },
  };

  return new Proxy({}, handler) as unknown as IReactorClient;
}
