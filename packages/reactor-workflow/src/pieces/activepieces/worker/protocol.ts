import type { ActionContextIdentity } from "../context/action.js";
import type { ServerInfo } from "../context/props.js";
import type {
  RecordedListener,
  RecordedSchedule,
} from "../context/trigger.js";

export interface RunActionRequest {
  bundleDir: string;
  actionName: string;
  propsValue: Record<string, unknown>;
  auth?: unknown;
  // Resolved connection values served to ctx.connections.get(key).
  connections?: Record<string, unknown>;
  // Store partition; runs sharing a scope share state for the worker's lifetime.
  storeScope?: string;
  executionType?: "BEGIN" | "RESUME";
  identity?: ActionContextIdentity;
}

export interface RunMessage {
  id: number;
  type: "run";
  request: RunActionRequest;
}

// Design-time resolution of a DROPDOWN options() / DYNAMIC props() resolver.
export interface ResolveOptionsRequest {
  bundleDir: string;
  actionName: string;
  propName: string;
  refresherValues?: Record<string, unknown>;
  auth?: unknown;
  searchValue?: string;
}

export interface ResolveOptionsMessage {
  id: number;
  type: "resolve-options";
  request: ResolveOptionsRequest;
}

// One trigger lifecycle hook, executed statelessly: the persisted piece-store
// contents are seeded in and the updated contents come back in the response.
export interface TriggerHookRequest {
  bundleDir: string;
  triggerName: string;
  hook: "onEnable" | "onDisable" | "run" | "test";
  propsValue: Record<string, unknown>;
  auth?: unknown;
  storeState?: Record<string, unknown>;
  identity?: ActionContextIdentity;
  // onEnable of an unchanged trigger; pollingHelper keeps its cursor.
  isRepublish?: boolean;
  // WEBHOOK payloads; also handed to test runs.
  payload?: unknown;
  webhookUrl?: string;
  server?: ServerInfo;
}

export interface TriggerHookMessage {
  id: number;
  type: "trigger-hook";
  request: TriggerHookRequest;
}

export type WorkerRequestMessage =
  | RunMessage
  | ResolveOptionsMessage
  | TriggerHookMessage;

// Piece errors cross the IPC boundary as data; classify on these fields.
export interface SerializedPieceError {
  name: string;
  message: string;
  properties: Record<string, unknown>;
  // Set when the piece hit an unimplemented context member.
  unsupportedMember?: string;
}

export interface ResultResponse {
  id: number;
  type: "result";
  output: unknown;
  touched: string[];
  // True when the piece set NODE_TLS_REJECT_UNAUTHORIZED=0 (contained to the worker).
  tlsPoisoned: boolean;
  // trigger-hook only: final store contents plus captured context calls.
  storeState?: Record<string, unknown>;
  schedules?: RecordedSchedule[];
  listeners?: RecordedListener[];
}

export interface ErrorResponse {
  id: number;
  type: "error";
  error: SerializedPieceError;
  tlsPoisoned: boolean;
}

export type WorkerResponse = ResultResponse | ErrorResponse;
