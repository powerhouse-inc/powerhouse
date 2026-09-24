import type { ActionContextIdentity } from "../context/action.js";
import type { StagedFile } from "../context/files.js";
import type { PropsValidationErrors } from "../context/normalize.js";
import type {
  ExecutionType,
  ServerContext,
} from "@powerhousedao/pieces-framework";
import type { RecordedListener, RecordedSchedule } from "../context/trigger.js";

// One FILE-prop value the host resolved to a path before the run, so the
// bytes reach the worker through the shared filesystem instead of JSON IPC.
export interface StagedInput {
  ref: string;
  path: string;
  fileName?: string;
  contentType?: string;
}

// Where a piece may connect to while this request runs. Enforced in the child
// at socket-connect time; absent means unrestricted, which is the old behaviour.
export interface EgressPolicy {
  // Hostnames (or literal IPs) the piece may reach; a leading "*." matches
  // subdomains. Omitted or empty allows any host the address rules permit.
  allowHosts?: string[];
  // Addresses or CIDRs reachable even though they are private — a service on
  // the operator's own network, say.
  allowAddresses?: string[];
  // Lifts the private-address block, for an operator whose isolation lives
  // elsewhere. Local sockets, UDP and listening stay refused under any policy.
  allowPrivateAddresses?: boolean;
  // TCP ports the piece may reach; omitted or empty allows any.
  allowPorts?: number[];
}

// The child is forked with an empty env, so what the host's environment decides
// can only arrive on the wire: every request carries what is in force for the
// work it asks for.
export interface HostScopedRequest {
  egress?: EgressPolicy;
  // Ceiling for FILE-prop hydration and ctx.files.write, from the host's
  // PH_WORKFLOWS_PIECE_MAX_FILE_BYTES. Absent leaves the built-in default.
  maxFileBytes?: number;
}

// Where the worker finds the piece module: a bundle directory in npm shape, as
// a registry fetch extracts it, or the module file of an installed package.

// Exactly one is set; a request carrying neither is refused before any load.
export interface PieceModuleRef {
  bundleDir?: string;
  entryPath?: string;
}

export interface RunActionRequest extends HostScopedRequest, PieceModuleRef {
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
  // Serve `ctx.store` from the host over the call channel instead of the
  // in-memory partition above, so a write survives this worker.
  durableStore?: boolean;
  // Forward the piece's console output to the host as it is written. Off by
  // default: a chatty piece would otherwise pay IPC for logs nobody reads.
  captureLogs?: boolean;
  // Implement `ctx.output.update`, which reports progress mid-step. Without
  // it the member keeps throwing, so a piece that needs it fails loudly.
  liveOutput?: boolean;
  executionType?: `${ExecutionType}`;
  identity?: ActionContextIdentity;
  // Concrete secret values resolved for this step, so the child can strip them
  // from an error before it crosses back; they already travel inside `auth`.
  redactValues?: string[];
  // Serve `ctx.reactor` over the call channel. Set only for a piece the host
  // loaded from an installed reactor package; a fetched bundle never gets it.
  reactorAccess?: boolean;
}

export interface RunMessage {
  id: number;
  type: "run";
  request: RunActionRequest;
}

// Design-time resolution of a DROPDOWN options() / DYNAMIC props() resolver.
export interface ResolveOptionsRequest
  extends HostScopedRequest, PieceModuleRef {
  // Action or trigger name, per kind (default "action").
  actionName: string;
  kind?: "action" | "trigger";
  propName: string;
  refresherValues?: Record<string, unknown>;
  auth?: unknown;
  searchValue?: string;
  // ctx.project.id, the same one a run of the piece is handed.
  projectId?: string;
  // As on a run: an options() resolver of a package piece may read the reactor
  // it is offering choices from.
  reactorAccess?: boolean;
}

export interface ResolveOptionsMessage {
  id: number;
  type: "resolve-options";
  request: ResolveOptionsRequest;
}

// One trigger lifecycle hook. With `durableStore` its `ctx.store` is the same
// host-served store an action gets, so a write lands as the hook makes it.

