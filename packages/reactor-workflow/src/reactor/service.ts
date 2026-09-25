// The workflow runtime: one instance per host, serving the GraphQL subgraph
// (config + manual fire) and the workflow-triggers read model alike.
import type {
  IWebhookEndpoints,
  IWebhookScope,
  WebhookPolicy,
  WebhookReply,
  WebhookRequest,
} from "@powerhousedao/shared/processors";
import type { WorkflowCaller, WorkflowRuntimeHostDeps } from "./host.js";

import {
  blockTypeParts,
  containsRedactedMarker,
  servesReactorPort,
  declaredConnectionIds,
  DEFAULT_EGRESS_POLICY,
  parseBlockType,
  pieceModuleRef,
  reactorHandlers,
  PieceWorker,
  PieceWorkerError,
  PieceWorkerPool,
  PieceWorkerTimeoutError,
  rememberSecrets,
  runWorkflow,
  UnsupportedPieceFeatureError,
  type BlockExecutor,
  type LocalPiece,
  type ParsedBlockType,
  type PieceModuleRef,
  type CheckConnectionOutcome,
  type PieceDescriptor,
  type EgressPolicy,
  type PieceWorkerSession,
  type SecretProvider,
  type SecretStore,
  type WorkflowRunResult,
} from "../pieces/index.js";
import {
  childLogger,
  type Action,
  type ILogger,
  type OperationWithContext,
} from "document-model";
import {
  actions as connectionActions,
  type ConnectionDocument,
} from "@powerhousedao/workflow/document-models/connection";
import type {
  WorkflowDocument,
  WorkflowState,
} from "@powerhousedao/workflow/document-models/workflow";
import {
  DOCUMENT_CREATE_BLOCK,
  DOCUMENT_CREATED_BLOCK,
  DOCUMENT_DELETED_BLOCK,
  DOCUMENT_DISPATCH_BLOCK,
  DOCUMENT_EVENT_BLOCK,
  DOCUMENT_FIND_BLOCK,
  DOCUMENT_GET_BLOCK,
  DOCUMENT_SCHEMA_BLOCK,
  DOCUMENT_TYPES_BLOCK,
  staticString,
} from "./reactor-piece.js";
import {
  documentBlockTree,
  documentEventTree,
  documentFindTree,
  documentGetTree,
  documentSchemaTree,
  documentTypesTree,
  fieldsFromSdl,
  fromOutputSchema,
  hasOutputSchemaFields,
  fromSample,
  lifecycleTriggerTree,
  scheduleTriggerTree,
  webhookTriggerTree,
  type OutputTree,
} from "./output-tree.js";
import {
  fetchPieceActions,
  fetchPieceCatalog,
  fetchPieceDetail,
  fetchPieceTriggers,
  CatalogStatusError,
  clientAuth,
  type PieceActionsResult,
  type PieceSummary,
  type PieceTriggersResult,
} from "./piece-catalog.js";
import {
  actionsResult,
  catalogEntry,
  detailResult,
  localSearchHits,
  triggersResult,
} from "./local-catalog.js";
import {
  indexFromHits,
  searchBlocks,
  type BlockSearchIndex,
  type BlockSearchResult,
} from "./block-search.js";
import { packagePieces } from "./piece-registry.js";
import { ScopedDesignTimeReactorPort } from "./reactor-port.js";
import {
  BUNDLE_CACHE_DIR,
  configuredEgress,
  createBlockExecutor,
  DocumentConnectionResolver,
  pieceResolver,
  resolveConnectionAuth,
  toWorkflowDefinition,
} from "./lib.js";
import { packageFromConnectorId } from "./connector-id.js";
import { SCHEDULE_BLOCK } from "./schedule.js";
import type { AttachmentPort } from "../pieces/index.js";
import { createAttachmentPort } from "./attachment-port.js";
import { createPieceStorePort, PROJECT_SCOPE_KEY } from "./piece-store-port.js";
import { currentWorkflowId, withRunScope } from "./run-scope.js";
import {
  CORE_DESCRIPTOR,
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
  coreBlockDescriptor,
  isCoreBlock,
} from "./core-catalog.js";
import { LocalEncryptedSecretStore } from "./secret-store.js";
import {
  WorkflowRunStore,
  type RunRow,
  type StepExecutionRow,
  type TriggerStateRow,
} from "./store.js";
import {
  TriggerSupervisor,
  type PieceTriggerBinding,
  type TriggerBinding,
} from "./trigger-supervisor.js";
import {
  parseWebhookConfig,
  WEBHOOK_BLOCK,
  WEBHOOK_TRIGGER_KIND,
  type WebhookConfig,
  type WebhookPayload,
} from "./webhook.js";
import {
  handshakeMatches,
  handshakeReply,
  type PieceHandshake,
} from "./piece-handshake.js";
import {
  lifecycleKindForDocumentAction,
  lifecycleKindForDriveAction,
  matchesEventFilter,
  matchesLifecycleFilter,
  parseEventFilter,
  parseLifecycleFilter,
  TRIGGER_KIND_BY_BLOCK,
  type DocumentEventFilter,
  type LifecycleFilter,
  type TriggerKind,
} from "./trigger-filters.js";

export type PersistedRunResult = WorkflowRunResult & { runId: string | null };

// "absent" is a source answering that it has no such piece; "unreachable" is
// no source answering at all. Collapsing the two is what turned a network
// blip into a permanent ERROR row telling an operator to install something.
type VersionLookup =
  | { kind: "found"; version: string }
  | { kind: "absent" }
  | { kind: "unreachable"; detail: string };

type BlockResolution =
  | { kind: "resolved"; block: ParsedBlockType }
  | { kind: "absent" }
  | { kind: "unreachable"; detail: string };

interface VersionLookupOptions {
  // Give up waiting after this long. The lookup itself runs on and fills the
  // catalog's cache, so whatever asks next is answered from it.
  timeoutMs?: number;
  // Ask again even for a name remembered as absent. For a person who pressed
  // a button: they may well have pressed it because they fixed something.
  fresh?: boolean;
}

export interface ConnectionSummary {
  id: string;
  name: string;
  connectorId: string;
  authType: string;
  status: string;
  accountLabel: string | null;
}

export interface ConnectionCheckResult {
  ok: boolean;
  detail: string | null;
  accountLabel: string | null;
}

/** A journal row with the steps that belong to it, as the subgraph serves it. */
export interface RunRecord {
  row: RunRow;
  steps: StepExecutionRow[];
}

export interface WebhookEndpointRecord {
  workflowId: string;
  url: string;
  absoluteUrl: boolean;
  armed: boolean;
  createdAt: string;
}

// Matches the piece worker's default action timeout; a hung check kills the
// worker instead of hanging the mutation.
const CHECK_TIMEOUT_MS = 30_000;
// Same convention for the design-time descriptor build; a bundle that hangs
// on import kills the worker instead of the request.
const DESCRIBE_TIMEOUT_MS = 30_000;

// Bounded because the registry is seeded once, from the constructor: a sweep
// that fails past this is reported rather than retried forever.
const SEED_ATTEMPTS = 3;
const SEED_RETRY_BASE_MS = 250;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms).unref());

const logger = childLogger(["workflow", "runtime"]);

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";
const WORKFLOW_DOCUMENT_TYPE = "powerhouse/workflow";
// Document creation, deletion and parent linking are appended to the document
// itself in this scope, not to any drive.
const DOCUMENT_SCOPE = "document";
// The relationship type the reactor uses for containment: a drive (or any
// parent document) -> child document edge.
const CHILD_RELATIONSHIP = "child";

// What identifies an operation to both dedupe lines below. The ordinal is the
// reactor's own sequence; a batch without one falls back to the document's.
function operationKey(op: OperationWithContext): string {
  return op.context.ordinal > 0
    ? `o:${op.context.ordinal}`
    : `${op.context.documentId}:${op.context.scope}:${op.context.branch}:${op.operation.index}`;
}

// A day, because the redelivery this guards is a restart replaying from a
// cursor that trailed the runs it had already journaled.
const OPERATION_DEDUPE_TTL_MS = 24 * 60 * 60_000;

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

// The documents a run's trigger names: the one whose operation fired it, and
// the drive it sits in.
function journaledTriggerDocumentIds(payload: string | null): string[] {
  if (payload === null) return [];
  try {
    return triggerDocumentIds(JSON.parse(payload));
  } catch {
    return [];
  }
}

function triggerDocumentIds(payload: unknown): string[] {
  const record = inputRecord(payload);
  return [
    ...new Set(
      [
        stringField(record, "documentId"),
        stringField(record, "driveId"),
      ].filter((id): id is string => id !== undefined),
    ),
  ];
}

// Absence is reported by name: the error may cross an RPC boundary.
function isAbsent(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "DocumentNotFoundError" ||
      error.name === "DocumentDeletedError")
  );
}

function inputRecord(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== "object") return {};
  return input as Record<string, unknown>;
}

// Where a lifecycle payload's driveId / parentId come from: CREATE_DOCUMENT knows
// nothing about containment, so the parent is read off siblings in the same job.
export interface LifecycleParentHint {
  // Set only by a drive operation, which is the only place the drive is named
  // outright.
  driveId?: string;
  // A drive node's parentFolder, or the parent document of a "child" edge.
  parentId?: string;
  // The document id a relationship names as its parent, whose type decides
  // whether it is a drive.
  parentCandidate?: string;
}

// Indexes operations by the document a lifecycle event is about. addFile writes CREATE_DOCUMENT
// and ADD_RELATIONSHIP in one job (drive known without a read); the drive's ADD_FILE lands later.
export function collectLifecycleParentHints(
  operations: OperationWithContext[],
): Map<string, LifecycleParentHint> {
  const hints = new Map<string, LifecycleParentHint>();
  const merge = (documentId: string, hint: LifecycleParentHint) => {
    const existing = hints.get(documentId);
    hints.set(documentId, existing ? { ...existing, ...hint } : hint);
  };
  for (const { operation, context } of operations) {
    const actionType = operation.action.type;
    const input = inputRecord(operation.action.input);
    if (context.scope === DOCUMENT_SCOPE) {
      if (
        actionType !== "ADD_RELATIONSHIP" &&
        actionType !== "REMOVE_RELATIONSHIP"
      ) {
        continue;
      }
      if (stringField(input, "relationshipType") !== CHILD_RELATIONSHIP) {
        continue;
      }
      const target = stringField(input, "targetId");
      const source = stringField(input, "sourceId");
      if (!target || !source) continue;
      merge(target, { parentId: source, parentCandidate: source });
      continue;
    }
    if (context.documentType !== DRIVE_DOCUMENT_TYPE) continue;
    if (actionType !== "ADD_FILE" && actionType !== "DELETE_NODE") continue;
    const nodeId = stringField(input, "id");
    if (!nodeId) continue;
    // parentFolder is absent at a drive's root, where the document has no
    // folder parent; the drive itself is reported as driveId, not as parentId.
    merge(nodeId, {
      driveId: context.documentId,
      parentId: stringField(input, "parentFolder"),
    });
  }
  return hints;
}

// User-visible detail of a failed worker request; a piece error contributes only
// its message, as its serialized properties may hold echoed credentials.
function pieceFailureDetail(error: unknown, timeoutDetail: string): string {
  if (error instanceof PieceWorkerTimeoutError) return timeoutDetail;
  if (error instanceof PieceWorkerError) return error.serialized.message;
  return error instanceof Error ? error.message : String(error);
}

function checkFailureDetail(error: unknown): string {
  return pieceFailureDetail(
    error,
    `Connection check timed out after ${Math.round(CHECK_TIMEOUT_MS / 1000)}s`,
  );
}

type TriggerRegistration = {
  workflowId: string;
} & (
  | { kind: "document-event"; filter: DocumentEventFilter }
  | { kind: "document-created" | "document-deleted"; filter: LifecycleFilter }
  // Request-driven; the reactor mints and owns the endpoint's token.
  | { kind: "webhook"; config: WebhookConfig }
  // A piece whose strategy is WEBHOOK: the supervisor still owns its
  // enable/disable state, but requests drive it instead of the tick.
  | { kind: "piece-webhook"; binding: PieceTriggerBinding }
  // Timer-driven kinds live in the TriggerSupervisor.
  | { kind: "piece" | "schedule" }
);

