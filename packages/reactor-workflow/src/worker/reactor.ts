// `ctx.reactor` in the piece child: a reactor RPC proxy per request, with a
// local registry fed by the host's manifest and, on a miss, a host lookup.
import {
  DocumentModelUnavailableError,
  ReactorAccessDeniedError,
  ReactorRequestClosedError,
  type ReactorClient,
  type ReactorReadClient,
  type RequireReactor,
} from "@powerhousedao/pieces-framework";
import type {
  IDocumentModelRegistry,
  IReactorClient,
  ModelManifestEntry,
} from "@powerhousedao/reactor";
import type {
  createReactorClientProxy,
  IRpcTransport,
  MessageRouter,
  RpcMessage,
} from "@powerhousedao/reactor/rpc";
import type { DocumentModelModule, PHDocument } from "document-model";
import { flushCompileCache } from "node:module";
import { callHost } from "../pieces/activepieces/worker/host-call.js";
import {
  MODEL_ENTRIES,
  MODEL_MANIFEST,
  REACTOR_RPC,
  type ModelEntriesPayload,
  type ModelManifestMessage,
  type ReactorRequestBinding,
} from "../pieces/activepieces/worker/protocol.js";
import {
  installReactorProvider,
  type WorkerReactorSession,
} from "../pieces/activepieces/worker/reactor-provider.js";
import { isReactorRpcEnvelope } from "../pieces/activepieces/worker/reactor-rpc.js";
import { timed } from "../pieces/activepieces/worker/timings.js";

function named(name: string, message: string, cause?: unknown): Error {
  const error = new Error(message, cause === undefined ? {} : { cause });
  error.name = name;
  return error;
}

// --- Model manifest ------------------------------------------------------

const manifest = new Map<string, ModelManifestEntry[]>();
// Per document type; dropped when a new entry for the type arrives.
const loading = new Map<string, Promise<void>>();
// Host lookups in flight, per type; `undefined` asks for every entry.
const lookups = new Map<string | undefined, Promise<void>>();

function isManifestEntry(value: unknown): value is ModelManifestEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.documentType === "string" &&
    typeof entry.spec === "object" &&
    entry.spec !== null
  );
}

export function addManifestEntries(entries: unknown[]): void {
  for (const entry of entries) {
    if (!isManifestEntry(entry)) continue;
    const known = manifest.get(entry.documentType) ?? [];
    if (known.some((other) => other.version === entry.version)) continue;
    manifest.set(entry.documentType, [...known, entry]);
    loading.delete(entry.documentType);
  }
}

// Misses are not cached: the host may load the type before the next lookup.
function lookUpEntries(documentType?: string): Promise<void> {
  let pending = lookups.get(documentType);
  if (!pending) {
    const payload: ModelEntriesPayload =
      documentType === undefined ? {} : { documentType };
    pending = callHost<unknown>(MODEL_ENTRIES, payload)
      .then((entries) => {
        if (Array.isArray(entries)) addManifestEntries(entries);
      })
      .finally(() => lookups.delete(documentType));
    lookups.set(documentType, pending);
  }
  return pending;
}

function isManifestMessage(value: unknown): value is ModelManifestMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === MODEL_MANIFEST &&
    Array.isArray((value as { entries?: unknown }).entries)
  );
}

// --- Reactor runtime, imported on first use ------------------------------

interface Runtime {
  rpc: {
    MessageRouter: typeof MessageRouter;
    createReactorClientProxy: typeof createReactorClientProxy;
  };
  loadSpec: (spec: ModelManifestEntry["spec"]) => Promise<DocumentModelModule>;
  registry: IDocumentModelRegistry;
  versionOf: (document: PHDocument) => number;
}

let runtime: Promise<Runtime> | undefined;

