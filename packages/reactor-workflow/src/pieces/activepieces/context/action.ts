// Our ActionContext → their ActionContext (doc 06 §2.8). Implements the top usage
// tier (propsValue, auth, store, connections); the rest throws loudly, named.
import { throwingStub, withTouchTracking } from "./stubs.js";
import { jsonSafe } from "../worker/json-safe.js";
import { normalizeStoreScope, type StoreScopeName } from "./store-scope.js";
import type { ApFilesService } from "./files.js";
import type { ConnectionsProvider, FlowsProvider } from "./props.js";
import type { ReactorOption } from "./reactor-option.js";
import { randomBytes } from "node:crypto";
import type {
  CreatedWaitpoint,
  PausedStep,
  RunResponse,
  WaitpointCall,
} from "../worker/protocol.js";
import type {
  BaseContext,
  ConnectionsManager,
  ExecutionType,
  FilesService,
  FlowsContext,
  InputPropertyMap,
  OutputContext,
  ReactorClient,
  ReactorReadClient,
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

export type ActionContextOptions = ActionContextBaseOptions & ReactorOption;

interface ActionContextBaseOptions {
  propsValue: Record<string, unknown>;
  auth?: unknown;
  store?: KeyValueStore;
  // ctx.files for actions. Mirrors the option triggers already accept; when
  // omitted the member keeps throwing, so a piece that needs files fails
  // loudly rather than silently dropping them.
  files?: ApFilesService;
  connections?: ConnectionsProvider;
  // ctx.flows.list and ctx.server; omitted, both throw by name.
  flows?: FlowsProvider;
  server?: ServerContext;
  // ctx.output.update, the piece's own progress report. Omitted, the member
  // throws, so a piece that depends on it fails by name rather than silently.
  output?: { update(output: unknown): Promise<void> };
  // ctx.resumePayload, the delivery that woke a RESUME run. Omitted, the
  // member throws by name instead of reading as undefined.
  resumePayload?: unknown;
  executionType?: `${ExecutionType}`;
  // ctx.run.canPause: whether this run can suspend. False by default.
  canPause?: boolean;
  // Creates a waitpoint on the host; required for canPause to take effect.
  waitpoints?: { create(call: WaitpointCall): Promise<CreatedWaitpoint> };
  // Where resume URLs live; serves the deprecated `generateResumeUrl`.
  resumeBaseUrl?: string;
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
  reactor: ReactorClient | ReactorReadClient;
  // The RESUME branch of the framework's ActionContext promises this
  // (ResumePayload there, a type its entry does not export). Always present,
  // real or throwing, like `reactor`.
  resumePayload: unknown;
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
  // Set once the action asked to suspend the run.
  paused: () => PausedStep | undefined;
  // What `run.respond` / `run.stop` answer a held sync request with.
  response: () => RunResponse | undefined;
  // Set once the action called `run.stop`.
  stopped: () => boolean;
}

export class RunCannotPauseError extends Error {
  constructor(member: string) {
    super(
      `ctx.run.${member} suspends the run, which only a workflow run can do, not a step test`,
    );
    this.name = "RunCannotPauseError";
  }
}

// Activepieces' CreateWaitpointParams, checked before it reaches the host.
function waitpointCall(params: unknown): WaitpointCall {
  const value = (params ?? {}) as Record<string, unknown>;
  if (value.type !== "DELAY" && value.type !== "WEBHOOK") {
    throw new Error(
      `createWaitpoint: type must be DELAY or WEBHOOK, got ${String(value.type)}`,
    );
  }
  const resumeDateTime =
    typeof value.resumeDateTime === "string" ? value.resumeDateTime : undefined;
  if (value.type === "DELAY") {
    if (!resumeDateTime || Number.isNaN(Date.parse(resumeDateTime))) {
      throw new Error("createWaitpoint: a DELAY needs a valid resumeDateTime");
    }
  }
  const response = value.responseToSend as WaitpointCall["responseToSend"];
  return {
    type: value.type,
    ...(resumeDateTime ? { resumeDateTime } : {}),
    ...(response
      ? { responseToSend: jsonSafe(response) as typeof response }
      : {}),
  };
}

// The url a resume link points at, as upstream's buildResumeUrl builds it.
function buildResumeUrl(
  resumeUrl: string,
  params: { queryParams?: Record<string, string>; sync?: boolean },
): string {
  const url = new URL(`${resumeUrl}${params.sync ? "/sync" : ""}`);
  url.search = new URLSearchParams(params.queryParams ?? {}).toString();
  return url.toString();
}

// What a respond or stop call answers with; none answers 200 with `{}`.
function runResponse(params: unknown): RunResponse {
  const response = (params as { response?: unknown } | undefined)?.response;
  return (jsonSafe(response ?? {}) ?? {}) as RunResponse;
}

// ctx.run's suspend, respond and stop members. As upstream's hookResponse,
// the last call wins: a respond after waitForWaitpoint does not pause.
function runHooks(options: ActionContextOptions) {
  const port = options.canPause ? options.waitpoints : undefined;
  let hook:
    | { type: "none" }
    | { type: "respond" | "stopped"; response: RunResponse }
    | { type: "paused"; paused: PausedStep } = { type: "none" };
  // The deprecated generateResumeUrl's token, bound to a `run.pause` waitpoint.
  let legacyToken: string | undefined;
  const assertCanPause = (member: string) => {
    if (!port) throw new RunCannotPauseError(member);
    return port;
  };
  return {
    canPause: port !== undefined,
    paused: () => (hook.type === "paused" ? hook.paused : undefined),
    response: () =>
      hook.type === "respond" || hook.type === "stopped"
        ? hook.response
        : undefined,
    stopped: () => hook.type === "stopped",
    respond: (params?: unknown) => {
      hook = { type: "respond", response: runResponse(params) };
    },
    stop: (params?: unknown) => {
      hook = { type: "stopped", response: runResponse(params) };
    },
    createWaitpoint: async (params: unknown) => {
      const created = await assertCanPause("createWaitpoint").create(
        waitpointCall(params),
      );
      return {
        id: created.id,
        resumeUrl: created.resumeUrl,
        buildResumeUrl: (args: {
          queryParams?: Record<string, string>;
          sync?: boolean;
        }) => buildResumeUrl(created.resumeUrl, args),
      };
    },
    waitForWaitpoint: (waitpointId: string) => {
      assertCanPause("waitForWaitpoint");
      if (typeof waitpointId !== "string" || waitpointId === "") {
        throw new Error("waitForWaitpoint: a waitpoint id is required");
      }
      hook = { type: "paused", paused: { waitpointId } };
    },
    // Deprecated upstream; its metadata maps onto a waitpoint call.
    pause: (
      params: { pauseMetadata?: Record<string, unknown> } | undefined,
    ) => {
      assertCanPause("pause");
      const metadata = params?.pauseMetadata ?? {};
      const pause = waitpointCall({
        type: metadata.type,
        resumeDateTime: metadata.resumeDateTime,
        responseToSend: metadata.response,
      });
      hook = {
        type: "paused",
        paused: legacyToken ? { pause, token: legacyToken } : { pause },
      };
    },
    // Deprecated upstream: a link to the waitpoint a later `run.pause` creates.
    generateResumeUrl: (args: {
      queryParams?: Record<string, string>;
      sync?: boolean;
    }) => {
      assertCanPause("generateResumeUrl");
      if (!options.resumeBaseUrl) {
        throw new Error(
          "generateResumeUrl: this host serves no resume URLs: resume URLs need an HTTP host",
        );
      }
      legacyToken ??= randomBytes(32).toString("base64url");
      if (hook.type === "paused" && "pause" in hook.paused) {
        hook = { ...hook, paused: { ...hook.paused, token: legacyToken } };
      }
      const base = options.resumeBaseUrl.replace(/\/+$/, "");
      return buildResumeUrl(`${base}/${legacyToken}`, args ?? {});
    },
  };
}

export function buildActionContext(
  options: ActionContextOptions,
): ActionContextHandle {
  const { identity = {} } = options;
  const store = options.store ?? new InMemoryKeyValueStore();
  const touched = new Set<string>();
  const hooks = runHooks(options);

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
    server: options.server ?? throwingStub("server"),
    files: options.files ?? throwingStub("files"),
    output: options.output ?? throwingStub("output"),
    reactor: options.reactor ?? throwingStub("reactor"),
    resumePayload: options.resumePayload ?? throwingStub("resumePayload"),
    agent: throwingStub("agent"),
    run: {
      id: identity.runId ?? "run",
      canPause: hooks.canPause,
      stop: hooks.stop,
      pause: hooks.pause,
      respond: hooks.respond,
      createWaitpoint: hooks.createWaitpoint,
      waitForWaitpoint: hooks.waitForWaitpoint,
    },
    project: {
      id: identity.projectId ?? "project",
      externalId: () => Promise.resolve(identity.projectId ?? "project"),
    },
    flows: {
      list: options.flows
        ? options.flows.list.bind(options.flows)
        : throwingStub("flows.list"),
      current: {
        id: identity.flowId ?? "flow",
        version: { id: identity.flowVersionId ?? "flow-version" },
      },
    },
    step: { name: identity.stepName ?? "step" },
    generateResumeUrl: hooks.generateResumeUrl,
  };

  const context = withTouchTracking(base, touched, options.onTouch);
  return {
    context: context as unknown as BuiltApActionContext,
    touched,
    paused: hooks.paused,
    response: hooks.response,
    stopped: hooks.stopped,
  };
}
