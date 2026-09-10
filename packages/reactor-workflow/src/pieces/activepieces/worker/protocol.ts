import type { ActionContextIdentity } from "../context/action.js";
import type { StagedFile } from "../context/files.js";
import type { ServerInfo } from "../context/props.js";
import type {
  RecordedListener,
  RecordedSchedule,
} from "../context/trigger.js";

// One FILE-prop value the host resolved to a path before the run, so the
// bytes reach the worker through the shared filesystem instead of JSON IPC.
export interface StagedInput {
  ref: string;
  path: string;
  fileName?: string;
  contentType?: string;
}

export interface RunActionRequest {
  bundleDir: string;
  actionName: string;
  propsValue: Record<string, unknown>;
  auth?: unknown;
  // Where ctx.files.write() puts bytes for the host to ingest. Without it the
  // action gets the data-URI service instead.
  stagingDir?: string;
  // Attachment refs in propsValue, already materialized by the host.
  stagedInputs?: StagedInput[];
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
  // Action or trigger name, per kind (default "action").
  actionName: string;
  kind?: "action" | "trigger";
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
  hook: "onEnable" | "onDisable" | "run" | "test" | "onHandshake";
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

// A connection credential check. Auth crosses into the worker and stays
// there: the piece code that reads it never runs in the host process.
export interface CheckConnectionRequest {
  bundleDir: string;
  auth?: unknown;
}

export interface CheckConnectionMessage {
  id: number;
  type: "check-connection";
  request: CheckConnectionRequest;
}

// `output` of a check-connection result.
export interface CheckConnectionOutcome {
  // False when the piece declares no app.checkConnection.
  declared: boolean;
  // Its return value: void | boolean | { name | username | email | sub }.
  result?: unknown;
}

// Design-time descriptor of a piece: its actions, triggers and auth shape.
// Building one requires the piece module, whose top-level code runs on load,
// so it is built in the worker and only the plain descriptor crosses back.
export interface DescribePieceRequest {
  bundleDir: string;
  // Carried through into the descriptor's `source` and its resolver ids.
  packageName: string;
  version: string;
}

export interface DescribePieceMessage {
  id: number;
  type: "describe";
  request: DescribePieceRequest;
}

export type WorkerRequestMessage =
  | RunMessage
  | ResolveOptionsMessage
  | TriggerHookMessage
  | CheckConnectionMessage
  | DescribePieceMessage;

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
  // Files the piece wrote through ctx.files during this request. The host
  // ingests each one, then rewrites its provisional token in `output`.
  files?: StagedFile[];
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
