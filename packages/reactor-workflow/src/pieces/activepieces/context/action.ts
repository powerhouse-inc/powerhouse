// Our ActionContext → their ActionContext (doc 06 §2.8). Implements the top usage
// tier (propsValue, auth, store); every other capability throws loudly, named.

export interface KeyValueStore {
  put(key: string, value: unknown): Promise<unknown>;
  get(key: string): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export class InMemoryKeyValueStore implements KeyValueStore {
  private readonly entries = new Map<string, unknown>();

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

export class UnsupportedContextMemberError extends Error {
  readonly member: string;

  constructor(member: string) {
    super(
      `Piece used unimplemented context member "${member}". ` +
        `Implement it in the adapter or reject the piece at conformance time.`,
    );
    this.name = "UnsupportedContextMemberError";
    this.member = member;
  }
}

// Traps calls and member reads so both `ctx.files.write(...)` and
// `ctx.server.apiUrl` throw with the full member path.
function throwingStub(memberPath: string): unknown {
  return new Proxy(function stub() {}, {
    get(_target, prop) {
      // `then` and symbols stay inert so `await`/inspection don't false-trip.
      if (typeof prop !== "string" || prop === "then") return undefined;
      throw new UnsupportedContextMemberError(`${memberPath}.${prop}`);
    },
    apply() {
      throw new UnsupportedContextMemberError(memberPath);
    },
  });
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
      put: (key: string, value: unknown) => store.put(key, value),
      get: (key: string) => store.get(key),
      delete: (key: string) => store.delete(key),
    },
    connections: throwingStub("connections"),
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

  const context = new Proxy(base, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop !== "then") {
        const member = prop in target ? prop : `UNDOCUMENTED:${prop}`;
        touched.add(member);
        options.onTouch?.(member);
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });

  return { context: context as unknown as BuiltApActionContext, touched };
}