export const PIECE_WEBHOOK_KIND = "piece-webhook";

// Kinds whose enable/disable lifecycle the supervisor owns, so leaving one
// has to release its registration.
const SUPERVISED_KINDS = new Set(["piece", "schedule", PIECE_WEBHOOK_KIND]);

// The engine's own namespace. No catalog has ever heard of it, and core#manual
// reaches the resolution below every time a workflow is saved.
const CORE_PACKAGE = "core";

// Whether there is anything to authenticate with: a secret handle, or a
// non-secret config value such as a base URL.
function hasCredentials(state: {
  config?: unknown;
  secretRefs?: { ref: string }[];
}): boolean {
  if ((state.secretRefs ?? []).length > 0) return true;
  const config = state.config;
  return (
    typeof config === "object" &&
    config !== null &&
    Object.keys(config as Record<string, unknown>).length > 0
  );
}

// A source that answered and has no such piece, as opposed to one that could
// not be asked. Only the first is something to tell an operator to act on.
function isAbsentFromCatalog(error: unknown): boolean {
  return error instanceof CatalogStatusError && error.status === 404;
}

// How long a name the catalog answered for, and said it has nothing of, stays
// unresolved. Only a definitive absence is remembered: a hit is already cached
// by the catalog itself, and an unreachable catalog is not an answer at all.
const PIECE_VERSION_MISS_TTL_MS = 5 * 60_000;

// What a caller on an awaited path waits for a lookup before giving up on it.

// Registration is awaited by the operation ingest and by seeding, which loops
// workflows one at a time, and the design-time reads are somebody typing. The
// fetch runs on regardless, so the retry behind it answers from the cache.
const PIECE_VERSION_LOOKUP_TIMEOUT_MS = 2_000;

// How long before a trigger left unresolved by an unreachable catalog is tried
// again, doubling to the cap. A reactor that booted during a brief outage has
// to arm itself once it is over, not wait to be restarted.
const UNREACHABLE_RETRY_MS = 30_000;
const UNREACHABLE_RETRY_CAP_MS = 15 * 60_000;

// Shared so no refusal path can accidentally answer with a distinguishing body.
const UNAUTHORIZED: WebhookReply = { status: 401 };

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

// How long a sync-mode delivery holds the provider's socket; beyond this the run
// keeps going and the provider is told so, lest a wedged step tie up connections.
const DELIVERY_TIMEOUT_MS =
  Number(process.env.PH_WORKFLOWS_WEBHOOK_TIMEOUT_MS) || 30_000;

const TIMED_OUT = Symbol("webhook delivery timed out");

/** Resolves to TIMED_OUT, and never keeps the process alive waiting to. */
function timeout(ms: number): Promise<typeof TIMED_OUT> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(TIMED_OUT), ms).unref();
  });
}

/** Shaped like Activepieces' catch-webhook contract so authored expressions and adapted
 * pieces agree where a request's parts are; headers arrive redacted, body decoded. */
function webhookPayload(request: WebhookRequest): WebhookPayload {
  return {
    method: request.method,
    path: request.path,
    headers: request.headers,
    queryParams: request.queryParams,
    body: request.body,
  };
}

export const POLL_INTERVAL_CONFIG_KEY = "pollEverySeconds";

// pollEverySeconds is ours, not the piece's: lifted out of the trigger config so it
// never reaches the piece as a prop, yet a change to it alone still rewrites the hash.
export function splitPollInterval(config: Record<string, unknown>): {
  config: Record<string, unknown>;
  pollIntervalMs?: number;
} {
  if (!(POLL_INTERVAL_CONFIG_KEY in config)) return { config };
  const { [POLL_INTERVAL_CONFIG_KEY]: raw, ...rest } = config;
  const seconds = typeof raw === "string" ? Number(raw) : raw;
  if (
    typeof seconds !== "number" ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    logger.warn(
      `Ignoring ${POLL_INTERVAL_CONFIG_KEY}=${JSON.stringify(raw)}: expected a positive number of seconds`,
    );
    return { config: rest };
  }
  return { config: rest, pollIntervalMs: Math.round(seconds * 1000) };
}

function parseWorkflowState(
  resultingState?: string,
): WorkflowState | undefined {
  if (!resultingState) return undefined;
  try {
    return JSON.parse(resultingState) as WorkflowState;
  } catch {
    return undefined;
  }
}

function configRecord(config: unknown): Record<string, unknown> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return config as Record<string, unknown>;
  }
  if (typeof config === "string") {
    try {
      const parsed = JSON.parse(config) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through
    }
  }
  return {};
}

// The name a run is stamped with. A run record is a journal: it snapshots the
// name alongside the version so a workflow that is later renamed or deleted
// still reads correctly in its own history. That is why this resolves at run
// time rather than being looked up when a row is displayed \u2014 and why the
// document's name is a fallback for an unset state.name, not a replacement for
// it.
function runJournalName(
  stateName: string | undefined,
  documentName: string | undefined,
): string {
  return stateName?.trim() ? stateName : (documentName ?? "");
}

export class WorkflowRuntimeService {
  private readonly host: WorkflowRuntimeHostDeps;
  private readonly logger: ILogger;
  // The only host surface that carries an attachment client; without one
  // ctx.files stays an inline data URI instead of an attachment reference.
  private readonly attachments?: AttachmentPort;
  private executor?: BlockExecutor;
  private pieceWorkers?: PieceWorkerPool;
  private readonly storePromise: Promise<WorkflowRunStore>;
  private secretsPromise?: Promise<SecretStore>;
  private readonly registry = new Map<string, TriggerRegistration>();
  // Awaited before an endpoint answers: a delivery reaching an unseeded
  // registry is refused exactly as an unknown token is, so it looks like one.
  private readonly seedPromise: Promise<void>;
  // What the last seeding attempt failed with, once the retries are spent.
  private seedError?: unknown;

  // Seeds the trigger registry and opens the run journal. The host owns this
  // instance's lifetime, so a replaced host means a replaced runtime.
  constructor(host: WorkflowRuntimeHostDeps) {
    this.host = host;
    this.logger = host.logger ?? logger;
    this.attachments = host.attachments
      ? createAttachmentPort(
          host.attachments,
          () => currentWorkflowId(),
          // A host that serves attachments without answering for them reads
          // nothing: an unanswerable relationship is not a permitted one.
          (documentId, ref) =>
            host.canReadAttachmentRef?.(documentId, ref) ??
            Promise.resolve(false),
        )
      : undefined;
    this.storePromise = WorkflowRunStore.create(host.relationalDb);
    this.storePromise.catch((error: unknown) => {
      this.logger.error("Failed to open the workflow run store: @error", error);
    });
    this.seedPromise = this.seedWithRetries();
  }

  // The journal is best-effort: a broken store never blocks runs.
  async store(): Promise<WorkflowRunStore | undefined> {
    try {
      return await this.storePromise;
    } catch {
      return undefined;
    }
  }

  // Unlike the journal, a broken secret store must fail resolution loudly.
  secrets(): Promise<SecretStore> {
    this.secretsPromise ??=
      this.host.secrets !== undefined
        ? Promise.resolve(this.host.secrets)
        : LocalEncryptedSecretStore.create(this.host.relationalDb);
    return this.secretsPromise;
  }

  private secretProvider(): SecretProvider {
    return { get: (ref) => this.secrets().then((store) => store.get(ref)) };
  }

  /** The seeding failure a restart is needed to clear, or undefined while the
   * registry is seeded. Resolves once seeding has finished either way. */
  async seedFailure(): Promise<unknown> {
    await this.seedPromise;
    return this.seedError;
  }

  // A seed that never lands leaves every poll and webhook trigger inert until
  // the process restarts, so a transient failure is retried before it stands.
  private async seedWithRetries(): Promise<void> {
    for (let attempt = 1; attempt <= SEED_ATTEMPTS; attempt += 1) {
      try {
        await this.seedRegistry();
        this.seedError = undefined;
        return;
      } catch (error) {
        this.seedError = error;
        if (attempt === SEED_ATTEMPTS) break;
        this.logger.warn(
          `Seeding the trigger registry failed (attempt ${attempt}/${SEED_ATTEMPTS}), retrying: @error`,
          error,
        );
        await sleep(SEED_RETRY_BASE_MS * 2 ** (attempt - 1));
      }
    }
    // Resolved rather than rejected: a delivery racing a dead registry is
    // still answered as an unknown token, not as a broken endpoint.
    this.logger.error(
      `Failed to seed the trigger registry after ${SEED_ATTEMPTS} attempts; its workflows stay inactive until the reactor restarts: @error`,
      this.seedError,
    );
  }

  private async seedRegistry(): Promise<void> {
    const page = await this.host.reactorClient.find({
      type: "powerhouse/workflow",
    });
    for (const document of page.results as WorkflowDocument[]) {
      await this.updateRegistration(document.header.id, document.state.global);
    }

    // Seeding nothing while endpoints exist is always a fault, and every
    // webhook for this package is dead until the next seed succeeds.
    if (this.registry.size === 0 && (await this.hasWebhookEndpoints())) {
      this.logger.warn(
        "Trigger registry seeded no workflows, but @count webhook endpoint(s) exist: their deliveries will be refused as unknown tokens",
        await this.endpointCount(),
      );
      return;
    }
    this.logger.info(
      `Trigger registry seeded: ${this.registry.size} workflow(s)`,
    );
  }

  private async endpointCount(): Promise<number> {
    const endpoints = await this.endpoints();
    return endpoints ? (await endpoints.list()).length : 0;
  }

  private async hasWebhookEndpoints(): Promise<boolean> {
    return (await this.endpointCount()) > 0;
  }

  // Awaited by callers: the registry must be current before the next request
  // can arrive. Only arming, which does I/O, is left to run on its own.
  private async updateRegistration(
    workflowId: string,
    state: WorkflowState,
  ): Promise<void> {
    // The ERROR row an unresolvable trigger leaves outlives the trigger, so a
    // workflow registering anything now drops it first, ahead of what follows.
    if (this.unarmed.delete(workflowId)) this.dropSupervised(workflowId);
    // Whatever this registration decides supersedes the pending retry, which
    // re-arms itself below if the catalog is still away.
    this.cancelResolutionRetry(workflowId);
    const trigger = state.status === "ENABLED" ? state.trigger : undefined;
    if (trigger?.blockType === WEBHOOK_BLOCK) {
      await this.registerWebhook(workflowId, trigger.config);
      return;
    }
    const kind: TriggerKind | undefined = trigger
      ? TRIGGER_KIND_BY_BLOCK[trigger.blockType]
      : undefined;
    const { binding: supervised, resolution } =
      trigger && !kind
        ? await this.supervisedBinding(workflowId, trigger)
        : { binding: undefined, resolution: undefined };

    if (!kind && !supervised) {
      const had = this.registry.get(workflowId);
      this.registry.delete(workflowId);
      if (had && SUPERVISED_KINDS.has(had.kind))
        this.dropSupervised(workflowId);
      // After the drop above, so the row this leaves is the last one written.
      if (trigger) this.reportUnarmedTrigger(workflowId, trigger, resolution);
      return;
    }
    if (supervised) {
      if (supervised.kind === "schedule") {
        this.registry.set(workflowId, { workflowId, kind: "schedule" });
        this.enableSupervised(workflowId, supervised);
        return;
      }
      // Registered as a poll binding first, then corrected once the piece's
      // strategy is known: a WEBHOOK trigger must never be handed to the tick.
      this.registry.set(workflowId, { workflowId, kind: "piece" });
      await this.registerPieceTrigger(workflowId, supervised);
      return;
    }
    const had = this.registry.get(workflowId);
    if (had && SUPERVISED_KINDS.has(had.kind)) this.dropSupervised(workflowId);
    const config = trigger?.config;
    this.registry.set(
      workflowId,
      kind === "document-event"
        ? { workflowId, kind, filter: parseEventFilter(config) }
        : { workflowId, kind: kind!, filter: parseLifecycleFilter(config) },
    );
  }

  private enableSupervised(workflowId: string, binding: TriggerBinding): void {
    this.supervisor()
      .upsert(binding)
      .catch((error: unknown) => {
        this.logger.error(`Trigger enable failed for ${workflowId}`, error);
      });
  }

