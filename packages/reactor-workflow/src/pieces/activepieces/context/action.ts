// Our ActionContext → their ActionContext (doc 06 §2.8). Implements the top usage
// tier (propsValue, auth, store, connections); the rest throws loudly, named.
import { throwingStub, withTouchTracking } from "./stubs.js";
import { jsonSafe } from "../worker/json-safe.js";
import { normalizeStoreScope, type StoreScopeName } from "./store-scope.js";
import type { ActionFilesService } from "./files.js";
import type { ConnectionsProvider } from "./props.js";

export { UnsupportedContextMemberError } from "./stubs.js";

// The scope travels beside the key rather than inside it: which partition a
// key belongs to is the host's decision, not a naming convention.

// Values are JSON-shaped by contract: a durable store round-trips them through
// JSON, so nothing may rely on a Date or a Map surviving a put.
export interface KeyValueStore {
  put(key: string, value: unknown, scope?: StoreScopeName): Promise<unknown>;
  get(key: string, scope?: StoreScopeName): Promise<unknown>;
  delete(key: string, scope?: StoreScopeName): Promise<void>;
}

// In-memory connection registry: key → resolved connection value.
export class InMemoryConnectionsProvider implements ConnectionsProvider {
  private readonly values: Map<string, unknown>;

  constructor(values: Record<string, unknown> = {}) {
    this.values = new Map(Object.entries(values));
  }

  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.values.get(key) ?? null);
  }
}

export class InMemoryKeyValueStore implements KeyValueStore {
  private readonly entries: Map<string, unknown>;

  constructor(seed: Record<string, unknown> = {}) {
    this.entries = new Map(Object.entries(seed));
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.entries);
  }

  // Flattened like the durable store, so the heap fallback is not the one
  // place a Date survives a put.
  put(key: string, value: unknown, scope?: StoreScopeName): Promise<unknown> {
    const stored = jsonSafe(value);
    this.entries.set(this.scoped(key, scope), stored);
    return Promise.resolve(stored);
  }

  get(key: string, scope?: StoreScopeName): Promise<unknown> {
    return Promise.resolve(this.entries.get(this.scoped(key, scope)) ?? null);
  }

  delete(key: string, scope?: StoreScopeName): Promise<void> {
    this.entries.delete(this.scoped(key, scope));
    return Promise.resolve();
  }

  // One heap, so the scopes share it and are kept apart by name.
  private scoped(key: string, scope?: StoreScopeName): string {
    return scope === "PROJECT" ? `PROJECT:${key}` : key;
  }
}

export interface ActionContextIdentity {
  runId?: string;
  projectId?: string;
  flowId?: string;
  flowVersionId?: string;
  stepName?: string;
}

export interface ActionContextOptions {
  propsValue: Record<string, unknown>;
  auth?: unknown;
  store?: KeyValueStore;
  // ctx.files for actions. Mirrors the option triggers already accept; when
  // omitted the member keeps throwing, so a piece that needs files fails
  // loudly rather than silently dropping them.
  files?: ActionFilesService;
  connections?: ConnectionsProvider;
  // ctx.output.update, the piece's own progress report. Omitted, the member
  // throws, so a piece that depends on it fails by name rather than silently.
  output?: { update(output: unknown): Promise<void> };
  executionType?: "BEGIN" | "RESUME";
  identity?: ActionContextIdentity;
  onTouch?: (member: string) => void;
}

// Shape of the context we hand to `action.run()`. Members beyond the
// implemented tier exist but throw UnsupportedContextMemberError when used.
export interface BuiltApActionContext {
  executionType: "BEGIN" | "RESUME";
  auth: unknown;
  propsValue: Record<string, unknown>;
  store: KeyValueStore;
  connections: { get(key: string): Promise<unknown> };
  tags: { add(tag: unknown): Promise<void> };
  server: { apiUrl: string; publicUrl: string; token: string };
  files: { write(file: unknown): Promise<string> };
  output: { update(output: unknown): Promise<void> };
  agent: { tools: unknown[] };
  run: {
    id: string;
    stop(request?: unknown): void;
    pause(request?: unknown): void;
    respond(request?: unknown): void;
  };
  project: { id: string; externalId(): Promise<string> };
  flows: {
    list(): Promise<unknown>;
    current: { id: string; version: { id: string } };
  };
  step: { name: string };
  generateResumeUrl(params?: unknown): string;
}

export interface ActionContextHandle {
  context: BuiltApActionContext;
  // Top-level members the piece read; `UNDOCUMENTED:<name>` marks unknown reads.
  touched: ReadonlySet<string>;
}

export function buildActionContext(
  options: ActionContextOptions,
): ActionContextHandle {
  const { identity = {} } = options;
  const store = options.store ?? new InMemoryKeyValueStore();
  const touched = new Set<string>();

  const base: Record<string, unknown> = {
    executionType: options.executionType ?? "BEGIN",
    auth: options.auth,
    propsValue: options.propsValue,
    store: {
      put: (key: string, value: unknown, scope?: unknown) =>
        store.put(key, value, normalizeStoreScope(scope)),
      get: (key: string, scope?: unknown) =>
        store.get(key, normalizeStoreScope(scope)),
      delete: (key: string, scope?: unknown) =>
        store.delete(key, normalizeStoreScope(scope)),
    },
    connections: options.connections ?? throwingStub("connections"),
    tags: throwingStub("tags"),
    server: throwingStub("server"),
    files: options.files ?? throwingStub("files"),
    output: options.output ?? throwingStub("output"),
    agent: throwingStub("agent"),
    run: {
      id: identity.runId ?? "run",
      stop: throwingStub("run.stop"),
      pause: throwingStub("run.pause"),
      respond: throwingStub("run.respond"),
    },
    project: {
      id: identity.projectId ?? "project",
      externalId: () => Promise.resolve(identity.projectId ?? "project"),
    },
    flows: {
      list: throwingStub("flows.list"),
      current: {
        id: identity.flowId ?? "flow",
        version: { id: identity.flowVersionId ?? "flow-version" },
      },
    },
    step: { name: identity.stepName ?? "step" },
    generateResumeUrl: throwingStub("generateResumeUrl"),
  };

  const context = withTouchTracking(base, touched, options.onTouch);
  return { context: context as unknown as BuiltApActionContext, touched };
}
