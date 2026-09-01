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
import { throwingStub, withTouchTracking } from "./stubs.js";

export interface RecordedSchedule {
  cronExpression: string;
  timezone?: string;
}

export interface RecordedListener {
  events: string[];
  identifierValue: string;
}

export interface TriggerContextOptions {
  propsValue: Record<string, unknown>;
  auth?: unknown;
  store?: KeyValueStore;
  identity?: ActionContextIdentity;
  // WEBHOOK / APP_WEBHOOK: the incoming request; also handed to test runs.
  payload?: unknown;
  webhookUrl?: string;
  flows?: FlowsProvider;
  connections?: ConnectionsProvider;
  server?: ServerInfo;
  onTouch?: (member: string) => void;
}

export interface BuiltApTriggerContext {
  auth: unknown;
  propsValue: Record<string, unknown>;
  store: KeyValueStore;
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

  const base: Record<string, unknown> = {
    auth: options.auth,
    propsValue: options.propsValue,
    store: {
      put: (key: string, value: unknown) => store.put(key, value),
      get: (key: string) => store.get(key),
      delete: (key: string) => store.delete(key),
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
    files: throwingStub("files"),
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