  // A WEBHOOK-strategy piece needs its endpoint minted before onEnable runs:
  // the piece registers that URL with the provider from inside the hook.
  private async registerPieceTrigger(
    workflowId: string,
    binding: PieceTriggerBinding,
  ): Promise<void> {
    const delivery = await this.pieceDelivery(binding);
    const resolved = { ...binding, delivery };
    if (delivery === "webhook") {
      this.registry.set(workflowId, {
        workflowId,
        kind: PIECE_WEBHOOK_KIND,
        binding: resolved,
      });
      // Awaited: a delivery landing before the token exists would be refused,
      // and the piece registers this URL with the provider from onEnable.
      await (await this.endpoints())?.endpointFor(workflowId);
    }
    // Arming downloads a bundle and calls the provider; that stays off the
    // operation-ingestion path.
    this.enableSupervised(workflowId, resolved);
  }

  // Strategy comes from the piece catalog rather than the bundle: deciding
  // poll-vs-webhook must not require loading piece code.
  private async pieceDelivery(
    binding: PieceTriggerBinding,
  ): Promise<"poll" | "webhook"> {
    try {
      const { triggers } = await this.pieceTriggers(binding.packageName);
      const strategy = triggers.find(
        (entry) => entry.name === binding.triggerName,
      )?.strategy;
      return strategy === "WEBHOOK" ? "webhook" : "poll";
    } catch (error) {
      // Unknown strategy polls: a poll that returns nothing is recoverable,
      // a webhook endpoint nobody serves is not.
      this.logger.warn(
        "Could not resolve the trigger strategy for @block; polling",
        binding.blockType,
        error,
      );
      return "poll";
    }
  }

