// Our ActionContext → their ActionContext (doc 06 §2.8). Implements the top usage
// tier (propsValue, auth, store, connections); the rest throws loudly, named.
import { throwingStub, withTouchTracking } from "./stubs.js";
import type { ConnectionsProvider } from "./props.js";

export { UnsupportedContextMemberError } from "./stubs.js";

export interface KeyValueStore {
  put(key: string, value: unknown): Promise<unknown>;
  get(key: string): Promise<unknown>;
  delete(key: string): Promise<void>;
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

  put(key: string, value: unknown): Promise<unknown> {
    this.entries.set(key, value);
    return Promise.resolve(value);
  }

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.entries.get(key) ?? null);
  }

  delete(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
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
  connections?: ConnectionsProvider;
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

  // Their Store takes an optional StoreScope (COLLECTION/PROJECT/FLOW) per call.
  const scoped = (key: string, scope?: unknown) =>
    typeof scope === "string" ? `${scope}:${key}` : key;

  const base: Record<string, unknown> = {
    executionType: options.executionType ?? "BEGIN",
    auth: options.auth,
    propsValue: options.propsValue,
    store: {
      put: (key: string, value: unknown, scope?: unknown) =>
        store.put(scoped(key, scope), value),
      get: (key: string, scope?: unknown) => store.get(scoped(key, scope)),
      delete: (key: string, scope?: unknown) =>
        store.delete(scoped(key, scope)),
    },
    connections: options.connections ?? throwingStub("connections"),
    tags: throwingStub("tags"),
    server: throwingStub("server"),
    files: throwingStub("files"),
    output: throwingStub("output"),
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