function reactorRuntime(): Promise<Runtime> {
  // Deep entries, not the package barrels, which load storage, zod and crypto.
  runtime ??= Promise.all([
    import("@powerhousedao/reactor/rpc"),
    import("@powerhousedao/shared/document-model/version"),
  ]).then(([rpc, model]) => {
    // Persisted now: the child is SIGKILLed, never exiting cleanly.
    flushCompileCache();
    return {
      rpc,
      loadSpec: rpc.loadDocumentModelSpec,
      registry: new rpc.DocumentModelRegistry(),
      // The version the reactor resolves a document's module by.
      versionOf: (document: PHDocument) =>
        model.normalizeDocumentModelVersion(
          (document.state as Partial<PHDocument["state"]>).document?.version,
        ),
    };
  });
  return runtime;
}

function unavailable(documentType: string, cause?: unknown): Error {
  return named(
    DocumentModelUnavailableError,
    cause === undefined
      ? `No document model for "${documentType}" is available to this piece`
      : `The document model for "${documentType}" could not be loaded: ${cause instanceof Error ? cause.message : JSON.stringify(cause)}`,
    cause,
  );
}

// Asks the host when the type, or the version a document needs, is not local.
// Timed only when it starts a lookup or an import, not on every call.
function ensureType(
  rt: Runtime,
  documentType: string,
  version?: number,
): Promise<void> {
  const load = () => loadType(rt, documentType, version);
  return missingLocally(documentType, version) || !loading.has(documentType)
    ? timed("models", load, { "document.type": documentType })
    : load();
}

function missingLocally(documentType: string, version?: number): boolean {
  const local = manifest.get(documentType) ?? [];
  return (
    local.length === 0 ||
    (version !== undefined &&
      !local.some((entry) => entry.version === String(version)))
  );
}

async function loadType(
  rt: Runtime,
  documentType: string,
  version?: number,
): Promise<void> {
  if (missingLocally(documentType, version)) {
    try {
      await lookUpEntries(documentType);
    } catch (error) {
      throw unavailable(documentType, error);
    }
  }
  const entries = manifest.get(documentType);
  if (!entries || entries.length === 0) throw unavailable(documentType);
  let pending = loading.get(documentType);
  if (!pending) {
    pending = Promise.all(entries.map((entry) => rt.loadSpec(entry.spec))).then(
      (modules) => {
        // Duplicates of versions already registered are skipped.
        rt.registry.registerModules(...modules);
      },
    );
    loading.set(documentType, pending);
    pending.catch(() => {
      if (loading.get(documentType) === pending) loading.delete(documentType);
    });
  }
  try {
    await pending;
  } catch (error) {
    throw unavailable(documentType, error);
  }
}

function moduleOf(
  documentType: string,
  lookup: () => Promise<DocumentModelModule>,
): Promise<DocumentModelModule> {
  return lookup().catch((error: unknown) => {
    if (error instanceof Error && error.name === "ModuleNotFoundError") {
      throw unavailable(documentType);
    }
    throw error;
  });
}

// --- One request ---------------------------------------------------------

function processTransport(requestId: string): IRpcTransport {
  let closed = false;
  const detachers = new Set<() => void>();
  return {
    post(message: RpcMessage) {
      if (closed) throw requestClosed();
      process.send?.({ type: REACTOR_RPC, requestId, message });
    },
    onMessage(listener) {
      const handler = (value: unknown) => {
        if (closed || !isReactorRpcEnvelope(value, requestId)) return;
        listener(value.message as RpcMessage);
      };
      process.on("message", handler);
      const detach = () => {
        process.off("message", handler);
        detachers.delete(detach);
      };
      detachers.add(detach);
      return detach;
    },
    close() {
      closed = true;
      for (const detach of [...detachers]) detach();
    },
  };
}

function requestClosed(): Error {
  return named(
    ReactorRequestClosedError,
    "This ctx.reactor belongs to a step that has finished; use the ctx.reactor of the running step",
  );
}

type AnyMethod = (...args: unknown[]) => unknown;