  // A disabled or retyped webhook trigger loses its registry entry, so
  // deliveries stop; the endpoint row stays so re-enabling keeps the URL.
  private async registerWebhook(
    workflowId: string,
    rawConfig: unknown,
  ): Promise<void> {
    const had = this.registry.get(workflowId);
    if (had && SUPERVISED_KINDS.has(had.kind)) this.dropSupervised(workflowId);
    let config: WebhookConfig;
    try {
      config = parseWebhookConfig(configRecord(rawConfig));
    } catch (error) {
      this.registry.delete(workflowId);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Webhook trigger rejected for ${workflowId}: ${message}`,
      );
      return;
    }
    this.registry.set(workflowId, {
      workflowId,
      kind: WEBHOOK_TRIGGER_KIND,
      config,
    });
    // Awaited: a delivery landing before the token exists would be refused.
    await (await this.endpoints())?.endpointFor(workflowId);
  }

  // Triggers the supervisor drives on its tick: piece polls and schedules.

  // The resolution travels with the binding: whether a trigger failed because
  // no piece answers or because nothing could be asked decides what the caller
  // is told, and only the resolution knows which it was.
  private async supervisedBinding(
    workflowId: string,
    trigger: NonNullable<WorkflowState["trigger"]>,
  ): Promise<{ binding?: TriggerBinding; resolution?: BlockResolution }> {
    if (trigger.blockType === SCHEDULE_BLOCK) {
      return {
        binding: {
          kind: "schedule",
          workflowId,
          blockType: SCHEDULE_BLOCK,
          config: configRecord(trigger.config),
        },
      };
    }
    return this.pieceBinding(workflowId, trigger);
  }

  private async pieceBinding(
    workflowId: string,
    trigger: NonNullable<WorkflowState["trigger"]>,
  ): Promise<{ binding?: PieceTriggerBinding; resolution: BlockResolution }> {
    const resolution = await this.resolveBlockType(
      trigger.blockType,
      `workflow ${workflowId}`,
      // Bounded: seeding walks workflows one at a time and ingest awaits this,
      // and while neither has finished every webhook delivery is refused.
      { timeoutMs: PIECE_VERSION_LOOKUP_TIMEOUT_MS },
    );
    const parsed =
      resolution.kind === "resolved" ? resolution.block : undefined;
    // An action block type is no more a trigger than an unresolved one is.
    if (parsed?.kind !== "trigger") return { resolution };
    const { config, pollIntervalMs } = splitPollInterval(
      configRecord(trigger.config),
    );
    return {
      resolution,
      binding: {
        workflowId,
        blockType: trigger.blockType,
        packageName: parsed.packageName,
        version: parsed.version,
        triggerName: parsed.name,
        config,
        connectionId: trigger.connectionId,
        pollIntervalMs,
      },
    };
  }

  // One rule for turning a block type into the piece behind it, for every
  // caller: design-time reads, a run's steps, and a trigger's binding alike.

  // A pinned version or an installed piece resolves in-process; only a name
  // neither answers for is looked up, and a piece that resolves for one caller
  // has to resolve for all of them.

  // What the catalog serves moves when the registry publishes, so the version
  // this lands on is logged rather than quietly adopted.
  private async resolveBlockType(
    blockType: string,
    caller = "a design-time request",
    options: VersionLookupOptions = {},
  ): Promise<BlockResolution> {
    const parsed = parseBlockType(blockType, packagePieces.versions());
    if (parsed) return { kind: "resolved", block: parsed };
    // Nothing but an unversioned block type reaches here: a pinned one parses
    // on its own, whether or not anything can serve what it pins.
    const parts = blockTypeParts(blockType);
    if (!parts) return { kind: "absent" };
    const found = await this.pieceVersion(parts.packageName, options);
    if (found.kind !== "found") return found;
    // Block types carry a scoped package name, so they travel as logger values:
    // inline, the logger reads the scope as a token and prints null/pack.
    this.logger.info(
      "Resolving @block for @caller: it pins no version and this reactor holds no package piece of that name, so it reads as version @version, the one the piece catalog serves today. Pin a version in the block type to hold it still across upgrades.",
      blockType,
      caller,
      found.version,
    );
    return {
      kind: "resolved",
      block: {
        packageName: parts.packageName,
        version: found.version,
        kind: parts.kind,
        name: parts.name,
      },
    };
  }

  // For the callers that only need the piece: a block type nobody serves and
  // one nobody could be asked about both come back as nothing to work with.
  private async resolvedBlock(
    blockType: string,
  ): Promise<ParsedBlockType | undefined> {
    // Bounded: these are interactive, and an editor that hangs for a minute
    // before drawing an empty form is worse than one that draws it at once.
    const resolution = await this.resolveBlockType(blockType, undefined, {
      timeoutMs: PIECE_VERSION_LOOKUP_TIMEOUT_MS,
    });
    return resolution.kind === "resolved" ? resolution.block : undefined;
  }

  // Workflows whose trigger resolved to nothing. Remembered only so the row
  // below can be cleared once the workflow registers something again.
  private readonly unarmed = new Set<string>();

  // A trigger naming a piece nothing can resolve registers nothing, and used
  // to say nothing either: no entry, no trigger state, no log.

  // Both halves of the report matter: the log for whoever is watching the
  // reactor come up, the row for whoever asks later why a workflow is quiet.

  // What it says depends on which failure it was. "No piece answers" is a
  // fact only when something answered; when the catalog could not be reached
  // it is a guess, and one that sends an operator to install what they have.
  private reportUnarmedTrigger(
    workflowId: string,
    trigger: NonNullable<WorkflowState["trigger"]>,
    resolution: BlockResolution | undefined,
  ): void {
    const parts = blockTypeParts(trigger.blockType);
    // Only a piece trigger is a failure here: core#manual and the document
    // triggers reach this path in the ordinary course of things.
    if (parts?.kind !== "trigger") return;
    const unreachable = resolution?.kind === "unreachable";
    const retryAt = unreachable
      ? new Date(Date.now() + this.scheduleResolutionRetry(workflowId))
      : undefined;
    const reason = unreachable
      ? `The piece behind the trigger block type "${trigger.blockType}" could not be resolved, so this workflow is not armed: it pins no version, this reactor holds no package piece of that name, and the piece catalog could not be reached (${resolution.detail}). ` +
        `Retrying at ${retryAt?.toISOString() ?? "the next registration"}; this is a connectivity failure, not a missing piece.`
      : `No piece answers for the trigger block type "${trigger.blockType}", so this workflow will not arm: it pins no version, this reactor holds no package piece of that name, and the piece catalog has none either. ` +
        "Pin a version in the block type, or install the package that ships the piece.";
    this.logger.warn("Workflow @workflow: @reason", workflowId, reason);
    this.unarmed.add(workflowId);
    this.supervisor()
      .reject(
        workflowId,
        trigger.blockType,
        configRecord(trigger.config),
        reason,
        retryAt,
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Could not record the unresolved trigger for workflow ${workflowId}`,
          error,
        );
      });
  }

  // Re-registration attempts for triggers left unresolved by an unreachable
  // catalog, and how long the next one waits.
  private readonly resolutionRetries = new Map<
    string,
    { timer: NodeJS.Timeout; delayMs: number }
  >();

  // Nothing else would ever come back to these: an ERROR row is not due for a
  // poll and carries no binding to retry, so without this a reactor that
  // booted during an outage stays unarmed until someone restarts or edits it.
  private scheduleResolutionRetry(workflowId: string): number {
    const previous = this.resolutionRetries.get(workflowId);
    if (previous) clearTimeout(previous.timer);
    const delayMs = Math.min(
      previous ? previous.delayMs * 2 : UNREACHABLE_RETRY_MS,
      UNREACHABLE_RETRY_CAP_MS,
    );
    const timer = setTimeout(() => {
      this.resolutionRetries.delete(workflowId);
      // Re-read rather than replay: the workflow may have been edited or
      // disabled while the catalog was away, and that answer wins.
      this.refreshRegistration(workflowId).catch((error: unknown) => {
        this.logger.warn(
          `Could not retry the unresolved trigger for workflow ${workflowId}`,
          error,
        );
      });
    }, delayMs);
    // Never a reason to hold the process open.
    timer.unref();
    this.resolutionRetries.set(workflowId, { timer, delayMs });
    return delayMs;
  }

  private cancelResolutionRetry(workflowId: string): void {
    const pending = this.resolutionRetries.get(workflowId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.resolutionRetries.delete(workflowId);
  }

  private dropSupervised(workflowId: string): void {
    this.supervisor()
      .remove(workflowId)
      .catch((error: unknown) => {
        this.logger.error(`Trigger disable failed for ${workflowId}`, error);
      });
  }

  private async refreshRegistration(
    workflowId: string,
    resultingState?: string,
  ): Promise<void> {
    // Parsed before awaiting, so only a malformed state falls through to a
    // fresh read; a registration failure must not trigger one.
    const carried = parseWorkflowState(resultingState);
    if (carried) {
      await this.updateRegistration(workflowId, carried);
      return;
    }
    const document =
      await this.host.reactorClient.get<WorkflowDocument>(workflowId);
    await this.updateRegistration(workflowId, document.state.global);
  }

  // The manager routes by filter only, so every per-drive processor instance
  // delivers every matching operation; dedup keeps fires once-per-operation.
  private readonly seenOps = new Set<string>();
  private readonly seenOpsQueue: string[] = [];

  private alreadySeen(key: string): boolean {
    if (this.seenOps.has(key)) return true;
    this.seenOps.add(key);
    this.seenOpsQueue.push(key);
    if (this.seenOpsQueue.length > 8192) {
      const evicted = this.seenOpsQueue.shift();
      if (evicted) this.seenOps.delete(evicted);
    }
    return false;
  }

  // Called by the workflow-triggers read model. Registry updates and the
  // journal write for every matched fire are awaited; execution is not, so
  // runs never block operation ingestion.
  async onOperations(operations: OperationWithContext[]): Promise<void> {
    const hints = collectLifecycleParentHints(operations);
    for (const { operation, context } of operations) {
      if (context.scope !== DOCUMENT_SCOPE && context.scope !== "global") {
        continue;
      }
      const opKey = operationKey({ operation, context });
      if (this.alreadySeen(opKey)) continue;
      if (context.scope === DOCUMENT_SCOPE) {
        await this.matchDocumentLifecycle(operation, context, hints, opKey);
        continue;
      }
      // A workflow edit updates the registry, then falls through: workflow docs are
      // also a document-event source, so a workflow can watch its own type.
      if (context.documentType === "powerhouse/workflow") {
        await this.refreshRegistration(
          context.documentId,
          operation.resultingState,
        );
      }
      if (operation.error !== undefined) continue;
      for (const registration of this.registry.values()) {
        if (registration.kind !== "document-event") continue;
        const matched = matchesEventFilter(
          registration.filter,
          context.documentType,
          context.documentId,
          operation.action.type,
        );
        if (!matched) continue;
        const payload = {
          documentId: context.documentId,
          documentType: context.documentType,
          branch: context.branch,
          scope: context.scope,
          action: {
            type: operation.action.type,
            input: operation.action.input,
          },
          operation: {
            index: operation.index,
            timestampUtcMs: operation.timestampUtcMs,
          },
        };
        await this.enqueueFire(
          registration.workflowId,
          payload,
          registration.kind,
          opKey,
        );
      }
      if (context.documentType === DRIVE_DOCUMENT_TYPE) {
        await this.matchDriveLifecycle(
          context.documentId,
          operation.action.type,
          operation.action.input,
          { index: operation.index, timestampUtcMs: operation.timestampUtcMs },
          opKey,
        );
      }
    }
  }

  // Journals the fire, then lets it run on its own. Awaiting only the write is
  // the whole point: once this resolves the run is durable, so the read model's
  // cursor may pass the operation that matched it, but nothing here waits on a
  // piece. A journal that cannot take the row still fires, best-effort.
  private async enqueueFire(
    workflowId: string,
    payload: unknown,
    kind: string,
    opKey: string,
  ): Promise<void> {
    const store = await this.store();
    if (!store) {
      this.fireFromTrigger(workflowId, payload, kind);
      return;
    }
    // The durable half of the dedupe: a crash can leave the cursor behind the
    // run it already wrote, so the replay delivers this operation a second time.
    const claimed = await store.claimDedupe(
      workflowId,
      `op:${opKey}`,
      OPERATION_DEDUPE_TTL_MS,
      new Date().toISOString(),
    );
    if (!claimed) return;
    let runId: string;
    try {
      runId = await store.enqueueRun({
        workflowId,
        triggerKind: kind,
        triggerPayload: payload,
      });
    } catch (error) {
      this.logger.error(
        `Could not journal the ${kind} fire for workflow ${workflowId}; running it without a durable record`,
        error,
      );
      this.fireFromTrigger(workflowId, payload, kind);
      return;
    }
    this.fireFromTrigger(workflowId, payload, kind, runId);
  }

  private fireFromTrigger(
    workflowId: string,
    payload: unknown,
    kind: string,
    enqueuedRunId?: string,
  ): void {
    this.fire(
      workflowId,
      payload,
      kind,
      undefined,
      undefined,
      enqueuedRunId,
    ).then(
      (run) => {
        this.logger.info(`${kind} fired workflow ${workflowId}: ${run.status}`);
      },
      (error: unknown) => {
        this.logger.error(
          `${kind} run failed for workflow ${workflowId}`,
          error,
        );
      },
    );
  }

  // Fires once per document, from whichever source reports it first. Only a fire that
  // matched is recorded, so a creation with an unknown drive leaves ADD_FILE its turn.
  private readonly firedLifecycle = new Set<string>();
  private readonly firedLifecycleQueue: string[] = [];

  private lifecycleAlreadyFired(
    kind: TriggerKind,
    documentId: string,
  ): boolean {
    return this.firedLifecycle.has(`${kind}:${documentId}`);
  }

  private recordLifecycleFired(kind: TriggerKind, documentId: string): void {
    const key = `${kind}:${documentId}`;
    if (this.firedLifecycle.has(key)) return;
    this.firedLifecycle.add(key);
    this.firedLifecycleQueue.push(key);
    if (this.firedLifecycleQueue.length > 4096) {
      const evicted = this.firedLifecycleQueue.shift();
      if (evicted) this.firedLifecycle.delete(evicted);
    }
  }

  private lifecycleTargets(
    kind: TriggerKind,
  ): { workflowId: string; filter: LifecycleFilter }[] {
    const targets: { workflowId: string; filter: LifecycleFilter }[] = [];
    for (const registration of this.registry.values()) {
      if (registration.kind !== kind) continue;
      // Redundant at runtime, but it is what tells the compiler the surviving
      // registrations carry a LifecycleFilter rather than an event filter.
      if (registration.kind === "document-event") continue;
      targets.push({
        workflowId: registration.workflowId,
        filter: registration.filter,
      });
    }
    return targets;
  }

  private async fireLifecycle(
    kind: TriggerKind,
    payload: {
      documentId: string;
      documentType: string | null;
      name: string | null;
      driveId: string | null;
      parentId: string | null;
      operation: { index: number; timestampUtcMs: string };
    },
    opKey: string,
  ): Promise<void> {
    let matched = false;
    for (const target of this.lifecycleTargets(kind)) {
      if (
        !matchesLifecycleFilter(
          target.filter,
          payload.documentType,
          payload.driveId,
        )
      ) {
        continue;
      }
      matched = true;
      await this.enqueueFire(target.workflowId, payload, kind, opKey);
    }
    if (matched) this.recordLifecycleFired(kind, payload.documentId);
  }

  // A "child" edge names the parent document but not its type, and only a drive
  // parent matters to a driveId filter. Cached: a drive gathers many documents.
  private readonly driveParentCache = new Map<string, boolean>();

  private async driveIdFromParent(
    parentId: string | undefined,
  ): Promise<string | undefined> {
    if (!parentId) return undefined;
    const cached = this.driveParentCache.get(parentId);
    if (cached !== undefined) return cached ? parentId : undefined;
    try {
      const parent = await this.host.reactorClient.get(parentId);
      const isDrive = parent.header.documentType === DRIVE_DOCUMENT_TYPE;
      if (this.driveParentCache.size > 1024) this.driveParentCache.clear();
      this.driveParentCache.set(parentId, isDrive);
      return isDrive ? parentId : undefined;
    } catch {
      return undefined;
    }
  }

  // The document's own CREATE_DOCUMENT / DELETE_DOCUMENT, the source of truth: it covers
  // documents outside any drive, carries the real type and name, and alone proves deletion.
  private async matchDocumentLifecycle(
    operation: OperationWithContext["operation"],
    context: OperationWithContext["context"],
    hints: Map<string, LifecycleParentHint>,
    opKey: string,
  ): Promise<void> {
    const kind = lifecycleKindForDocumentAction(operation.action.type);
    if (!kind) return;
    if (operation.error !== undefined) return;
    const input = inputRecord(operation.action.input);
    // DELETE_DOCUMENT names its target in the input; CREATE_DOCUMENT's input
    // and context agree.
    const documentId = stringField(input, "documentId") ?? context.documentId;
    if (this.lifecycleAlreadyFired(kind, documentId)) return;
    if (this.lifecycleTargets(kind).length === 0) return;

    const hint = hints.get(documentId);
    const driveId =
      hint?.driveId ?? (await this.driveIdFromParent(hint?.parentCandidate));
    const created = kind === "document-created";
    await this.fireLifecycle(
      kind,
      {
        documentId,
        // CREATE_DOCUMENT names the model it creates; the stored context type
        // answers for a deletion, where the document can no longer be read.
        documentType:
          (created ? stringField(input, "model") : undefined) ??
          (context.documentType || null),
        // Only a creation carries a name; a deleted document's name is gone.
        name: stringField(input, "name") ?? null,
        driveId: driveId ?? null,
        parentId: hint?.parentId ?? null,
        operation: {
          index: operation.index,
          timestampUtcMs: operation.timestampUtcMs,
        },
      },
      opKey,
    );
  }

  // The drive's fallback view: ADD_FILE always accompanies a CREATE_DOCUMENT, so it fires only
  // when that never reached the processor. DELETE_NODE stands alone — the document stays alive.
  private async matchDriveLifecycle(
    driveId: string,
    actionType: string,
    input: unknown,
    operation: { index: number; timestampUtcMs: string },
    opKey: string,
  ): Promise<void> {
    const kind = lifecycleKindForDriveAction(actionType);
    if (!kind) return;
    if (this.lifecycleTargets(kind).length === 0) return;

    const record = inputRecord(input);
    const documentId = stringField(record, "id");
    if (!documentId) return;
    if (this.lifecycleAlreadyFired(kind, documentId)) return;
    let documentType = stringField(record, "documentType");
    let name = stringField(record, "name") ?? null;
    if (kind === "document-deleted") {
      // Best-effort: unlinking a node leaves the document in place. Folder
      // nodes never resolve, so a type filter also skips them.
      try {
        const document = await this.host.reactorClient.get(documentId);
        documentType = document.header.documentType;
        name ??= document.header.name;
      } catch {
        documentType = undefined;
      }
    }

    await this.fireLifecycle(
      kind,
      {
        documentId,
        documentType: documentType ?? null,
        name,
        driveId,
        parentId: stringField(record, "parentFolder") ?? null,
        operation,
      },
      opKey,
    );
  }

  private triggerSupervisor?: TriggerSupervisor;

  // Lazily built; started/stopped by the trigger processor's lifecycle.
  supervisor(): TriggerSupervisor {
    this.triggerSupervisor ??= new TriggerSupervisor({
      store: () => this.store(),
      resolveAuth: async (connectionId, request) => {
        if (!connectionId) return undefined;
        const resolved = await new DocumentConnectionResolver(
          this.host,
          this.secretProvider(),
        ).resolveWithSecrets(connectionId, request);
        // The supervisor reads these back off the auth value to redact what a
        // trigger hook throws; nothing else travels with it.
        return rememberSecrets(resolved.auth, resolved.secretValues);
      },
      fire: (workflowId, payload, kind) => {
        this.fireFromTrigger(workflowId, payload, kind);
      },
      webhookUrlFor: async (workflowId) =>
        (await this.mintWebhookEndpoint(workflowId))?.url,
      cacheDir: BUNDLE_CACHE_DIR,
      resolver: pieceResolver(),
      // Trigger hooks reach the same services steps do.
      egress: configuredEgress(),
      // Overrides the 60s default; the 1s floor still applies.
      defaultIntervalMs:
        Number(process.env.PH_WORKFLOWS_POLL_INTERVAL_MS) || undefined,
      reconcileIntervalMs:
        Number(process.env.PH_WORKFLOWS_WEBHOOK_RECONCILE_MS) || undefined,
    });
    return this.triggerSupervisor;
  }

  startTriggerSupervisor(): void {
    this.supervisor().start();
  }

  stopTriggerSupervisor(): void {
    this.triggerSupervisor?.stop();
  }

  // Teardown for the whole runtime, driven by the host. The run children
  // outlive the reactor otherwise — they are forked, not
  // spawned by it — and a run holding one is over the moment we stop.
  shutdown(): void {
    for (const { timer } of this.resolutionRetries.values())
      clearTimeout(timer);
    this.resolutionRetries.clear();
    this.stopTriggerSupervisor();
    // Left in place, disposed: clearing it here would let a run that is still
    // between awaits build a replacement and fork into it after teardown.
    this.pieceWorkers?.dispose();
    // Forked on the editor's first request and never replaced, so it outlives
    // a hot reload unless it goes with everything else.
    this.designWorker?.dispose();
    this.designWorker = undefined;
  }

  // A trigger's state names its workflow and its last error, so the rows are
  // filtered to the workflows this caller may read.
  async triggerStates(ctx?: WorkflowCaller): Promise<TriggerStateRow[]> {
    const store = await this.store();
    if (!store) return [];
    const rows = await store.listTriggerStates();
    return this.readableRows(rows, (row) => row.workflow_id, ctx);
  }

  private webhookEndpoints?: IWebhookEndpoints;
  private webhookScope?: IWebhookScope;
  // Held as a promise: seeding runs from the constructor, before the host
  // registers, so a seeded webhook workflow would mint no token and fail to arm.
  private webhookRegistration?: Promise<IWebhookEndpoints | undefined>;

  /** Registers the workflow endpoint family with the reactor's webhook service
   * (idempotent). Everything transport-shaped is the service's; only workflow identity is ours. */
  async registerWebhookEndpoint(): Promise<void> {
    if (this.webhookRegistration) {
      await this.webhookRegistration;
      return;
    }
    const webhooks = this.host.webhooks;
    if (!webhooks) {
      this.logger.warn(
        "This host serves no webhooks; workflows with a webhook trigger will not arm",
      );
      return;
    }
    this.webhookScope = webhooks;
    this.webhookRegistration = webhooks
      .register({
        name: "trigger",
        policyFor: (workflowId) => this.webhookPolicy(workflowId),
        onRequest: (request) => this.deliverWebhook(request),
      })
      .then((endpoints) => {
        this.webhookEndpoints = endpoints;
        return endpoints;
      })
      .catch((error: unknown) => {
        // No webhook store means no webhook triggers, not no workflows:
        // rethrowing would take every other trigger down with it.
        this.logger.warn(
          "Webhook triggers are unavailable on this host; other triggers are unaffected: @error",
          error,
        );
        return undefined;
      });
    await this.webhookRegistration;
  }

  /** The endpoint family, once registered. Seeding runs before the host starts
   * the runtime, so a caller that needs a token waits rather than finds it missing. */
  private async endpoints(): Promise<IWebhookEndpoints | undefined> {
    if (this.webhookEndpoints) return this.webhookEndpoints;
    // The host normally registers on start, but seeding runs from the
    // constructor and an enable can reach here first. Registering on demand
    // makes the order irrelevant, rather than failing the trigger on a race.
    if (!this.webhookRegistration && this.host.webhooks) {
      await this.registerWebhookEndpoint();
    }
    return await this.webhookRegistration;
  }

  /** The per-document policy the service enforces before a delivery reaches this code;
   * undefined means the workflow is not armed, answered exactly as an unknown token is. */
  async webhookPolicy(workflowId: string): Promise<WebhookPolicy | undefined> {
    // Seeding starts from the constructor and a delivery can beat it, and an
    // unseeded registry is indistinguishable from a bad token.
    await this.seedPromise;

    const registration = this.registry.get(workflowId);
    if (!registration) return undefined;

    // A piece owns its own verification and parsing: its run hook decides what
    // the request means, or rejects it.
    if (registration.kind === PIECE_WEBHOOK_KIND) return {};
    if (registration.kind !== WEBHOOK_TRIGGER_KIND) return undefined;

    const { config } = registration;
    return {
      methods: config.methods,
      challengeField: config.challengeField,
      dedupe: config.dedupeField
        ? {
            field: config.dedupeField,
            ttlSeconds: config.dedupeTtlSeconds,
          }
        : undefined,
      verify:
        config.scheme === "none"
          ? undefined
          : {
              scheme: config.scheme,
              header: config.header,
              secret: await this.webhookSecret(config, workflowId),
              toleranceSeconds: config.toleranceSeconds,
              algorithm: config.algorithm,
              encoding: config.encoding,
              prefix: config.prefix,
            },
    };
  }

  // Design-time: the URL to hand the provider. Minted on demand so an author
  // can copy it before the first delivery.
  async webhookEndpoint(
    workflowId: string,
    ctx?: WorkflowCaller,
  ): Promise<WebhookEndpointRecord | null> {
    // The URL carries the token that is the entire credential for a public
    // route, so handing it out is a read of the workflow itself.
    await this.assertCanReadDocument(workflowId, ctx);
    return this.mintWebhookEndpoint(workflowId);
  }

  // The supervisor's own lookup: server-side, with no caller to authorize.
  private async mintWebhookEndpoint(
    workflowId: string,
  ): Promise<WebhookEndpointRecord | null> {
    const endpoints = await this.endpoints();
    if (!endpoints) return null;
    const registration = this.registry.get(workflowId);
    const armed =
      registration?.kind === WEBHOOK_TRIGGER_KIND ||
      registration?.kind === PIECE_WEBHOOK_KIND;

    // Minted whether or not the workflow is armed: an author has to give the
    // URL to the sender before enabling, and enabling is what accepts.

    // `armed` carries the difference instead, so nothing is hidden — and this
    // never scans, which listing every endpoint to find one would.

    // A host that does not know its own public origin advertises a bare path; copying that into
    // a provider's console fails with nothing to read, so the author is told here instead.
    const absoluteUrl = this.webhookScope?.hasPublicOrigin ?? false;

    const minted = await endpoints.endpointFor(workflowId);
    return {
      workflowId,
      url: minted.url,
      absoluteUrl,
      armed,
      createdAt: minted.createdAt,
    };
  }

  /** A delivery the service has already rate-limited, verified, de-duplicated and
   * answered any challenge for; all that is left is deciding what it means. */
  async deliverWebhook(request: WebhookRequest): Promise<WebhookReply> {
    const workflowId = request.key;
    const registration = this.registry.get(workflowId);
    if (!registration) return UNAUTHORIZED;
    if (registration.kind === PIECE_WEBHOOK_KIND) {
      return this.deliverToPiece(registration.binding, request);
    }
    if (registration.kind !== WEBHOOK_TRIGGER_KIND) return UNAUTHORIZED;

    const { config } = registration;
    const payload = webhookPayload(request);

    if (config.responseMode === "async") {
      this.fireFromTrigger(workflowId, payload, WEBHOOK_TRIGGER_KIND);
      return { status: config.responseStatus };
    }
    // Sync mode holds the provider's socket, so the wait is bounded. On expiry the run is left
    // going — cancelling would lose announced work — and the 504 retry is what dedupe absorbs.
    const run = await Promise.race([
      this.fire(workflowId, payload, WEBHOOK_TRIGGER_KIND).then(
        (result) => ({ ok: true, result }) as const,
        (error: unknown) => ({ ok: false, error }) as const,
      ),
      timeout(DELIVERY_TIMEOUT_MS),
    ]);

    if (run === TIMED_OUT) {
      this.logger.warn(
        `Webhook run for ${workflowId} exceeded ${DELIVERY_TIMEOUT_MS}ms; answering 504 while it continues`,
      );
      return {
        status: 504,
        contentType: JSON_CONTENT_TYPE,
        body: JSON.stringify({
          status: "RUNNING",
          error: "The run did not finish in time",
        }),
      };
    }

    if (!run.ok) {
      const message =
        run.error instanceof Error ? run.error.message : String(run.error);
      this.logger.error(`Webhook run failed for ${workflowId}: ${message}`);
      return {
        status: 500,
        contentType: JSON_CONTENT_TYPE,
        body: JSON.stringify({ error: message }),
      };
    }

    return {
      status: run.result.status === "SUCCEEDED" ? config.responseStatus : 500,
      contentType: JSON_CONTENT_TYPE,
      body: JSON.stringify({
        runId: run.result.runId,
        status: run.result.status,
        error: run.result.error ?? null,
      }),
    };
  }

  // The probe a sender sends before it will register the endpoint. Answered by
  // the piece: only its own code knows what the sender wants echoed back.
  private async pieceHandshake(
    binding: PieceTriggerBinding,
    request: WebhookRequest,
  ): Promise<WebhookReply | undefined> {
    const handshake = await this.pieceHandshakeConfig(binding);
    if (!handshake || !handshakeMatches(handshake, request)) return undefined;
    try {
      const result = await this.supervisor().handshake(
        binding,
        webhookPayload(request),
      );
      return handshakeReply(result.output);
    } catch (error) {
      // A failed probe is the sender's answer, so it must not look like a
      // delivery: 500 tells it to retry rather than that the endpoint is gone.
      this.logger.error(
        "Handshake failed for @block on workflow @workflow",
        binding.blockType,
        binding.workflowId,
        error,
      );
      return { status: 500 };
    }
  }

  private async pieceHandshakeConfig(
    binding: PieceTriggerBinding,
  ): Promise<PieceHandshake | undefined> {
    try {
      const descriptor = await this.pieceDescriptor(
        binding.packageName,
        binding.version,
      );
      return descriptor.triggers.find(
        (entry) => entry.name === binding.triggerName,
      )?.handshake;
    } catch (error) {
      // A delivery must not fail because the descriptor could not be read; the
      // cost of guessing wrong is one probe answered as a delivery.
      this.logger.warn(
        "Could not read the handshake config for @block",
        binding.blockType,
        error,
      );
      return undefined;
    }
  }

  // The piece owns verification and parsing, so there is no scheme to check
  // here: its run hook decides what the request means, or rejects it.
  private async deliverToPiece(
    binding: PieceTriggerBinding,
    request: WebhookRequest,
  ): Promise<WebhookReply> {
    const probe = await this.pieceHandshake(binding, request);
    if (probe) return probe;

    const payload = webhookPayload(request);
    // Answered before the hook runs, as Activepieces does: a provider must not
    // wait on piece code, and its retry would only duplicate the delivery.
    this.supervisor()
      .deliverWebhook(binding.workflowId, payload)
      .then(
        () => {
          this.logger.info(
            "Webhook delivered to @block for workflow @workflow",
            binding.blockType,
            binding.workflowId,
          );
        },
        (error: unknown) => {
          this.logger.error(
            `Webhook delivery failed for workflow ${binding.workflowId}`,
            error,
          );
        },
      );
    return { status: 200 };
  }

  // A missing or deleted secret is a rejection, not an error: the endpoint is
  // configured as signed and there is nothing to verify against.
  private async webhookSecret(
    config: WebhookConfig,
    workflowId: string,
  ): Promise<string | undefined> {
    if (!config.secretRef) return undefined;
    try {
      return await (await this.secrets()).get(config.secretRef);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Webhook secret unavailable for ${workflowId}: ${message}`,
      );
      return undefined;
    }
  }

  private readonly descriptors = new Map<string, PieceDescriptor>();
  private designWorker?: PieceWorker;

  // Design-time piece code runs under the policy a run would get, so nothing
  // the editor does reaches somewhere a step could not.

  // Held rather than inlined for the reason the supervisor holds one: a
  // deployment whose isolation lives elsewhere has to be able to widen it.
  // Design-time piece code — a dropdown's options(), a connection check — runs
  // under the same policy a step does, widened the same way. Without that, the
  // editor cannot offer the lines of a floor it is about to poll.
  private designEgress: EgressPolicy | undefined =
    configuredEgress() ?? DEFAULT_EGRESS_POLICY;

  private async pieceDescriptor(
    packageName: string,
    version: string,
  ): Promise<PieceDescriptor> {
    const cacheKey = `${packageName}@${version}`;
    let descriptor = this.descriptors.get(cacheKey);
    if (!descriptor) {
      const piece = await pieceResolver().resolve(packageName, version);
      // Loading the bundle runs the piece module's top-level code, so the
      // descriptor is built in the worker, never in the reactor process.
      this.designWorker ??= new PieceWorker();
      let output: unknown;
      try {
        const result = await this.designWorker.describePiece(
          // Loading the module runs piece-authored top-level code, which
          // has no business reaching anything at all.
          {
            ...pieceModuleRef(piece),
            packageName,
            version,
            ...(this.designEgress ? { egress: this.designEgress } : {}),
          },
          { timeoutMs: DESCRIBE_TIMEOUT_MS },
        );
        output = result.output;
      } catch (error) {
        throw new Error(
          pieceFailureDetail(
            error,
            `Loading piece "${packageName}" timed out after ${Math.round(DESCRIBE_TIMEOUT_MS / 1000)}s`,
          ),
          { cause: error },
        );
      }
      descriptor = output as PieceDescriptor;
      this.descriptors.set(cacheKey, descriptor);
    }
    return descriptor;
  }

  // The workflows a drive holds that this caller may read, so a drive app can
  // scope runs to its own.
  async driveWorkflowIds(
    driveId: string,
    ctx?: WorkflowCaller,
  ): Promise<string[]> {
    await this.assertCanReadDocument(driveId, ctx);
    let page = await this.host.reactorClient.drives.listNodes(driveId);
    const nodes = [...page.results];
    // A drive past one page would otherwise scope runs to a prefix of its
    // workflows and read as a history that never happened.
    while (page.next) {
      page = await page.next();
      nodes.push(...page.results);
    }
    // Only file nodes carry a documentType, so `in` also rules out folders.
    const ids = nodes
      .filter(
        (node) =>
          "documentType" in node &&
          node.documentType === WORKFLOW_DOCUMENT_TYPE,
      )
      .map((node) => node.id);
    return this.readableRows(ids, (id) => id, ctx);
  }

  // The run journal, scoped to what this caller may read: a run carries its
  // trigger payload and every step's input and output.
  async runs(
    args: { workflowId?: string; driveId?: string; limit?: number },
    ctx?: WorkflowCaller,
  ): Promise<RunRecord[]> {
    const store = await this.store();
    if (!store) return [];
    // A drive scopes runs to the workflows it holds; an explicit workflowId is
    // narrower still, so it wins.
    let scope: string | string[] | undefined;
    if (args.workflowId) {
      await this.assertCanReadDocument(args.workflowId, ctx);
      scope = args.workflowId;
    } else if (args.driveId) {
      scope = await this.driveWorkflowIds(args.driveId, ctx);
      if (scope.length === 0) return [];
    } else if (!ctx) {
      // An unscoped listing is every workflow in the reactor, so it needs a
      // caller to filter by.
      return [];
    }
    const rows = await store.listRuns(scope, args.limit ?? 25);
    const readable = await this.servedRuns(
      await this.readableRows(rows, (row) => row.workflow_id, ctx),
      ctx,
    );
    return Promise.all(
      readable.map(async (row) => ({
        row,
        steps: await store.getSteps(row.id),
      })),
    );
  }

  // One run, or null when the caller may not read its workflow: "not yours"
  // and "no such run" must not be distinguishable.
  async run(runId: string, ctx?: WorkflowCaller): Promise<RunRecord | null> {
    const store = await this.store();
    if (!store || !ctx) return null;
    const row = await store.getRun(runId);
    if (!row) return null;
    if (!(await this.canReadDocument(row.workflow_id, ctx))) return null;
    if ((await this.servedRuns([row], ctx)).length === 0) return null;
    return { row, steps: await store.getSteps(row.id) };
  }

  // Design-time: the powerhouse/connection documents this caller may read,
  // read as the caller and then held to the host's own check.
  async connections(ctx?: WorkflowCaller): Promise<ConnectionSummary[]> {
    const subject = ctx && this.host.subjectOf?.(ctx);
    const page = await this.host.reactorClient.find(
      { type: "powerhouse/connection" },
      subject ? { subject } : undefined,
    );
    const readable = await this.readableDocuments(
      page.results as ConnectionDocument[],
      ctx,
    );
    // A listing serves a document any domain scope of which is readable, so
    // one whose global scope the gate stripped is dropped here.
    const withGlobal = readable.filter(
      (document) =>
        (document.state as Partial<ConnectionDocument["state"]>).global !==
        undefined,
    );
    return withGlobal.map((document) => {
      const state = document.state.global;
      return {
        id: document.header.id,
        name: state.name,
        connectorId: state.connectorId,
        authType: state.authType,
        status: state.status,
        accountLabel: state.accountLabel ?? null,
      };
    });
  }

  // Runs the piece's auth.validate, then auth.getConnectionIdentifier for the
  // account label, against the connection's credentials; records the outcome.
  async checkConnection(
    connectionId: string,
    ctx?: WorkflowCaller,
  ): Promise<ConnectionCheckResult> {
    await this.assertCanReadDocument(connectionId, ctx);
    // A check records its outcome on the connection, so this is a write: a
    // read-only caller is refused before anything is fetched or resolved.
    await this.assertCanWriteDocument(connectionId, ctx);
    const document =
      await this.host.reactorClient.get<ConnectionDocument>(connectionId);
    if (document.header.documentType !== "powerhouse/connection") {
      throw new Error(
        `Document "${connectionId}" is not a powerhouse/connection`,
      );
    }
    const state = document.state.global;
    const accountLabel = state.accountLabel ?? null;

    // Revocation is a decision, not an observation: recording any result here
    // would write ERROR over it and let the next check resolve the secrets.
    if (state.status === "REVOKED") {
      return { ok: false, detail: "Connection is revoked", accountLabel };
    }
    // Judged on what the connection holds, not on `status`: SET_CONNECTOR
    // leaves UNCONFIGURED behind and only a recorded check clears it, so
    // trusting the flag here refuses the first check of every connection —
    // the one an author runs the moment they finish filling it in.
    if (state.authType !== "NONE" && !hasCredentials(state)) {
      return this.recordCheckResult(document, {
        ok: false,
        detail: "Connection is not configured",
        accountLabel,
      });
    }
    // No bundle work for auth kinds the runtime cannot execute yet.
    if (state.authType === "OAUTH2" || state.authType === "OIDC") {
      return this.recordCheckResult(document, {
        ok: false,
        detail: `${state.authType} connections are not supported by the runtime yet`,
        accountLabel,
      });
    }

    const packageName = packageFromConnectorId(state.connectorId);
    let moduleRef: PieceModuleRef;
    try {
      // A person pressed "check", quite possibly because they just fixed the
      // connectivity that made the last answer a miss: ask again rather than
      // serve them a remembered one, and wait for the real answer.
      const found = await this.pieceVersion(packageName, { fresh: true });
      if (found.kind !== "found") {
        throw new Error(
          `Could not resolve a version for piece "${packageName}"` +
            (found.kind === "unreachable" ? `: ${found.detail}` : ""),
        );
      }
      moduleRef = pieceModuleRef(
        await pieceResolver().resolve(packageName, found.version),
      );
    } catch (error) {
      return this.recordCheckResult(document, {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        accountLabel,
      });
    }

    // Through the shared decision, so a revoked connection is refused here as
    // it is on a run; the document is already in hand, so no second fetch.
    let shapedAuth: unknown;
    try {
      shapedAuth = await resolveConnectionAuth(
        document,
        this.secretProvider(),
        {
          blockType: state.connectorId,
          piecePackage: packageName,
        },
      );
    } catch (error) {
      // A missing or deleted secret names its ref in the message.
      return this.recordCheckResult(document, {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        accountLabel,
      });
    }

    // Plaintext auth crosses only into the piece worker: the auth's hooks are
    // untrusted piece code and must not run in the reactor process.
    let outcome: CheckConnectionOutcome;
    try {
      this.designWorker ??= new PieceWorker();
      const result = await this.designWorker.checkConnection(
        // A check that reaches somewhere a run could not would call a
        // connection healthy that every step using it will fail on.
        {
          ...moduleRef,
          auth: shapedAuth,
          ...(this.designEgress ? { egress: this.designEgress } : {}),
        },
        { timeoutMs: CHECK_TIMEOUT_MS },
      );
      outcome = result.output as CheckConnectionOutcome;
    } catch (error) {
      return this.recordCheckResult(document, {
        ok: false,
        detail: checkFailureDetail(error),
        accountLabel,
      });
    }

    if (!outcome.valid) {
      return this.recordCheckResult(document, {
        ok: false,
        detail: outcome.detail ?? "Connection check failed",
        accountLabel,
      });
    }
    // The label is best-effort: a failure keeps the previous one.
    if (outcome.identifierError) {
      this.logger.warn(
        "Connection @id kept its label: getConnectionIdentifier failed: @detail",
        connectionId,
        outcome.identifierError,
      );
    }
    return this.recordCheckResult(document, {
      ok: true,
      detail: outcome.declared
        ? null
        : "piece declares no auth.validate; credentials resolved",
      accountLabel: outcome.accountLabel ?? accountLabel,
    });
  }

  // Names a source answered for and had nothing of, and when it said so. An
  // unreachable catalog is never recorded here: it is not an answer, and
  // remembering it would hold a name unresolvable after connectivity is back.
  private readonly versionMisses = new Map<string, number>();

  // Lookups still in the air, so a burst of requests for one name costs one.
  private readonly versionLookups = new Map<string, Promise<VersionLookup>>();

  // The version to run a piece at, by the one rule every caller uses: what
  // this reactor installed, else what the catalog serves for the name.
  private pieceVersion(
    packageName: string,
    options: VersionLookupOptions = {},
  ): Promise<VersionLookup> {
    // A package piece is pinned by what this reactor installed, and no
    // published listing has anything to say about it.
    const local = packagePieces.lookup(packageName);
    if (local)
      return Promise.resolve({ kind: "found", version: local.version });
    if (packageName === CORE_PACKAGE)
      return Promise.resolve({ kind: "absent" });
    const missedAt = this.versionMisses.get(packageName);
    if (
      !options.fresh &&
      missedAt !== undefined &&
      Date.now() - missedAt < PIECE_VERSION_MISS_TTL_MS
    ) {
      return Promise.resolve({ kind: "absent" });
    }
    if (options.fresh) this.versionMisses.delete(packageName);
    const lookup =
      this.versionLookups.get(packageName) ??
      this.startVersionLookup(packageName);
    return options.timeoutMs === undefined
      ? lookup
      : this.boundedLookup(packageName, lookup, options.timeoutMs);
  }

  private startVersionLookup(packageName: string): Promise<VersionLookup> {
    const lookup = this.lookUpPieceVersion(packageName).then((found) => {
      if (found.kind === "absent")
        this.versionMisses.set(packageName, Date.now());
      else if (found.kind === "found") this.versionMisses.delete(packageName);
      this.versionLookups.delete(packageName);
      return found;
    });
    this.versionLookups.set(packageName, lookup);
    return lookup;
  }

  // A caller that cannot wait treats the deadline as the catalog not having
  // answered, which is what it is. The lookup is left running: it fills the
  // catalog's own cache, so the retry behind this is answered from memory.
  private boundedLookup(
    packageName: string,
    lookup: Promise<VersionLookup>,
    timeoutMs: number,
  ): Promise<VersionLookup> {
    return new Promise<VersionLookup>((resolve) => {
      const timer = setTimeout(() => {
        this.logger.debug(
          "Gave the piece catalog @ms ms for @package and went on without it",
          timeoutMs,
          packageName,
        );
        resolve({
          kind: "unreachable",
          detail: `the piece catalog did not answer within ${timeoutMs}ms`,
        });
      }, timeoutMs);
      timer.unref();
      lookup.then(
        (found) => {
          clearTimeout(timer);
          resolve(found);
        },
        () => {
          clearTimeout(timer);
          resolve({ kind: "unreachable", detail: "the piece catalog failed" });
        },
      );
    });
  }

  // Catalog first, piece detail as fallback; the cache keeps this cheap.

  // A source that answered and did not list the piece is an absence; both
  // failing is an outage, and the two must not read the same to a caller.
  private async lookUpPieceVersion(
    packageName: string,
  ): Promise<VersionLookup> {
    try {
      const catalog = await fetchPieceCatalog();
      const version = catalog.find(
        (entry) => entry.name === packageName,
      )?.version;
      if (version) return { kind: "found", version };
    } catch {
      // Unreachable listing; the piece's own detail may still answer.
    }
    try {
      const detail = (await fetchPieceDetail(packageName)) as {
        version?: unknown;
      };
      if (typeof detail.version === "string" && detail.version !== "") {
        return { kind: "found", version: detail.version };
      }
      return { kind: "absent" };
    } catch (error) {
      // A 404 is the catalog answering that it has no such piece. Anything
      // else left the question open, and the listing above is filtered, so
      // missing from it is no answer either.
      if (isAbsentFromCatalog(error)) return { kind: "absent" };
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        "The piece catalog could not be reached for @package: @error",
        packageName,
        error,
      );
      return { kind: "unreachable", detail };
    }
  }

  private async recordCheckResult(
    document: ConnectionDocument,
    result: ConnectionCheckResult,
  ): Promise<ConnectionCheckResult> {
    const actionList: Action[] = [
      connectionActions.recordCheckResult({
        status: result.ok ? "OK" : "ERROR",
        checkedAt: new Date().toISOString(),
        error: result.ok ? undefined : (result.detail ?? undefined),
      }),
    ];
    // Stored so the connections query and the editors show it.
    const label = result.accountLabel;
    if (label && label !== (document.state.global.accountLabel ?? null)) {
      actionList.push(
        connectionActions.setAccountLabel({ accountLabel: label }),
      );
    }
    await this.host.reactorClient.execute(
      document.header.id,
      "main",
      actionList,
    );
    return result;
  }

  // The pieces this reactor holds locally, described from their own code.

  // One failure does not sink the catalog: a package whose piece cannot be
  // loaded is logged and left out, the way an unreachable listing would be.
  private async localPieces(): Promise<
    { piece: LocalPiece; descriptor: PieceDescriptor }[]
  > {
    const described = await Promise.all(
      packagePieces.entries().map(async (piece) => {
        try {
          const descriptor = await this.pieceDescriptor(
            piece.name,
            piece.version,
          );
          return { piece, descriptor };
        } catch (error) {
          this.logger.warn(
            `Could not describe the package piece "${piece.name}": ${String(error)}`,
          );
          return undefined;
        }
      }),
    );
    return described.filter((entry) => entry !== undefined);
  }

  private async localPiece(
    packageName: string,
  ): Promise<{ piece: LocalPiece; descriptor: PieceDescriptor } | undefined> {
    const piece = packagePieces.lookup(packageName);
    if (!piece) return undefined;
    return {
      piece,
      descriptor: await this.pieceDescriptor(piece.name, piece.version),
    };
  }

  // Package pieces plus the published catalog, the local ones winning their
  // own names. The listing is remote, so it may be the half that fails: with
  // local pieces to show, that is logged rather than served as no catalog.
  async pieceCatalog(): Promise<PieceSummary[]> {
    const local = await this.localPieces();
    const entries = local.map(({ piece, descriptor }) =>
      catalogEntry(descriptor, piece.name, piece.version),
    );
    const names = new Set(entries.map((entry) => entry.name));
    let published: PieceSummary[];
    try {
      published = await fetchPieceCatalog();
    } catch (error) {
      if (entries.length === 0) throw error;
      this.logger.warn(`Serving package pieces only: ${String(error)}`);
      published = [];
    }
    return [
      // The engine's blocks belong to no package; without this they are
      // absent from every listing an author browses.
      catalogEntry(CORE_DESCRIPTOR, CORE_PIECE_NAME, CORE_PIECE_VERSION),
      ...entries,
      ...published.filter((entry) => !names.has(entry.name)),
    ].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async pieceActions(packageName: string): Promise<PieceActionsResult> {
    if (packageName === CORE_PIECE_NAME) {
      return actionsResult(
        CORE_DESCRIPTOR,
        CORE_PIECE_NAME,
        CORE_PIECE_VERSION,
      );
    }
    const local = await this.localPiece(packageName);
    return local
      ? actionsResult(local.descriptor, local.piece.name, local.piece.version)
      : fetchPieceActions(packageName);
  }

  async pieceTriggers(packageName: string): Promise<PieceTriggersResult> {
    if (packageName === CORE_PIECE_NAME) {
      return triggersResult(
        CORE_DESCRIPTOR,
        CORE_PIECE_NAME,
        CORE_PIECE_VERSION,
      );
    }
    const local = await this.localPiece(packageName);
    return local
      ? triggersResult(local.descriptor, local.piece.name, local.piece.version)
      : fetchPieceTriggers(packageName);
  }

  // Catalog search, with this reactor's own pieces always in it: the index
  // behind the published half may still be building, or unreachable.
  async searchBlocks(
    query: string,
    limit?: number,
  ): Promise<BlockSearchResult> {
    const core = localSearchHits(CORE_DESCRIPTOR, CORE_PIECE_NAME);
    let local: BlockSearchIndex | undefined = indexFromHits(core);
    try {
      local = indexFromHits([
        ...core,
        ...(await this.localPieces()).flatMap(({ piece, descriptor }) =>
          localSearchHits(descriptor, piece.name),
        ),
      ]);
    } catch (error) {
      // The published half is still worth serving without them.
      this.logger.warn(`Could not index the package pieces: ${String(error)}`);
    }
    return searchBlocks(query, limit, local);
  }

  async pieceDetail(packageName: string): Promise<unknown> {
    const local = await this.localPiece(packageName);
    return local
      ? detailResult(local.descriptor, local.piece.name, local.piece.version)
      : fetchPieceDetail(packageName);
  }

  // Design-time: the action/trigger descriptor (props, auth) driving the
  // editor form; triggers come back under a "trigger" key.
  async blockDescriptor(blockType: string): Promise<unknown> {
    if (isCoreBlock(blockType)) return coreBlockDescriptor(blockType);
    const parsed = await this.resolvedBlock(blockType);
    if (!parsed) return null;
    const descriptor = await this.pieceDescriptor(
      parsed.packageName,
      parsed.version,
    );
    // Refused here so no form is ever drawn for a block that cannot run.
    if (descriptor.unsupported) {
      throw new UnsupportedPieceFeatureError(
        `Piece "${parsed.packageName}"`,
        descriptor.unsupported,
      );
    }
    const common = {
      displayName: descriptor.displayName,
      logoUrl: descriptor.logoUrl,
      auth: clientAuth(descriptor.auth),
    };
    if (parsed.kind === "trigger") {
      const trigger = descriptor.triggers.find(
        (entry) => entry.name === parsed.name,
      );
      if (trigger?.unsupported) {
        throw new UnsupportedPieceFeatureError(
          `Trigger "${parsed.name}" of "${parsed.packageName}"`,
          trigger.unsupported,
        );
      }
      return trigger ? { ...common, trigger } : null;
    }
    const action = descriptor.actions.find(
      (entry) => entry.name === parsed.name,
    );
    return action ? { ...common, action } : null;
  }

  // Design-time entry points hand a connection's live credentials to piece
  // code, so the caller must be allowed to read the connection document.

  // A missing context means the request arrived through a path that cannot
  // identify its caller; that is a refusal, not a pass.
  // Keeps only what this caller may read. Without a context nothing is
  // readable, which is what an unauthenticated listing should return.
  private async readableDocuments<T extends { header: { id: string } }>(
    documents: T[],
    ctx: WorkflowCaller | undefined,
  ): Promise<T[]> {
    if (!ctx) return [];
    const host = this.host;
    const allowed = await Promise.all(
      documents.map((document) =>
        host
          .assertCanRead(document.header.id, ctx)
          .then(() => true)
          .catch(() => false),
      ),
    );
    return documents.filter((_, index) => allowed[index]);
  }

  // The same filter for journal rows, which carry the document they belong to
  // rather than being one.
  private async readableRows<T>(
    rows: T[],
    documentIdOf: (row: T) => string,
    ctx: WorkflowCaller | undefined,
  ): Promise<T[]> {
    if (!ctx) return [];
    const allowed = await Promise.all(
      rows.map((row) => this.canReadDocument(documentIdOf(row), ctx)),
    );
    return rows.filter((_, index) => allowed[index]);
  }

  private canReadDocument(
    documentId: string,
    ctx: WorkflowCaller,
  ): Promise<boolean> {
    return this.host
      .assertCanRead(documentId, ctx)
      .then(() => true)
      .catch(() => false);
  }

  // A run carries its trigger payload and every step's input and output, drawn
  // from the documents its trigger names and those the reactor port handed its
  // steps, so it is served only to a caller who is served each of them. One no
  // longer live has no content left to protect, or a deletion's runs would be
  // served to nobody.
  private async servedRuns(
    rows: RunRow[],
    ctx: WorkflowCaller | undefined,
  ): Promise<RunRow[]> {
    if (!ctx) return [];
    const decisions = new Map<string, Promise<boolean>>();
    const store = await this.store();
    const served = await Promise.all(
      rows.map(async (row) =>
        this.servesDocuments(
          [
            ...journaledTriggerDocumentIds(row.trigger_payload),
            ...((await store?.getRunDocuments(row.id)) ?? []),
          ],
          ctx,
          decisions,
        ),
      ),
    );
    return rows.filter((_, index) => served[index]);
  }

  private async servesDocuments(
    documentIds: string[],
    ctx: WorkflowCaller,
    decisions = new Map<string, Promise<boolean>>(),
  ): Promise<boolean> {
    const served = await Promise.all(
      [...new Set(documentIds)].map((documentId) => {
        let decision = decisions.get(documentId);
        if (!decision) {
          decision = this.servesRunDocument(documentId, ctx);
          decisions.set(documentId, decision);
        }
        return decision;
      }),
    );
    return served.every(Boolean);
  }

  private async servesRunDocument(
    documentId: string,
    ctx: WorkflowCaller,
  ): Promise<boolean> {
    if (await this.canReadDocument(documentId, ctx)) return true;
    try {
      await this.host.reactorClient.get(documentId, { scopes: ["document"] });
    } catch (error) {
      return isAbsent(error);
    }
    return false;
  }

  private async assertCanReadDocument(
    documentId: string,
    ctx: WorkflowCaller | undefined,
  ): Promise<void> {
    if (!ctx) {
      throw new Error("Connection access requires an authenticated request");
    }
    await this.host.assertCanRead(documentId, ctx);
  }

  private async assertCanWriteDocument(
    documentId: string,
    ctx: WorkflowCaller | undefined,
  ): Promise<void> {
    if (!ctx) {
      throw new Error("Connection access requires an authenticated request");
    }
    await this.host.assertCanWrite(documentId, ctx);
  }

  // Design-time DROPDOWN options() / DYNAMIC props(), run in the piece worker.
  async blockOptions(
    blockType: string,
    propName: string,
    input?: unknown,
    connectionId?: string,
    ctx?: WorkflowCaller,
  ): Promise<unknown> {
    const parsed = await this.resolvedBlock(blockType);
    if (!parsed) {
      throw new Error(`Not a piece block type: "${blockType}"`);
    }
    // Auth-dependent options() resolvers need the step's connection. Nothing
    // about the request authorizes it, so the caller's own read access does.
    let auth: unknown;
    if (connectionId) {
      await this.assertCanReadDocument(connectionId, ctx);
      auth = await new DocumentConnectionResolver(
        this.host,
        this.secretProvider(),
      ).resolve(connectionId, {
        blockType,
        piecePackage: parsed.packageName,
      });
    }
    const piece = await pieceResolver().resolve(
      parsed.packageName,
      parsed.version,
    );
    this.designWorker ??= new PieceWorker();
    const result = await this.designWorker.resolveOptions(
      {
        ...pieceModuleRef(piece),
        actionName: parsed.name,
        kind: parsed.kind,
        propName,
        refresherValues: (input ?? {}) as Record<string, unknown>,
        auth,
        projectId: PROJECT_SCOPE_KEY,
        // The reactor piece's options() reads the reactor it offers choices
        // from, over the same port a step of it would use.

        // The same identity rule the run path applies: design time is not a
        // way round it, and a piece offered the member would have none.
        ...(servesReactorPort(parsed.packageName)
          ? { reactorAccess: true }
          : {}),
        // Options come from the same service the step will call: the editor
        // must not offer a choice a run cannot reach.
        ...(this.designEgress ? { egress: this.designEgress } : {}),
      },
      servesReactorPort(parsed.packageName)
        ? {
            hostCalls: reactorHandlers(
              new ScopedDesignTimeReactorPort(this.host, ctx),
            ),
          }
        : {},
    );
    return result.output;
  }

  // Authored output shape of a block, for the editor's expression picker.
  async blockOutputTree(
    blockType: string,
    config?: unknown,
  ): Promise<OutputTree> {
    const record = (config ?? {}) as Record<string, unknown>;
    switch (blockType) {
      case "core#manual":
        return { source: "none", nodes: [] };
      case SCHEDULE_BLOCK:
        return { source: "static", nodes: scheduleTriggerTree() };
      case WEBHOOK_BLOCK:
        return { source: "static", nodes: webhookTriggerTree() };
      case "core#branch":
        return {
          source: "static",
          nodes: [{ name: "condition", type: "value" }],
        };
      case "core#assert":
        return { source: "static", nodes: [{ name: "value", type: "value" }] };
      case DOCUMENT_CREATED_BLOCK:
      case DOCUMENT_DELETED_BLOCK:
        return { source: "static", nodes: lifecycleTriggerTree() };
      case DOCUMENT_EVENT_BLOCK: {
        const inputChildren = await this.operationInputFields(
          staticString(record.documentType),
          staticString(record.actionType),
        );
        return {
          source: inputChildren.length > 0 ? "schema" : "static",
          nodes: documentEventTree(inputChildren),
        };
      }
      case DOCUMENT_FIND_BLOCK:
        return { source: "static", nodes: documentFindTree() };
      case DOCUMENT_SCHEMA_BLOCK:
        return { source: "static", nodes: documentSchemaTree() };
      case DOCUMENT_TYPES_BLOCK:
        return { source: "static", nodes: documentTypesTree() };
      case DOCUMENT_GET_BLOCK: {
        // The type may come from a sibling hint when the id is an expression.
        const stateChildren = await this.stateFields(
          staticString(record.documentType),
        );
        return {
          source: stateChildren.length > 0 ? "schema" : "static",
          nodes: documentGetTree(stateChildren),
        };
      }
      case DOCUMENT_CREATE_BLOCK:
      case DOCUMENT_DISPATCH_BLOCK: {
        const stateChildren = await this.stateFields(
          staticString(record.documentType),
        );
        return {
          source: stateChildren.length > 0 ? "schema" : "static",
          nodes: documentBlockTree(stateChildren),
        };
      }
      default: {
        const parsed = await this.resolvedBlock(blockType);
        if (!parsed) return { source: "none", nodes: [] };
        // Through the service, not the published catalog: a package piece is
        // often unpublished, and its detail comes from its own descriptor.
        const detail = (await this.pieceDetail(parsed.packageName)) as {
          actions?: Record<string, unknown>;
          triggers?: Record<string, unknown>;
        };
        const entry = (
          parsed.kind === "trigger" ? detail.triggers : detail.actions
        )?.[parsed.name] as
          | { outputSchema?: unknown; sampleData?: unknown }
          | undefined;
        if (entry?.outputSchema) {
          const nodes = fromOutputSchema(entry.outputSchema);
          if (nodes.length > 0) return { source: "schema", nodes };
          // Fields that all map to the whole output: the output is a scalar.
          if (hasOutputSchemaFields(entry.outputSchema)) {
            return { source: "schema", nodes: [] };
          }
        }
        if (entry?.sampleData !== undefined && entry.sampleData !== null) {
          const nodes = fromSample(entry.sampleData);
          if (nodes.length > 0) return { source: "sample", nodes };
        }
        return { source: "none", nodes: [] };
      }
    }
  }

  private async stateFields(documentType?: string) {
    if (!documentType) return [];
    try {
      const module =
        await this.host.reactorClient.getDocumentModelModule(documentType);
      const sdl =
        module.documentModel.global.specifications.at(-1)?.state.global.schema;
      return sdl ? fieldsFromSdl(sdl) : [];
    } catch {
      return [];
    }
  }

  private async operationInputFields(
    documentType?: string,
    actionType?: string,
  ) {
    if (!documentType || !actionType) return [];
    try {
      const module =
        await this.host.reactorClient.getDocumentModelModule(documentType);
      const latest = module.documentModel.global.specifications.at(-1);
      for (const specModule of latest?.modules ?? []) {
        for (const operation of specModule.operations) {
          if (operation.name === actionType && operation.schema) {
            return fieldsFromSdl(operation.schema);
          }
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  // Runs the trigger's test hook; the test store prefix keeps cursors intact.

  // It resolves the trigger's connection and hands the credentials to piece
  // code, so the caller must be able to read both documents.
  async testTrigger(
    workflowId: string,
    ctx?: WorkflowCaller,
  ): Promise<unknown> {
    await this.assertCanReadDocument(workflowId, ctx);
    const document =
      await this.host.reactorClient.get<WorkflowDocument>(workflowId);
    const trigger = document.state.global.trigger;
    if (!trigger) throw new Error("Workflow has no trigger");
    if (trigger.connectionId) {
      await this.assertCanReadDocument(trigger.connectionId, ctx);
    }
    const { binding } = await this.pieceBinding(workflowId, trigger);
    if (!binding) {
      throw new Error(`"${trigger.blockType}" is not a piece trigger`);
    }
    return this.supervisor().test(binding);
  }

  // One child per run, N runs at a time. Sized by the operator: each slot is a
  // node process, so this is the reactor's real connector concurrency.
  private workers(): PieceWorkerPool {
    // A queue depth of 0 waits without limit, which is what one shared worker
    // did — a cap turns a saturated pool into failures instead of latency.
    return (this.pieceWorkers ??= new PieceWorkerPool({
      size: Number(process.env.PH_WORKFLOWS_RUN_CONCURRENCY) || undefined,
      maxQueueDepth:
        Number(process.env.PH_WORKFLOWS_RUN_QUEUE_DEPTH) || undefined,
    }));
  }

  async fire(
    workflowId: string,
    triggerPayload?: unknown,
    triggerKind = "manual",
    resume?: {
      completedSteps: Map<string, { output?: unknown; port?: string | null }>;
      rerunOf: string;
    },
    ctx?: WorkflowCaller,
    // A run this workflow's trigger already journaled as PENDING. Adopted
    // rather than created, so the row a matched operation left behind is the
    // row the run finishes in.
    enqueuedRunId?: string,
  ): Promise<PersistedRunResult> {
    const store = await this.store();
    let state: WorkflowState;
    // Carried out of the try so the run journal can fall back to it: a
    // workflow's state.name is a separate field from the document's name and
    // starts empty, so a workflow created without setting it stamps "" on every
    // run it ever makes. The drive still lists it correctly, which is what makes
    // the blank column in a run table look like a UI fault rather than a
    // missing value.
    let documentName: string | undefined;
    let definition: ReturnType<typeof toWorkflowDefinition>;
    try {
      // "manual" is the only kind a caller can ask for; every other one is
      // system-initiated and already authorized by whatever armed the trigger.
      if (triggerKind === "manual") {
        await this.assertCanReadDocument(workflowId, ctx);
      }
      const document =
        await this.host.reactorClient.get<WorkflowDocument>(workflowId);
      if (document.header.documentType !== "powerhouse/workflow") {
        throw new Error(
          `Document "${workflowId}" is not a powerhouse/workflow`,
        );
      }
      state = document.state.global;
      documentName = document.header.name;
      if (state.status !== "ENABLED") {
        throw new Error(
          `Workflow is ${state.status}; only ENABLED workflows can fire`,
        );
      }
      definition = toWorkflowDefinition(state);
    } catch (error) {
      // An adopted row is already durable: closing it out here is what keeps
      // a refused fire from leaving a PENDING run nothing will ever start.
      if (enqueuedRunId) {
        await store?.failRun(
          enqueuedRunId,
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
    // Bound once, to the connections this definition names: an edit landing
    // mid-run cannot widen what the run may resolve.
    const connections = declaredConnectionIds(definition);
    // Without a journal there is nowhere durable to keep ctx.store, so the
    // executor falls back to the worker's heap.
    this.executor ??= createBlockExecutor(
      this.host,
      this.secretProvider(),
      this.attachments,
      store ? createPieceStorePort(store, currentWorkflowId) : undefined,
      // A step resolves its block type the way every other caller does, so a
      // trigger that arms cannot be followed by a step that cannot start.
      async (stepBlockType) => {
        const resolution = await this.resolveBlockType(
          stepBlockType,
          `a step of workflow ${currentWorkflowId() ?? "?"}`,
        );
        return resolution.kind === "resolved" ? resolution.block : undefined;
      },
    );

    let runId: string | null = enqueuedRunId ?? null;
    if (enqueuedRunId) {
      await store?.beginRun(enqueuedRunId, {
        workflowName: runJournalName(state.name, documentName),
        workflowVersion: state.version,
      });
    } else {
      runId =
        (await store?.startRun({
          workflowId,
          workflowName: runJournalName(state.name, documentName),
          workflowVersion: state.version,
          triggerKind,
          triggerPayload,
          rerunOf: resume?.rerunOf,
        })) ?? null;
    }
    let journalFailed = false;
    // Recorded whether or not the write lands: it is what lets finishRun put a
    // lost row back where the step ran.
    const executionOrder = new Map<string, number>();
    // This run's child, forked at its first piece step and killed below. Free
    // until then, so a run of document blocks never takes a slot.
    let session: PieceWorkerSession | undefined;
    try {
      // Inside the try: a pool disposed while this run was starting up refuses
      // here, and the journal records the run as failed rather than leaving it
      // to be swept up as an orphan.
      session = this.workers().session();
      const journal = store;
      const journaledRunId = runId;
      const handed = new Set<string>();
      const result = await withRunScope(
        {
          workflowId,
          runId,
          connections,
          pieceWorker: session,
          recordDocuments: async (documentIds: string[]) => {
            for (const documentId of documentIds) handed.add(documentId);
            if (journal && journaledRunId) {
              await journal.recordRunDocuments(journaledRunId, documentIds);
            }
          },
        },
        () =>
          runWorkflow({
            definition,
            executor: this.executor!,
            triggerPayload,
            completedSteps: resume?.completedSteps,
            // Journal each step as it lands, so a reactor that dies mid-run
            // still leaves a rerunnable record of the work it finished.
            onStep:
              store && runId
                ? async (record, ordinal) => {
                    executionOrder.set(record.stepId, ordinal);
                    try {
                      await store.recordStep(runId, ordinal, record);
                    } catch (error) {
                      // Swallowed on purpose, but logged once per run: a dead
                      // journal must not look exactly like a healthy one.
                      if (journalFailed) return;
                      journalFailed = true;
                      this.logger.warn(
                        `Run ${runId}: journaling step "${record.key}" failed; the run continues without per-step durability`,
                        error,
                      );
                    }
                  }
                : undefined,
          }),
      );
      if (store && runId) {
        try {
          await store.finishRun(runId, result, executionOrder);
        } catch (error) {
          // The run is over and its result is the caller's; a journal that
          // cannot say so must not turn a finished run into a failed one.
          this.logger.warn(
            `Run ${runId}: closing the run journal out failed; the run's outcome stands`,
            error,
          );
        }
      }
      const finished = { ...result, runId };
      if (!ctx) return finished;
      // Handed back only as `run` would serve it, so a step's output never
      // reaches a caller the journal would withhold it from.
      const ids = [...triggerDocumentIds(triggerPayload), ...handed];
      return (await this.servesDocuments(ids, ctx))
        ? finished
        : { status: finished.status, steps: [], runId };
    } catch (error) {
      if (store && runId) {
        await store.failRun(
          runId,
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    } finally {
      // The run owns the child, however it ended: closing kills it and hands
      // the slot to whichever run is waiting.
      session?.close();
    }
  }

  // Resume a FAILED run: journaled step outputs replay, execution restarts
  // at the first step that didn't succeed. Runs the current definition.
  async rerun(
    runId: string,
    ctx?: WorkflowCaller,
  ): Promise<PersistedRunResult> {
    const store = await this.store();
    if (!store) throw new Error("Run journal is unavailable");
    const run = await store.getRun(runId);
    if (!run) throw new Error(`Run "${runId}" not found`);
    // A replay is the workflow's own side effects again, so it is the
    // workflow — not the run id — that the caller has to be allowed to touch.
    await this.assertCanReadDocument(run.workflow_id, ctx);
    if (!ctx || (await this.servedRuns([run], ctx)).length === 0) {
      throw new Error(`Run "${runId}" not found`);
    }
    if (run.status !== "FAILED") {
      throw new Error(`Only FAILED runs can be rerun; run is ${run.status}`);
    }
    const triggerPayload =
      run.trigger_payload === null
        ? undefined
        : (JSON.parse(run.trigger_payload) as unknown);
    // The journal holds a redacted copy of the payload, so replaying it would
    // hand a marker to whatever the trigger fed. Refuse before anything runs.
    if (containsRedactedMarker(triggerPayload)) {
      throw new Error(
        `Trigger payload of run "${runId}" was redacted and cannot be ` +
          "replayed; fire the workflow again instead of rerunning it",
      );
    }
    const document = await this.host.reactorClient.get<WorkflowDocument>(
      run.workflow_id,
    );
    const currentSteps = new Map(
      document.state.global.steps.map((step) => [step.id, step]),
    );
    // Reuse an output only while the step is still the same step: outputs
    // from renamed/retyped steps would poison downstream expressions.
    const completedSteps = new Map<
      string,
      { output?: unknown; port?: string | null }
    >();
    for (const row of await store.getSteps(runId)) {
      if (row.status !== "SUCCEEDED" && row.status !== "REPLAYED") continue;
      const current = currentSteps.get(row.step_id);
      if (
        !current ||
        current.blockType !== row.block_type ||
        current.key !== row.step_key
      ) {
        continue;
      }
      completedSteps.set(row.step_id, {
        output:
          row.output === null ? undefined : (JSON.parse(row.output) as unknown),
        port: row.port,
      });
    }
    return this.fire(
      run.workflow_id,
      triggerPayload,
      "rerun",
      { completedSteps, rerunOf: runId },
      ctx,
    );
  }
}

/** The runtime a host composes: one instance, its lifetime the host's. */
export function createWorkflowRuntime(
  deps: WorkflowRuntimeHostDeps,
): WorkflowRuntimeService {
  return new WorkflowRuntimeService(deps);
}
