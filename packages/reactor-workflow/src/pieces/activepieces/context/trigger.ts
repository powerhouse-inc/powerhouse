// Our TriggerHookContext → theirs (doc 06 §2.8): one builder covering the
// strategy variants; identity/payload as data, capabilities injected or stubbed.
import { DEDUPE_KEY_PROPERTY, type ApTrigger } from "../types.js";
import {
  InMemoryKeyValueStore,
  type ActionContextIdentity,
  type KeyValueStore,
} from "./action.js";
import type {
  ConnectionsProvider,
  FlowsProvider,
  ServerInfo,
} from "./props.js";
import { normalizeStoreScope, type StoreScopeName } from "./store-scope.js";
import { throwingStub, withTouchTracking } from "./stubs.js";

export interface RecordedSchedule {
  cronExpression: string;
  timezone?: string;
}

export interface RecordedListener {
  events: string[];
  identifierValue: string;
}

export interface TriggerFilesService {
  write(file: { fileName?: string; data: Buffer }): Promise<string>;
}

export interface TriggerContextOptions {
  propsValue: Record<string, unknown>;
  auth?: unknown;
  store?: KeyValueStore;
  // "test" for test hooks so they never touch the live cursor; "" otherwise.
  // Ignored when hostPartitionedStore is set — the host separates them there.
  storePrefix?: string;
  // The store partitions on (scope, key) itself, so the key reaches it
  // verbatim instead of carrying the scope as a name prefix. See scopedKey.
  hostPartitionedStore?: boolean;
  identity?: ActionContextIdentity;
  // onEnable: an unchanged trigger re-enabling; pollingHelper keeps its cursor.
  isRepublish?: boolean;
  // WEBHOOK / APP_WEBHOOK: the incoming request; also handed to test runs.
  payload?: unknown;
  webhookUrl?: string;
  flows?: FlowsProvider;
  connections?: ConnectionsProvider;
  server?: ServerInfo;
  // run/test hooks only per the AP contract; omitted members throw, named.
  files?: TriggerFilesService;
  onTouch?: (member: string) => void;
}

export interface BuiltApTriggerContext {
  auth: unknown;
  propsValue: Record<string, unknown>;
  store: KeyValueStore;
  isRepublish: boolean;
  flows: FlowsProvider & { current: { id: string; version: { id: string } } };
  step: { name: string };
  project: { id: string; externalId(): Promise<string> };
  connections: ConnectionsProvider;
  server: ServerInfo;
  webhookUrl: string;
  payload: unknown;
  setSchedule(schedule: RecordedSchedule): void;
  app: { createListeners(listener: RecordedListener): void };
  files: { write(file: unknown): Promise<string> };
}

export interface TriggerContextHandle {
  context: BuiltApTriggerContext;
  touched: ReadonlySet<string>;
  // setSchedule / app.createListeners calls, for the supervisor to arm.
  schedules: RecordedSchedule[];
  listeners: RecordedListener[];
}

export function buildTriggerContext(
  options: TriggerContextOptions,
): TriggerContextHandle {
  const { identity = {} } = options;
  const store = options.store ?? new InMemoryKeyValueStore();
  const touched = new Set<string>();
  const schedules: RecordedSchedule[] = [];
  const listeners: RecordedListener[] = [];

  // AP's engine store layout, for a store that is one flat map: FLOW scope
  // (the default) nests under the flow id; PROJECT scope uses the bare key.

  // Matching the enum's "COLLECTION" value alone missed a piece that passes
  // the name instead, which then silently got flow scope.
  const prefix = options.storePrefix ?? "";
  const flowId = identity.flowId ?? "flow";
  const scopedKey = (key: string, scope?: unknown) =>
    normalizeStoreScope(scope) === "PROJECT"
      ? `${prefix}${key}`
      : `${prefix}flow_${flowId}/${key}`;

  // A host-partitioned store owns the layout, so the scope travels beside the
  // key rather than inside it, exactly as buildActionContext passes it.

  // No "test" prefix on that path: a prefix aliases, so a live key named
  // "testMode" is a sample's "Mode" once both share one flat partition.

  // Separating a sample is then the host's job, by partition — which a prefix
  // could not do anyway, since nothing can enumerate a sample's keys to drop.
  const address = (
    key: string,
    scope?: unknown,
  ): [string, StoreScopeName | undefined] =>
    options.hostPartitionedStore
      ? [key, normalizeStoreScope(scope)]
      : [scopedKey(key, scope), undefined];

  const base: Record<string, unknown> = {
    auth: options.auth,
    propsValue: options.propsValue,
    isRepublish: options.isRepublish ?? false,
    store: {
      put: (key: string, value: unknown, scope?: unknown) => {
        const [at, partition] = address(key, scope);
        return store.put(at, value, partition);
      },
      get: (key: string, scope?: unknown) => store.get(...address(key, scope)),
      delete: (key: string, scope?: unknown) =>
        store.delete(...address(key, scope)),
    },
    flows: {
      list:
        options.flows?.list.bind(options.flows) ?? throwingStub("flows.list"),
      current: {
        id: identity.flowId ?? "flow",
        version: { id: identity.flowVersionId ?? "flow-version" },
      },
    },
    step: { name: identity.stepName ?? "trigger" },
    project: {
      id: identity.projectId ?? "project",
      externalId: () => Promise.resolve(identity.projectId ?? "project"),
    },
    connections: options.connections ?? {
      get: throwingStub("connections.get"),
    },
    server: options.server ?? throwingStub("server"),
    webhookUrl: options.webhookUrl ?? "http://localhost:0/webhook",
    payload: options.payload,
    setSchedule: (schedule: RecordedSchedule) => {
      schedules.push(schedule);
    },
    app: {
      createListeners: (listener: RecordedListener) => {
        listeners.push(listener);
      },
    },
    files: options.files ?? throwingStub("files"),
  };

  const context = withTouchTracking(base, touched, options.onTouch);
  return {
    context: context as unknown as BuiltApTriggerContext,
    touched,
    schedules,
    listeners,
  };
}

// Dedup key per doc 08 §4.4: the payload's own _dedupe_key wins; the caller
// falls back to its own synthesis when absent.
export function extractDedupeKey(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const value = (payload as Record<string, unknown>)[DEDUPE_KEY_PROPERTY];
  return typeof value === "string" ? value : undefined;
}

export class TriggerHookNotImplementedError extends Error {
  constructor(triggerName: string, hook: string) {
    super(`Trigger "${triggerName}" does not implement ${hook}()`);
    this.name = "TriggerHookNotImplementedError";
  }
}

export type TriggerLifecycleHook =
  | "onEnable"
  | "onDisable"
  | "run"
  | "test"
  | "onHandshake"
  | "onRenew";

// Invokes one lifecycle hook with the built context; result is returned untouched.
export async function runTriggerHook(
  trigger: ApTrigger,
  hook: TriggerLifecycleHook,
  handle: TriggerContextHandle,
): Promise<unknown> {
  const fn = trigger[hook];
  if (typeof fn !== "function") {
    throw new TriggerHookNotImplementedError(trigger.name ?? "unknown", hook);
  }
  return await fn.call(trigger, handle.context);
}