// Calls fail with ReactorRequestClosedError once the request settles, pages too.
class RequestGuard {
  private closed = false;
  private rejectClosed: (error: Error) => void = () => undefined;
  private readonly whenClosed = new Promise<never>((_, reject) => {
    this.rejectClosed = reject;
  });

  constructor() {
    this.whenClosed.catch(() => undefined);
  }

  call<T>(run: () => Promise<T> | T): Promise<T> {
    if (this.closed) return Promise.reject(requestClosed());
    let result: Promise<T>;
    try {
      result = Promise.resolve(run());
    } catch (error) {
      return Promise.reject(error as Error);
    }
    return Promise.race([
      result.then((value) => this.paged(value)),
      this.whenClosed,
    ]);
  }

  close(): void {
    this.closed = true;
    this.rejectClosed(requestClosed());
  }

  private paged<T>(value: T): T {
    if (typeof value !== "object" || value === null) return value;
    const next = (value as { next?: unknown }).next;
    if (typeof next !== "function") return value;
    return {
      ...value,
      next: () => this.call(() => (next as AnyMethod).call(value)),
    };
  }
}

function sessionClient(
  rt: Runtime,
  proxy: IReactorClient,
  guard: RequestGuard,
): ReactorClient {
  const local: Record<string, AnyMethod> = {
    getDocumentModelModule: (documentType) =>
      guard.call(async () => {
        const type = String(documentType);
        await ensureType(rt, type);
        return moduleOf(type, () => proxy.getDocumentModelModule(type));
      }),
    getDocumentModelModuleForDocument: (document) =>
      guard.call(async () => {
        const type = (document as PHDocument).header.documentType;
        await ensureType(rt, type, rt.versionOf(document as PHDocument));
        return moduleOf(type, () =>
          proxy.getDocumentModelModuleForDocument(document as PHDocument),
        );
      }),
    getDocumentModelModules: (namespace, paging) =>
      guard.call(async () => {
        await lookUpEntries();
        // A type that fails to load is left out of the listing, not fatal.
        for (const documentType of manifest.keys()) {
          await ensureType(rt, documentType).catch((error: unknown) => {
            console.warn(error instanceof Error ? error.message : error);
          });
        }
        return proxy.getDocumentModelModules(
          namespace as string | undefined,
          paging as never,
        );
      }),
    subscribe: () => {
      throw named(
        ReactorAccessDeniedError,
        'Reactor method "subscribe" is not offered to pieces',
      );
    },
  };
  // Every listed method resolves through `get`.
  return new Proxy({} as ReactorClient, {
    get: (_target, prop) => {
      if (typeof prop !== "string" || prop === "then") return undefined;
      // Not on the piece surface; drive reads take no subject.
      if (prop === "drives") return undefined;
      if (prop in local) return local[prop];
      return (...args: unknown[]) =>
        guard.call(() =>
          (proxy as unknown as Record<string, AnyMethod>)[prop](...args),
        );
    },
  });
}

async function openSession(
  binding: ReactorRequestBinding,
  requireReactor: RequireReactor,
): Promise<WorkerReactorSession> {
  const rt = await reactorRuntime();
  const transport = processTransport(binding.requestId);
  const router = new rt.rpc.MessageRouter("w");
  router.attach(transport);
  const proxy = rt.rpc.createReactorClientProxy(router, {
    registry: rt.registry,
  });
  const guard = new RequestGuard();
  const client = sessionClient(rt, proxy, guard);
  const close = () => {
    guard.close();
    router.detach();
    transport.close();
  };
  // The host refuses a write a read declaration makes; the type says so first.
  return requireReactor === "write"
    ? { requireReactor, client, close }
    : { requireReactor, client: client as ReactorReadClient, close };
}

let installed = false;

// Before the first request: the boot manifest is sent as the child forks.
export function installWorkerReactor(): void {
  if (installed) return;
  installed = true;
  process.on("message", (message: unknown) => {
    if (isManifestMessage(message)) addManifestEntries(message.entries);
  });
  installReactorProvider(openSession);
}