// Without one it runs statelessly: `storeState` seeds an in-memory store and
// the whole snapshot comes back in the response for the caller to persist.
export interface TriggerHookRequest extends HostScopedRequest, PieceModuleRef {
  triggerName: string;
  hook: "onEnable" | "onDisable" | "run" | "test" | "onHandshake";
  propsValue: Record<string, unknown>;
  auth?: unknown;
  storeState?: Record<string, unknown>;
  // Serve `ctx.store` from the host over the call channel, exactly as
  // RunActionRequest does, instead of seeding and returning the snapshot above.
  durableStore?: boolean;
  identity?: ActionContextIdentity;
  // onEnable of an unchanged trigger; pollingHelper keeps its cursor.
  isRepublish?: boolean;
  // WEBHOOK payloads; also handed to test runs.
  payload?: unknown;
  webhookUrl?: string;
  server?: ServerContext;
  // As on a run request: secrets stripped from errors before they cross back.
  redactValues?: string[];
}

export interface TriggerHookMessage {
  id: number;
  type: "trigger-hook";
  request: TriggerHookRequest;
}

// A connection credential check. Auth crosses into the worker and stays
// there: the piece code that reads it never runs in the host process.
export interface CheckConnectionRequest
  extends HostScopedRequest, PieceModuleRef {
  auth?: unknown;
}

export interface CheckConnectionMessage {
  id: number;
  type: "check-connection";
  request: CheckConnectionRequest;
}

// `output` of a check-connection result.
export interface CheckConnectionOutcome {
  // False when the piece declares neither app.checkConnection nor auth.validate.
  declared: boolean;
  // Its return value: void | boolean | { name | username | email | sub }.
  result?: unknown;
  // Why the check failed, when the hook said so. auth.validate carries a
  // message; app.checkConnection only ever returns false.
  detail?: string;
}

// Design-time descriptor of a piece: its actions, triggers and auth shape.
// Building one requires the piece module, whose top-level code runs on load,
// so it is built in the worker and only the plain descriptor crosses back.
export interface DescribePieceRequest
  extends HostScopedRequest, PieceModuleRef {
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
  // The error's own enumerable properties, plus the HTTP status, request and
  // response the framework's error formatter recovered from it.
  properties: Record<string, unknown>;
  // Set when the piece hit an unimplemented context member.
  unsupportedMember?: string;
  // Set when the props failed validation, before piece code ran.
  invalidProps?: PropsValidationErrors;
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

// A request the child makes of its host while a step is running: the reverse
// direction of everything above, and the only way a piece reaches durable state.

// Ids are the child's own counter, a separate space from the host's, which is
// why every handler dispatches on `type` before comparing an id.
export interface HostCallMessage {
  id: number;
  type: "host-call";
  method: string;
  payload: unknown;
}

// `error` carries the failure as data: a rejected promise cannot cross IPC,
// so the reply always arrives and the child rethrows.
export interface HostCallResponse {
  id: number;
  type: "host-result";
  value?: unknown;
  error?: string;
}

// What the host will answer for the request in flight. Registered per request,
// so a call arriving after the step returned finds nothing and is refused.
export type HostCallHandlers = Record<
  string,
  (payload: unknown) => Promise<unknown>
>;

// The one-way half of the channel: a report the host may act on, with no
// answer to wait for. Their engine splits the same way (rpc vs rpc-notify).

// A tap must never stall the step, so these carry no id and no reply. Node's
// IPC preserves order, which is what drains them before the result lands.
export interface HostNotifyMessage {
  type: "host-notify";
  method: string;
  payload: unknown;
}

// Handlers registered per request, like HostCallHandlers. A throw here is
// swallowed: a failed tap must not fail the step it was reporting on.
export type HostNotifyHandlers = Record<string, (payload: unknown) => void>;

// One console call the piece made, already flattened to a string in the child.
export interface PieceLogEntry {
  level: "log" | "info" | "warn" | "error" | "debug";
  message: string;
  at: number;
}

export const LOG_WRITE = "log.write";
export const OUTPUT_UPDATE = "output.update";

// A store call carries `{ key, value?, scope }`. The scope is a name the host
// partitions on, never a prefix the child bakes into the key.
export const STORE_GET = "store.get";
export const STORE_PUT = "store.put";
export const STORE_DELETE = "store.delete";

// A reactor call carries the operation's own input object; the host answers
// with documents already projected to summaries (see context/reactor.ts).
export const REACTOR_MODELS = "reactor.models";
export const REACTOR_MODEL = "reactor.model";
export const REACTOR_GET = "reactor.get";
export const REACTOR_FIND = "reactor.find";
export const REACTOR_CREATE = "reactor.create";
export const REACTOR_EXECUTE = "reactor.execute";
