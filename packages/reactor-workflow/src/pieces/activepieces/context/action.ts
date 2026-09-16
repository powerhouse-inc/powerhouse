// Our ActionContext → their ActionContext (doc 06 §2.8). Implements the top usage
// tier (propsValue, auth, store, connections); the rest throws loudly, named.
import { throwingStub, withTouchTracking } from "./stubs.js";
import { jsonSafe } from "../worker/json-safe.js";
import { normalizeStoreScope, type StoreScopeName } from "./store-scope.js";
import type { ApFilesService } from "./files.js";
import type { ConnectionsProvider } from "./props.js";
import type {
  BaseContext,
  ConnectionsManager,
  ExecutionType,
  FilesService,
  FlowsContext,
  InputPropertyMap,
  OutputContext,
  ReactorService,
  RunContext,
  ServerContext,
  StepContext,
  Store,
  TagsManager,
} from "@powerhousedao/pieces-framework";

export { UnsupportedContextMemberError } from "./stubs.js";

// The scope travels beside the key rather than inside it: which partition a
// key belongs to is the host's decision, not a naming convention.

// The host's half of the framework's Store, with its generics dropped: a
// durable store round-trips through JSON, so nothing comes back as the T put in.
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
  files?: ApFilesService;
  connections?: ConnectionsProvider;
  // ctx.output.update, the piece's own progress report. Omitted, the member
  // throws, so a piece that depends on it fails by name rather than silently.
  output?: { update(output: unknown): Promise<void> };
  // ctx.reactor. Served only to a piece the host loaded from an installed
  // reactor package; for every other piece the member throws by name.
  reactor?: ReactorService;
  executionType?: `${ExecutionType}`;
  identity?: ActionContextIdentity;
  onTouch?: (member: string) => void;
}

// Shape of the context we hand to `action.run()`: the framework's ActionContext
// member for member. Those beyond the implemented tier throw, named.
export interface BuiltApActionContext {
  executionType: `${ExecutionType}`;
  auth: unknown;
  propsValue: Record<string, unknown>;
  store: Store;
  connections: ConnectionsManager;
  tags: TagsManager;
  server: ServerContext;
  files: FilesService;
  output: OutputContext;
  reactor: ReactorService;
  // Carried by the framework's own test double but absent from its types.
  agent: { tools: unknown[] };
  run: RunContext;
  project: BaseContext<undefined, InputPropertyMap>["project"];
  flows: FlowsContext;
  step: StepContext;
  generateResumeUrl(params: {
    queryParams: Record<string, string>;
    sync?: boolean;
  }): string;
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
    reactor: options.reactor ?? throwingStub("reactor"),
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
