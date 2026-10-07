// The workflow runtime: one instance per host, serving the GraphQL subgraph
// (config + manual fire) and the workflow-triggers read model alike.
import {
  blockKey,
  type BlockRef,
} from "@powerhousedao/pieces-framework/block-type";
import {
  checkTriggerStrategy,
  containsDocumentRef,
  documentRefsIn,
  expandDocumentRefs,
  type DocumentReference,
} from "@powerhousedao/pieces-framework/workflow";
import type { ModelManifestEntry } from "@powerhousedao/reactor";
import type {
  IWebhookEndpoints,
  IWebhookScope,
  WebhookPolicy,
  WebhookReply,
  WebhookRequest,
} from "@powerhousedao/shared/processors";
import type { WorkflowCaller, WorkflowRuntimeHostDeps } from "./host.js";

import {
  blockLabel,
  blockPorts,
  builtinPiece,
  containsRedactedMarker,
  describeBuiltinPiece,
  isHostBound,
  stepBlock,
  triggerBlock,
  declaredConnectionIds,
  declaredReactorConnectionIds,
  DEFAULT_EGRESS_POLICY,
  errorNameOf,
  resolvedBlock,
  stepConfigHash,
  pieceModuleRef,
  PieceWorker,
  PieceWorkerError,
  PieceWorkerPool,
  PieceWorkerTimeoutError,
  rememberSecrets,
  resolveStepInput,
  runWorkflow,
  RUN_DEADLINE_ERROR_NAME,
  UnsupportedPieceFeatureError,
  authMethodFor,
  isIndeterminateError,
  type PieceAuthDescriptor,
  type BlockExecutor,
  type BlockResolution,
  type LocalPiece,
  type ParsedBlockType,
  type PieceTarget,
  type PieceModuleRef,
  type CheckConnectionOutcome,
  type PieceDescriptor,
  type EgressPolicy,
  type ExpressionScope,
  type PieceWorkerSession,
  type ReplayedStep,
  type ModelManifestSource,
  type ReactorTap,
  type StepReactorRequest,
  type SecretProvider,
  type SecretStore,
  type StepExecutionRecord,
  type WorkflowRunResult,
} from "../pieces/index.js";
import {
  childLogger,
  generateId,
  type Action,
  type ILogger,
  type OperationWithContext,
} from "document-model";
import {
  actions as connectionActions,
  parseReactorConnectionConfig,
  type ConnectionDocument,
} from "@powerhousedao/workflow/document-models/connection";
import {
  exchangeCode,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_TOKEN,
  OAuthAttemptStore,
  OAuthError,
  StoreTokenRefresher,
  type OAuthAttemptView,
  type OAuthStart,
  type OAuthTokenRefresher,
} from "./oauth.js";
import {
  actions as workflowActions,
  type WorkflowDocument,
  type WorkflowState,
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
  documentEventTree,
  documentFindTree,
  documentReferenceTree,
  documentTree,
  documentSchemaTree,
  documentTypesTree,
  fieldsFromSdl,
  fromOutputSchema,
  hasOutputSchemaFields,
  fromSample,
  lifecycleTriggerTree,
  scheduleTriggerTree,
  treeValue,
  webhookTriggerTree,
  type OutputTree,
  type OutputTreeNode,
} from "./output-tree.js";
import {
  fetchPieceActions,
  fetchPieceCatalog,
  fetchPieceDetail,
  fetchPieceTriggers,
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
import { installedPiece, installedPieces } from "./piece-registry.js";
import { BlockResolver } from "./block-resolver.js";
import {
  bundleCacheDir,
  configuredEgress,
  createBlockExecutor,
  DocumentConnectionResolver,
  pieceResolver,
  resolveConnectionAuth,
  stepDefinition,
  toWorkflowDefinition,
  truncateForLog,
} from "./lib.js";
import { packageFromConnectorId } from "./connector-id.js";
import { parseScheduleConfig, schedulePayload } from "./schedule.js";
import type { AttachmentPort, PieceOrigin } from "../pieces/index.js";
import {
  isNotHereYet,
  SYNC_WAIT_MS,
  waitForSync,
  type WorkflowAccessOptions,
} from "./sync-wait.js";
import { createAttachmentPort } from "./attachment-port.js";
import {
  createPieceStorePort,
  PROJECT_SCOPE_KEY,
  testPartitionKey,
} from "./piece-store-port.js";
import {
  currentRunUser,
  currentWorkflowId,
  withRunScope,
  type RunUser,
} from "./run-scope.js";
import {
  assertConnectionReadable,
  assertReactorConnectionsReadable,
  authEnforced,
} from "./reactor-access.js";
import {
  accessDenied,
  isReactorError,
  ReactorAccessDeniedError,
} from "./reactor-errors.js";
import { buildReactorRunScope } from "./run-scope-builder.js";
import {
  designTimeScope,
  NO_JOURNAL,
  reactorTap,
  runJournal,
  unboundReactorConnection,
} from "./reactor-session.js";
import { PUBLISH_WORKFLOW, runUserOfOperation } from "./run-user.js";
import {
  ASSERT_BLOCK,
  BRANCH_BLOCK,
  isCoreBlock,
  MANUAL_BLOCK,
  SCHEDULE_BLOCK,
  WEBHOOK_BLOCK,
} from "./core-blocks.js";
import { LocalEncryptedSecretStore } from "./secret-store.js";
import { runnableDefinition } from "./runnable.js";
import { resolveVariables } from "./variables.js";
import {
  draftStepDef,
  scopeReferences,
  testStatusOf,
  triggerSamplePayload,
  untestedError,
  upstreamStepIds,
  type StepTestResult,
  type TestSample,
} from "./step-test.js";
import {
  MAX_LIST_RUNS,
  TEST_TRIGGER_KIND,
  WorkflowRunStore,
  isTruncatedStepPayload,
  journaledTriggerDocumentIds,
  triggerDocumentIds,
  type ErasedRuns,
  type FireClaim,
  type RunRow,
  type StepExecutionRow,
  type TriggerStateRow,
} from "./store.js";
import { ParkState } from "./park-state.js";
import { decodeRunCursor, encodeRunCursor } from "./run-cursor.js";
import {
  CANCELLED_RUN_STATUS,
  effectiveRunPolicy,
  type EffectiveRunPolicy,
} from "./policy.js";
import { WorkflowRunGate } from "./run-gate.js";
import {
  RETENTION_SWEEP_INTERVAL_MS,
  runRetentionMs,
  sweepRetention,
} from "./run-retention.js";
import {
  TriggerSupervisor,
  type PieceTriggerBinding,
  type TriggerBinding,
} from "./trigger-supervisor.js";
import {
  parseWebhookConfig,
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
  triggerKindOf,
  type DocumentEventFilter,
  type LifecycleFilter,
  type TriggerKind,
} from "./trigger-filters.js";

/** Why a firing was journaled CANCELLED without running, when it was. */
export type FiringRefusal =
  | "parked"
  | "singleton"
  | "stale"
  | "queue-full"
  | "expired";

/** A firing refused because this runtime has shut down (the workflow
 * singleton moved, or the host is stopping): retryable elsewhere. */
export class WorkflowRuntimeClosedError extends Error {
  constructor(readonly workflowId: string) {
    super(
      `Workflow ${workflowId} was not run: this workflow runtime has shut down`,
    );
    this.name = "WorkflowRuntimeClosedError";
  }
}

export type PersistedRunResult = WorkflowRunResult & {
  runId: string | null;
  refusal?: FiringRefusal;
};

// The piece a resolved block type loads.
function targetOf(block: ParsedBlockType): PieceTarget {
  return {
    name: block.packageName,
    version: block.version,
    ...(block.source ? { source: block.source } : {}),
  };
}

function localTarget(piece: LocalPiece): PieceTarget {
  return { name: piece.name, version: piece.version, source: "local" };
}

function bindingTarget(binding: PieceTriggerBinding): PieceTarget {
  return {
    name: binding.packageName,
    version: binding.version,
    ...(binding.source ? { source: binding.source } : {}),
  };
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

export interface RunsArgs {
  workflowId?: string;
  driveId?: string;
  limit?: number;
  // Left out in SQL, so they never cost a page its rows.
  excludeTriggerKinds?: string[];
  // False leaves each step's input and output out (null).
  withStepData?: boolean;
}

export interface RunsPageArgs extends RunsArgs {
  // From a previous page; resumes after its last run.
  cursor?: string | null;
}

export interface RunPage {
  records: RunRecord[];
  hasNextPage: boolean;
  // Pass back as `cursor` for the next page; null when the page is empty.
  cursor: string | null;
}

// Rows one page request may read past unreadable ones before it returns short.
const RUNS_SCAN_LIMIT = 1000;

/** One draft block as this reactor resolves it. */
export interface BlockResolutionRecord {
  stepId: string;
  pieceName: string;
  // The version the block pins.
  pieceVersion: string;
  name: string;
  kind: "action" | "trigger";
  resolvedVersion: string | null;
  source: string | null;
  match: string;
  note: string | null;
  latestVersion: string | null;
}

export interface TriggerTestOptions extends WorkflowAccessOptions {
  // The core manual trigger: the sample payload.
  payload?: unknown;
  // The core webhook trigger: how long to wait for a delivery, capped at 5 minutes.
  timeoutMs?: number;
}

const WEBHOOK_TEST_TIMEOUT_MS = 5 * 60_000;

interface WebhookTest {
  config: WebhookConfig;
  resolve: (payload: WebhookPayload) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

function draftBlocks(state: WorkflowState): { id: string; block: BlockRef }[] {
  return [
    ...(state.trigger
      ? [{ id: state.trigger.id, block: triggerBlock(state.trigger) }]
      : []),
    ...state.steps.map((step) => ({ id: step.id, block: stepBlock(step) })),
  ];
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

// A journal that failed to open is tried again, no sooner than this, doubling.
const STORE_REOPEN_MS = 1_000;
const MAX_STORE_REOPEN_MS = 60_000;

// Fires run without a journal row that this process remembers, oldest dropped.
const UNJOURNALED_FIRES_LIMIT = 65_536;

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

const ABSENT_ERROR_NAMES = new Set([
  "DocumentNotFoundError",
  "DocumentPurgedError",
  "DocumentDeletedError",
]);

// Absence is reported by name: the error may cross an RPC boundary.
function isAbsent(error: unknown): boolean {
  return error instanceof Error && ABSENT_ERROR_NAMES.has(error.name);
}

// A marker names its document's type in its input; the context agrees.
function purgedWorkflowIds(markers: OperationWithContext[]): string[] {
  const ids = markers
    .filter(
      ({ operation, context }) =>
        (stringField(inputRecord(operation.action.input), "documentType") ??
          context.documentType) === WORKFLOW_DOCUMENT_TYPE,
    )
    .map(({ context }) => context.documentId);
  return [...new Set(ids)];
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

// How long one source's version listing may take; registration and seeding
// await it, and a source that does not answer in time contributes nothing.
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

// What a registration is decided from, so a draft edit can be told apart.
// A sync webhook's answer to a firing that did not succeed. A deliberate
// refusal is a 409 and an overloaded lane a 429, so a provider does not retry
// either as a server error; anything else is one.
function refusalStatus(refusal: FiringRefusal | undefined): number {
  switch (refusal) {
    case "parked":
    case "singleton":
    case "stale":
      return 409;
    case "queue-full":
    case "expired":
      return 429;
    default:
      return 500;
  }
}

// Runs an operator started rather than a trigger fired.
const OPERATOR_RUN_KINDS: ReadonlySet<string> = new Set(["manual", "rerun"]);

function registrationKey(state: WorkflowState): string {
  const trigger = runnableDefinition(state).trigger;
  // The trigger's last test never changes what arms.
  const { lastTest: _lastTest, ...armed } = trigger ?? {};
  return JSON.stringify({ status: state.status, trigger: trigger && armed });
}

// The reducer refuses a config that is not an object, so none reaches here.
function configRecord(config: unknown): Record<string, unknown> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return config as Record<string, unknown>;
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
  private storePromise: Promise<WorkflowRunStore>;
  private storeError?: unknown;
  private storeOpening = false;
  private storeReopenAt = 0;
  private storeReopenMs = STORE_REOPEN_MS;
  private retentionSweep?: () => void;
  private secretsPromise?: Promise<SecretStore>;
  private oauthAttemptsPromise?: Promise<OAuthAttemptStore>;
  private tokenRefresher?: OAuthTokenRefresher;
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
    this.blockResolver = new BlockResolver({
      local: installedPiece,
      timeoutMs: host.pieceVersionLookupMs ?? PIECE_VERSION_LOOKUP_TIMEOUT_MS,
      hasBlock: (ref, version, source) =>
        this.versionHasBlock(ref, version, source),
    });
    this.logger = host.logger ?? logger;
    this.attachments = host.attachments
      ? createAttachmentPort(
          host.attachments,
          () => currentWorkflowId(),
          // A host that serves attachments without answering for them reads
          // nothing: an unanswered read is not a permitted one.
          (documentId, ref) =>
            host.canReadAttachmentRef?.(documentId, ref) ??
            Promise.resolve(false),
        )
      : undefined;
    this.storePromise = this.openStore();
    this.seedPromise = this.seedWithRetries();
    this.startRetention();
  }

  private retentionTimer?: ReturnType<typeof setInterval>;

  private startRetention(): void {
    const retentionMs = runRetentionMs();
    if (retentionMs === undefined) return;
    const sweep = () => {
      void this.sweepRetention(retentionMs);
    };
    this.retentionTimer = setInterval(sweep, RETENTION_SWEEP_INTERVAL_MS);
    this.retentionTimer.unref();
    // After the store opens, not on the next hour.
    this.retentionSweep = sweep;
  }

  private async sweepRetention(retentionMs: number): Promise<void> {
    const store = await this.store();
    if (!store) return;
    try {
      const swept = await sweepRetention(store, {
        retentionMs,
        dedupeTtlMs: OPERATION_DEDUPE_TTL_MS,
      });
      if (swept.runs > 0) {
        this.logger.info(
          `Pruned ${swept.runs} workflow run(s) past the retention window`,
        );
      }
    } catch (error) {
      this.logger.warn("Workflow run retention sweep failed: @error", error);
    }
  }

  // The journal is best-effort: a broken store never blocks runs. One that
  // failed to open is opened again once its backoff has passed.
  async store(): Promise<WorkflowRunStore | undefined> {
    // Never (re)opened after shutdown: opening runs the sweeps, which would
    // fail the next owner's live runs. One already open stays readable, so
    // what this process adopted can still be closed out.
    if (
      !this.closed &&
      this.storeError !== undefined &&
      !this.storeOpening &&
      Date.now() >= this.storeReopenAt
    ) {
      this.storePromise = this.openStore();
    }
    try {
      return await this.storePromise;
    } catch {
      return undefined;
    }
  }

  private openStore(): Promise<WorkflowRunStore> {
    this.storeOpening = true;
    const opening = WorkflowRunStore.create(this.host.relationalDb);
    opening.then(
      () => {
        this.storeOpening = false;
        if (this.storeError !== undefined) {
          this.logger.info("Workflow run store opened after failing to");
        }
        this.storeError = undefined;
        this.storeReopenMs = STORE_REOPEN_MS;
        this.retentionSweep?.();
      },
      (error: unknown) => {
        this.storeOpening = false;
        this.storeError = error;
        this.storeReopenAt = Date.now() + this.storeReopenMs;
        this.logger.error(
          "Failed to open the workflow run store, retrying in @ms ms: @error",
          this.storeReopenMs,
          error,
        );
        this.storeReopenMs = Math.min(
          this.storeReopenMs * 2,
          MAX_STORE_REOPEN_MS,
        );
      },
    );
    return opening;
  }

  // Unlike the journal, a broken secret store must fail resolution loudly.
  secrets(): Promise<SecretStore> {
    this.secretsPromise ??=
      this.host.secrets !== undefined
        ? Promise.resolve(this.host.secrets)
        : LocalEncryptedSecretStore.create(this.host.relationalDb, {
            keyFile: this.host.secretsKeyFile,
          });
    return this.secretsPromise;
  }

  private secretProvider(): SecretProvider {
    return { get: (ref) => this.secrets().then((store) => store.get(ref)) };
  }

  private oauthAttempts(): Promise<OAuthAttemptStore> {
    this.oauthAttemptsPromise ??= OAuthAttemptStore.create(
      this.host.relationalDb,
    );
    return this.oauthAttemptsPromise;
  }

  private oauthRefresher(): OAuthTokenRefresher {
    return (this.tokenRefresher ??= new StoreTokenRefresher(
      () => this.secrets(),
      this.designEgress,
    ));
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
      const state = document.state.global;
      // Denials live in memory, so a restart re-checks before arming.
      if (state.status === "ENABLED") {
        await this.seedReactorAccess(document.header.id, state);
      }
      await this.updateRegistration(document.header.id, state);
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

  // The registration key each workflow was last registered from.
  private readonly registeredAs = new Map<string, string>();

  // Awaited by callers: the registry must be current before the next request
  // can arrive. Only arming, which does I/O, is left to run on its own.

  // One chain per workflow, so its registrations apply in arrival order: a
  // slow one for an older snapshot cannot finish after a newer one.
  private readonly registrationChains = new Map<string, Promise<void>>();

  private inRegistrationOrder<T>(
    workflowId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const prior = this.registrationChains.get(workflowId) ?? Promise.resolve();
    const run = prior.then(task);
    const tail: Promise<void> = run.then(
      () => undefined,
      () => undefined,
    );
    this.registrationChains.set(workflowId, tail);
    void tail.then(() => {
      if (this.registrationChains.get(workflowId) === tail) {
        this.registrationChains.delete(workflowId);
      }
    });
    return run;
  }

  // Registers the runnable trigger; `onlyIfChanged` passes over draft edits.
  private updateRegistration(
    workflowId: string,
    state: WorkflowState,
    onlyIfChanged = false,
  ): Promise<void> {
    return this.inRegistrationOrder(workflowId, () =>
      this.registerNow(workflowId, state, onlyIfChanged),
    );
  }

  private async registerNow(
    workflowId: string,
    state: WorkflowState,
    onlyIfChanged: boolean,
  ): Promise<void> {
    const key = registrationKey(state);
    if (
      onlyIfChanged &&
      !this.unarmed.has(workflowId) &&
      this.registeredAs.get(workflowId) === key &&
      // The key leaves the version out, but a re-publish lifts a park.
      !(await this.outdatedPark(workflowId, state))
    ) {
      return;
    }
    this.registeredAs.set(workflowId, key);
    try {
      await this.applyRegistration(workflowId, state);
    } catch (error) {
      this.registeredAs.delete(workflowId);
      throw error;
    }
  }

  private async applyRegistration(
    workflowId: string,
    state: WorkflowState,
  ): Promise<void> {
    // The ERROR row an unresolvable trigger leaves outlives the trigger, so a
    // workflow registering anything now drops it first, ahead of what follows.
    if (this.unarmed.delete(workflowId)) this.dropSupervised(workflowId);
    // Whatever this registration decides supersedes the pending retry, which
    // re-arms itself below if the catalog is still away.
    this.cancelResolutionRetry(workflowId);
    const denial =
      state.status === "ENABLED"
        ? this.reactorDenials.get(workflowId)
        : undefined;
    if (denial) {
      this.refuseArming(workflowId, state, denial);
      return;
    }
    const trigger =
      state.status === "ENABLED"
        ? runnableDefinition(state).trigger
        : undefined;
    const block = trigger ? triggerBlock(trigger) : undefined;
    const version = runnableDefinition(state).version;
    // Disabling clears a park, so re-enabling arms the trigger again; so does
    // a re-publish, which the version that failed no longer matches.
    if (state.status !== "ENABLED") {
      const held = this.registry.get(workflowId);
      // With the binding held, the supervisor's disable below releases a
      // PARKED row through onDisable; flipping it DISABLED first would skip
      // that release. With none (a boot), nothing here can run onDisable.
      // Not awaited: the lane runs it before the remove() enqueued below.
      this.supervisor()
        .releasePark(workflowId, !(held && SUPERVISED_KINDS.has(held.kind)))
        .catch((error: unknown) => {
          this.logger.error(
            `Could not clear the park of disabled workflow ${workflowId}`,
            error,
          );
        });
    } else if (await this.outdatedPark(workflowId, state)) {
      // Not awaited either: queued ahead of the upsert below.
      this.supervisor()
        .unpark(workflowId, version)
        .catch((error: unknown) => {
          this.logger.error(
            `Could not lift the outdated park of workflow ${workflowId}`,
            error,
          );
        });
    }
    // A park the supervisor does not see: matching nothing is what stops it.
    const park = block ? await this.parks.get(workflowId) : undefined;
    if (
      block &&
      (blockKey(block) === WEBHOOK_BLOCK || triggerKindOf(block)) &&
      park &&
      park.published_version >= version
    ) {
      const had = this.registry.get(workflowId);
      this.registry.delete(workflowId);
      if (had && SUPERVISED_KINDS.has(had.kind))
        this.dropSupervised(workflowId);
      this.logger.warn(
        `Workflow ${workflowId} is PARKED; its trigger stays unarmed until the workflow is re-published or re-enabled`,
      );
      return;
    }
    if (block && blockKey(block) === WEBHOOK_BLOCK) {
      await this.registerWebhook(workflowId, block, trigger!.config);
      return;
    }
    const kind: TriggerKind | undefined = block
      ? triggerKindOf(block)
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
        this.enableSupervised(workflowId, supervised, version);
        return;
      }
      // Registered as a poll binding first, then corrected once the piece's
      // strategy is known: a WEBHOOK trigger must never be handed to the tick.
      this.registry.set(workflowId, { workflowId, kind: "piece" });
      await this.registerPieceTrigger(workflowId, supervised, version);
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

  private enableSupervised(
    workflowId: string,
    binding: TriggerBinding,
    publishedVersion: number,
  ): void {
    this.supervisor()
      .upsert(binding, publishedVersion)
      .catch((error: unknown) => {
        this.logger.error(`Trigger enable failed for ${workflowId}`, error);
      });
  }

  // A WEBHOOK-strategy piece needs its endpoint minted before onEnable runs:
  // the piece registers that URL with the provider from inside the hook.
  private async registerPieceTrigger(
    workflowId: string,
    binding: PieceTriggerBinding,
    publishedVersion: number,
  ): Promise<void> {
    const delivery = await this.pieceDelivery(binding);
    if (typeof delivery !== "string") {
      this.refusePieceTrigger(workflowId, binding, delivery);
      return;
    }
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
    this.enableSupervised(workflowId, resolved, publishedVersion);
  }

  // From the descriptor of the version that will run; never a guess.
  private async pieceDelivery(
    binding: PieceTriggerBinding,
  ): Promise<"poll" | "webhook" | { reason: string; retry: boolean }> {
    let strategy: unknown;
    try {
      const descriptor = await this.pieceDescriptor(bindingTarget(binding));
      const trigger = descriptor.triggers.find(
        (entry) => entry.name === binding.triggerName,
      );
      if (!trigger) {
        return {
          reason: `${binding.packageName}@${binding.version} has no trigger "${binding.triggerName}"`,
          retry: false,
        };
      }
      strategy = trigger.strategy;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        reason: `Could not describe ${blockLabel(binding.block)}: ${message}`,
        retry: true,
      };
    }
    const check = checkTriggerStrategy(strategy);
    if ("issue" in check) return { reason: check.issue, retry: false };
    if (check.delivery === "manual") {
      return {
        reason: "A piece's MANUAL trigger cannot be armed here",
        retry: false,
      };
    }
    return check.delivery;
  }

  // An ERROR row, not a fallback: a trigger armed the wrong way never fires.
  private refusePieceTrigger(
    workflowId: string,
    binding: PieceTriggerBinding,
    refusal: { reason: string; retry: boolean },
  ): void {
    this.registry.delete(workflowId);
    this.unarmed.add(workflowId);
    const retryAt = refusal.retry
      ? new Date(Date.now() + this.scheduleResolutionRetry(workflowId))
      : undefined;
    const reason = `The trigger ${blockLabel(binding.block)} is not armed: ${refusal.reason}`;
    this.logger.warn("Workflow @workflow: @reason", workflowId, reason);
    this.supervisor()
      .reject(workflowId, binding.block, binding.config, reason, retryAt)
      .catch((error: unknown) => {
        this.logger.error(
          `Could not record the refused trigger for workflow ${workflowId}`,
          error,
        );
      });
  }

  // A disabled or retyped webhook trigger loses its registry entry, so
  // deliveries stop; the endpoint row stays so re-enabling keeps the URL.
  private async registerWebhook(
    workflowId: string,
    block: BlockRef,
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
        `Webhook trigger rejected for ${workflowId}: @error`,
        message,
      );
      // An ERROR row, as for any trigger that cannot arm; cleared on re-registration.
      this.unarmed.add(workflowId);
      this.supervisor()
        .reject(workflowId, block, configRecord(rawConfig), message)
        .catch((recordError: unknown) => {
          this.logger.error(
            `Could not record the rejected webhook trigger for workflow ${workflowId}`,
            recordError,
          );
        });
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
    const block = triggerBlock(trigger);
    if (blockKey(block) === SCHEDULE_BLOCK) {
      return {
        binding: {
          kind: "schedule",
          workflowId,
          block,
          config: configRecord(trigger.config),
        },
      };
    }
    // The other core triggers are fed by the host: nothing for the tick to drive.
    if (isCoreBlock(block)) return {};
    return this.pieceBinding(workflowId, trigger);
  }

  private async pieceBinding(
    workflowId: string,
    trigger: NonNullable<WorkflowState["trigger"]>,
  ): Promise<{ binding?: PieceTriggerBinding; resolution: BlockResolution }> {
    const block = triggerBlock(trigger);
    const resolution = await this.resolveBlock(block);
    const parsed = resolvedBlock(resolution);
    // An action is no more a trigger than an unresolved block is.
    if (parsed?.kind !== "trigger") return { resolution };
    const { config, pollIntervalMs } = splitPollInterval(
      configRecord(trigger.config),
    );
    const settings = trigger.propertySettings?.filter(
      (setting) => setting.schema !== null && setting.schema !== undefined,
    );
    return {
      resolution,
      binding: {
        workflowId,
        block,
        packageName: parsed.packageName,
        version: parsed.version,
        ...(parsed.source ? { source: parsed.source } : {}),
        match: resolution.match,
        ...(resolution.note ? { note: resolution.note } : {}),
        triggerName: parsed.name,
        config,
        connectionId: trigger.connectionId,
        reactorConnectionId: trigger.reactorConnectionId,
        pollIntervalMs,
        ...(settings && settings.length > 0
          ? { propertySettings: settings }
          : {}),
      },
    };
  }

  // The one resolution policy (block-resolver.ts), for steps, triggers, design
  // time and step tests alike. Bounded per source: an unreachable one adds nothing.
  private readonly blockResolver: BlockResolver;

  // Descriptors are cached per version, so a candidate is described once.
  private async versionHasBlock(
    ref: BlockRef,
    version: string,
    source: PieceOrigin,
  ): Promise<boolean | undefined> {
    let descriptor: PieceDescriptor;
    try {
      descriptor = await this.pieceDescriptor({
        name: ref.pieceName,
        version,
        source,
      });
    } catch (error) {
      // Loading fails the step itself, with the piece's own error.
      this.logger.debug(
        "Could not describe @piece: @error",
        ref.pieceName,
        error,
      );
      return undefined;
    }
    const entries =
      ref.kind === "trigger" ? descriptor.triggers : descriptor.actions;
    return entries.some((entry) => entry.name === ref.name);
  }

  // (block, version, source) triples already logged as off-pin.
  private readonly loggedResolutions = new Set<string>();

  // The closest version that has the named block (versionHasBlock).
  async resolveBlock(
    block: BlockRef,
    options: { fresh?: boolean; latest?: boolean } = {},
  ): Promise<BlockResolution> {
    const resolution = await this.blockResolver.resolve(block, options);
    if (resolvedBlock(resolution)) this.logResolution(resolution);
    return resolution;
  }

  private logResolution(resolution: BlockResolution): void {
    if (!resolution.note || !resolution.resolved) return;
    const key = `${blockLabel(resolution.requested)}\u0000${resolution.resolved.version}\u0000${resolution.resolved.source ?? ""}`;
    if (this.loggedResolutions.has(key)) return;
    this.loggedResolutions.add(key);
    // Scoped names travel as logger values; inline they print as null/pack.
    this.logger.info(
      "Block @block: @note",
      blockLabel(resolution.requested),
      resolution.note,
    );
  }

  // For the callers that only need the piece.
  private async resolvedPiece(
    block: BlockRef,
  ): Promise<ParsedBlockType | undefined> {
    return resolvedBlock(await this.resolveBlock(block));
  }

  // Why the last publish or enable failed the reactor read check (ADR 0005
  // §6). Such a workflow stays unarmed until a later publish or enable passes.
  private readonly reactorDenials = new Map<string, string>();

  // True when the denial changed, so registration must be redone.
  private async recheckReactorAccess(
    workflowId: string,
    operation: OperationWithContext["operation"],
  ): Promise<boolean> {
    if (operation.error !== undefined) return false;
    const type = operation.action.type;
    const enabling =
      type === "SET_WORKFLOW_STATUS" &&
      (operation.action.input as { status?: string } | undefined)?.status ===
        "ENABLED";
    if (type !== PUBLISH_WORKFLOW && !enabling) return false;
    const state =
      parseWorkflowState(operation.resultingState) ??
      (await this.host.reactorClient.get<WorkflowDocument>(workflowId)).state
        .global;
    const before = this.reactorDenials.get(workflowId);
    await this.checkReactorAccess(
      workflowId,
      state,
      type === PUBLISH_WORKFLOW
        ? runUserOfOperation(operation, this.host.hostIdentity)
        : undefined,
    );
    return this.reactorDenials.get(workflowId) !== before;
  }

  // Records a denial when the run user may not read the snapshot's reactor
  // connections; any other error is thrown.
  private async checkReactorAccess(
    workflowId: string,
    state: WorkflowState,
    runUser?: RunUser | null,
  ): Promise<void> {
    const { trigger, steps } = runnableDefinition(state);
    const connectionIds = declaredReactorConnectionIds({
      trigger,
      steps,
      edges: [],
    });
    try {
      await assertReactorConnectionsReadable(
        this.host,
        workflowId,
        connectionIds,
        runUser,
      );
      this.reactorDenials.delete(workflowId);
    } catch (error) {
      if (!isReactorError(error, ReactorAccessDeniedError)) throw error;
      this.reactorDenials.set(workflowId, error.message);
    }
  }

  // At seeding, a check that fails for any reason leaves the workflow unarmed.
  private async seedReactorAccess(
    workflowId: string,
    state: WorkflowState,
  ): Promise<void> {
    try {
      await this.checkReactorAccess(workflowId, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        "Could not check reactor access for workflow @workflow: @error",
        workflowId,
        error,
      );
      this.reactorDenials.set(workflowId, message);
    }
  }

  // Why a workflow is not armed, or undefined when the reactor check passed.
  reactorAccessDenial(workflowId: string): string | undefined {
    return this.reactorDenials.get(workflowId);
  }

  private refuseArming(
    workflowId: string,
    state: WorkflowState,
    reason: string,
  ): void {
    const had = this.registry.get(workflowId);
    this.registry.delete(workflowId);
    if (had && SUPERVISED_KINDS.has(had.kind)) this.dropSupervised(workflowId);
    this.logger.warn(
      "Workflow @workflow is not armed: @reason",
      workflowId,
      reason,
    );
    this.unarmed.add(workflowId);
    const trigger = runnableDefinition(state).trigger;
    if (!trigger) return;
    this.supervisor()
      .reject(
        workflowId,
        triggerBlock(trigger),
        configRecord(trigger.config),
        reason,
      )
      .catch((error: unknown) => {
        this.logger.error(
          `Could not record the reactor access denial for workflow ${workflowId}`,
          error,
        );
      });
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
    const block = triggerBlock(trigger);
    // Only a piece trigger is a failure here: the core manual trigger reaches
    // this path in the ordinary course of things.
    if (isCoreBlock(block)) return;
    const unreachable = resolution?.unreachable;
    const retryAt = unreachable
      ? new Date(Date.now() + this.scheduleResolutionRetry(workflowId))
      : undefined;
    const detail = resolution?.note ?? "it does not resolve";
    const reason = unreachable
      ? `The piece behind the trigger ${blockLabel(block)} could not be resolved, so this workflow is not armed: ${detail}. ` +
        `Retrying at ${retryAt?.toISOString() ?? "the next registration"}; this is a connectivity failure, not a missing piece.`
      : `The trigger ${blockLabel(block)} does not resolve, so this workflow will not arm: ${detail}.`;
    this.logger.warn("Workflow @workflow: @reason", workflowId, reason);
    this.unarmed.add(workflowId);
    this.supervisor()
      .reject(workflowId, block, configRecord(trigger.config), reason, retryAt)
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
    onlyIfChanged = false,
  ): Promise<void> {
    // Parsed before awaiting, so only a malformed state falls through to a
    // fresh read; a registration failure must not trigger one.
    const carried = parseWorkflowState(resultingState);
    if (carried) {
      await this.updateRegistration(workflowId, carried, onlyIfChanged);
      return;
    }
    const document =
      await this.host.reactorClient.get<WorkflowDocument>(workflowId);
    await this.updateRegistration(
      workflowId,
      document.state.global,
      onlyIfChanged,
    );
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

  // Throws on any failure, so the read model's cursor holds and retries.
  async onDocumentsPurged(
    markers: OperationWithContext[],
  ): Promise<ErasedRuns> {
    this.throwIfClosed();
    const documentIds = [
      ...new Set(markers.map((marker) => marker.context.documentId)),
    ];
    const store = await this.store();
    if (!store) {
      this.logger.error(
        "Run journal unavailable; purged documents @ids are not erased and the triggers cursor holds until it reopens: @error",
        documentIds,
        this.storeError,
      );
      throw new Error("Erasing purged documents needs the run journal", {
        cause: this.storeError,
      });
    }
    for (const workflowId of purgedWorkflowIds(markers)) {
      await this.erasePurgedWorkflow(store, workflowId);
    }
    const erased = await store.eraseRunsForDocuments(documentIds);
    if (erased.runs > 0) {
      this.logger.info(
        "Erased @runs workflow run(s) of purged documents @ids",
        erased.runs,
        documentIds,
      );
    }
    return erased;
  }

  // Called by the workflow-triggers read model. Registry updates and the
  // journal write for every matched fire are awaited; execution is not, so
  // runs never block operation ingestion.
  async onOperations(operations: OperationWithContext[]): Promise<void> {
    this.throwIfClosed();
    const hints = collectLifecycleParentHints(operations);
    for (const { operation, context } of operations) {
      this.throwIfClosed();
      if (context.scope !== DOCUMENT_SCOPE && context.scope !== "global") {
        continue;
      }
      const opKey = operationKey({ operation, context });
      if (this.alreadySeen(opKey)) continue;
      if (context.scope === DOCUMENT_SCOPE) {
        await this.matchDocumentLifecycle(operation, context, hints);
        await this.forgetDeletedWorkflow(operation, context);
        continue;
      }
      // A workflow edit updates the registry, then falls through: workflow docs are
      // also a document-event source, so a workflow can watch its own type.
      if (context.documentType === "powerhouse/workflow") {
        // Publish and enable re-check reactor access first.
        const rechecked = await this.recheckReactorAccess(
          context.documentId,
          operation,
        );
        // Only a status or published-trigger change re-arms.
        await this.refreshRegistration(
          context.documentId,
          operation.resultingState,
          !rechecked,
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
          `op:${opKey}`,
        );
      }
      if (context.documentType === DRIVE_DOCUMENT_TYPE) {
        await this.matchDriveLifecycle(
          context.documentId,
          operation.action.type,
          operation.action.input,
          { index: operation.index, timestampUtcMs: operation.timestampUtcMs },
        );
      }
    }
  }

  // Fires this process ran with no journal row, until the journal takes one.
  // A held triggers cursor re-sweeps them past alreadySeen's window.
  private readonly unjournaledFires = new Set<string>();

  private fireUnjournaled(
    fireKey: string,
    workflowId: string,
    payload: unknown,
    kind: string,
  ): void {
    this.unjournaledFires.add(fireKey);
    if (this.unjournaledFires.size > UNJOURNALED_FIRES_LIMIT) {
      const oldest = this.unjournaledFires.values().next().value!;
      this.unjournaledFires.delete(oldest);
      this.logger.warn(
        "Too many unjournaled workflow fires held; a redelivery of the oldest fires again",
      );
    }
    this.fireFromTrigger(workflowId, payload, kind);
  }

  // Journals the fire, then lets it run on its own. Awaiting only the write is
  // the whole point: once this resolves the run is durable, so the read model's
  // cursor may pass the operation that matched it, but nothing here waits on a
  // piece. A journal that cannot take the row still fires, best-effort, and
  // once only in this process: a redelivery claims its dedupe key instead.
  private async enqueueFire(
    workflowId: string,
    payload: unknown,
    kind: string,
    dedupeKey: string,
  ): Promise<void> {
    const fireKey = JSON.stringify([workflowId, dedupeKey]);
    const store = await this.store();
    if (this.unjournaledFires.has(fireKey)) {
      if (!store) return;
      try {
        const claimed = await store.claimDedupe(
          workflowId,
          dedupeKey,
          OPERATION_DEDUPE_TTL_MS,
          new Date().toISOString(),
        );
        if (!claimed) {
          // The key already stood for a fire, so this one may have doubled it.
          this.logger.warn(
            `Workflow ${workflowId}: a ${kind} fire this process ran unjournaled had its key already marked fired; it may have run twice`,
          );
        }
        this.unjournaledFires.delete(fireKey);
      } catch (error) {
        this.logger.warn(
          `Could not record the unjournaled ${kind} fire for workflow ${workflowId}: @error`,
          error,
        );
      }
      return;
    }
    if (!store) {
      this.fireUnjournaled(fireKey, workflowId, payload, kind);
      return;
    }
    // The durable half of the dedupe: a crash can leave the cursor behind the
    // run it already wrote, so the replay delivers this operation a second
    // time. The claim counts deliveries, so a fire that takes the process down
    // BEFORE it journals anything is bounded instead of replayed every boot.
    const enqueue = { workflowId, triggerKind: kind, triggerPayload: payload };
    let claim: FireClaim;
    try {
      claim = await store.claimAndEnqueueRun(
        dedupeKey,
        OPERATION_DEDUPE_TTL_MS,
        new Date().toISOString(),
        enqueue,
      );
    } catch (error) {
      this.logger.error(
        `Could not journal the ${kind} fire for workflow ${workflowId}; running it without a durable record`,
        error,
      );
      this.fireUnjournaled(fireKey, workflowId, payload, kind);
      return;
    }
    if (claim.outcome === "duplicate") return;
    if (claim.outcome === "abandoned") {
      // Loudly, and with a run to point at: the alternative is a reactor that
      // crashes on every boot and says nothing about why.
      this.logger.error(
        `Workflow ${workflowId}: a ${kind} fire has been delivered ` +
          `${claim.attempts} times without ever journaling a run; abandoning ` +
          "it rather than replaying it on every boot",
      );
      try {
        await store.journalAbandonedFire(dedupeKey, {
          ...enqueue,
          attempts: claim.attempts,
        });
      } catch (error) {
        this.logger.warn(
          `Could not journal the abandoned ${kind} fire for workflow ${workflowId}: @error`,
          error,
        );
      }
      return;
    }
    this.fireFromTrigger(workflowId, payload, kind, claim.runId);
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
        // The message, truncated, rather than the error object: a piece error
        // carries the HTTP response the framework's formatter lifted out of
        // it, which can be a whole HTML error page. An unbounded write on the
        // failure path is how the EPIPE boot loop started (backlog item 5).
        this.logger.error(
          `${kind} run failed for workflow ${workflowId}: @error`,
          truncateForLog(
            error instanceof Error ? error.message : String(error),
          ),
        );
      },
    );
  }

  // Skips the second source of a lifecycle fire; the journal's per-document claim
  // decides. Only a match is recorded, so an unknown drive leaves ADD_FILE its turn.
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
      // Keyed on the document, not the operation: its CREATE_DOCUMENT and the
      // drive's ADD_FILE project concurrently, and one claim must win.
      await this.enqueueFire(
        target.workflowId,
        payload,
        kind,
        `lifecycle:${kind}:${payload.documentId}`,
      );
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

  // A deleted workflow is disarmed as a disabled one is, and its trigger row,
  // webhook token and dedupe keys go with it.
  private async forgetDeletedWorkflow(
    operation: OperationWithContext["operation"],
    context: OperationWithContext["context"],
  ): Promise<void> {
    if (operation.action.type !== "DELETE_DOCUMENT") return;
    if (operation.error !== undefined) return;
    if (context.documentType !== WORKFLOW_DOCUMENT_TYPE) return;
    const workflowId =
      stringField(inputRecord(operation.action.input), "documentId") ??
      context.documentId;
    this.disarmDeleted(workflowId);
    try {
      const store = await this.store();
      await store?.deleteDedupe(workflowId);
    } catch (error) {
      this.logger.warn(
        `Could not drop the dedupe keys of deleted workflow ${workflowId}`,
        error,
      );
    }
  }

  // Off the ingestion path: the release queues behind any enable in flight.
  private disarmDeleted(workflowId: string): void {
    this.dropDeleted(workflowId);
    this.releaseDeleted(workflowId).catch((error: unknown) => {
      this.logger.error(
        `Could not disarm deleted workflow ${workflowId}`,
        error,
      );
    });
  }

  // The registry goes now, so deliveries stop at once.
  private dropDeleted(workflowId: string): void {
    this.registry.delete(workflowId);
    this.registeredAs.delete(workflowId);
    this.unarmed.delete(workflowId);
    this.cancelResolutionRetry(workflowId);
    this.cancelTriggerTest(workflowId, "stopped: the workflow was deleted");
  }

  // onDisable, the trigger row, FLOW store and park, then the webhook token,
  // which goes however the rest went.
  private async releaseDeleted(workflowId: string): Promise<void> {
    let failure: { error: unknown } | undefined;
    try {
      await this.supervisor().forget(workflowId);
    } catch (error) {
      failure = { error };
    }
    await (await this.endpoints())?.revoke(workflowId);
    if (failure) throw failure.error;
  }

  // As a deletion disarms, but awaited: the cursor must not pass a failure.
  private async erasePurgedWorkflow(
    store: WorkflowRunStore,
    workflowId: string,
  ): Promise<void> {
    this.dropDeleted(workflowId);
    await this.releaseDeleted(workflowId);
    await store.deleteDedupe(workflowId);
    for (const scope of ["FLOW", "PROJECT"] as const) {
      await store.deletePieceStore(scope, testPartitionKey(scope, workflowId));
    }
  }

  // The document's own CREATE_DOCUMENT / DELETE_DOCUMENT, the source of truth: it covers
  // documents outside any drive, carries the real type and name, and alone proves deletion.
  private async matchDocumentLifecycle(
    operation: OperationWithContext["operation"],
    context: OperationWithContext["context"],
    hints: Map<string, LifecycleParentHint>,
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
    await this.fireLifecycle(kind, {
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
    });
  }

  // The drive's fallback view: ADD_FILE always accompanies a CREATE_DOCUMENT, so it fires only
  // when that never reached the processor. DELETE_NODE stands alone — the document stays alive.
  private async matchDriveLifecycle(
    driveId: string,
    actionType: string,
    input: unknown,
    operation: { index: number; timestampUtcMs: string },
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

    await this.fireLifecycle(kind, {
      documentId,
      documentType: documentType ?? null,
      name,
      driveId,
      parentId: stringField(record, "parentFolder") ?? null,
      operation,
    });
  }

  private triggerSupervisor?: TriggerSupervisor;

  // Parks as queued on the supervisor's lane, read off it.
  private readonly parks = new ParkState(async () =>
    (await this.store())?.listWorkflowParks(),
  );

  // Lazily built; started/stopped by the trigger processor's lifecycle.
  supervisor(): TriggerSupervisor {
    this.triggerSupervisor ??= new TriggerSupervisor({
      store: () => this.store(),
      parks: this.parks,
      resolveAuth: async (connectionId, request) => {
        if (!connectionId) return undefined;
        const resolved = await new DocumentConnectionResolver(
          this.host,
          this.secretProvider(),
          this.oauthRefresher(),
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
      reactorAccess: (binding, requireReactor, runUser) =>
        this.triggerReactorAccess(binding, requireReactor, runUser),
      models: this.models,
      cacheDir: bundleCacheDir(),
      resolver: pieceResolver(),
      // Trigger hooks reach the same services steps do.
      egress: configuredEgress(),
      // Overrides the 60s default; the 1s floor still applies.
      defaultIntervalMs:
        Number(process.env.PH_WORKFLOWS_POLL_INTERVAL_MS) || undefined,
      reconcileIntervalMs:
        Number(process.env.PH_WORKFLOWS_WEBHOOK_RECONCILE_MS) || undefined,
    });
    // Built after shutdown: stopped before anything can queue on it.
    if (this.closed) this.triggerSupervisor.stop();
    return this.triggerSupervisor;
  }

  startTriggerSupervisor(): void {
    this.supervisor().start();
  }

  stopTriggerSupervisor(): void {
    this.triggerSupervisor?.stop();
  }

  // Set by shutdown. A runtime that lost the workflow singleton is shut down
  // while its reactor keeps serving, so nothing may start a run after it.
  private closed = false;

  // For the read model: a delivery refused here stays below its cursor, so
  // the next owner replays it rather than this runtime acknowledging it.
  private throwIfClosed(): void {
    if (this.closed) {
      throw new Error(
        "This workflow runtime has shut down; the operations are left for the next owner",
      );
    }
  }

  // Teardown for the whole runtime, driven by the host. The run children
  // outlive the reactor otherwise — they are forked, not
  // spawned by it — and a run holding one is over the moment we stop.
  shutdown(): void {
    this.closed = true;
    this.runGate.close();
    clearInterval(this.retentionTimer);
    for (const { timer } of this.resolutionRetries.values())
      clearTimeout(timer);
    this.resolutionRetries.clear();
    for (const workflowId of [...this.webhookTests.keys()]) {
      this.cancelTriggerTest(workflowId, "stopped: the runtime shut down");
    }
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

    // An armed workflow verifies as it runs, whatever a test of its draft says.
    const registration = this.liveWebhook(workflowId);
    if (registration) {
      // A piece owns its own verification and parsing: its run hook decides
      // what the request means, or rejects it.
      if (registration.kind === PIECE_WEBHOOK_KIND) return {};
      return this.policyOf(registration.config, workflowId);
    }

    // Unarmed, a waiting test verifies as the draft's trigger would once armed.
    const test = this.webhookTests.get(workflowId);
    return test ? this.policyOf(test.config, workflowId) : undefined;
  }

  private liveWebhook(workflowId: string) {
    const registration = this.registry.get(workflowId);
    return registration?.kind === PIECE_WEBHOOK_KIND ||
      registration?.kind === WEBHOOK_TRIGGER_KIND
      ? registration
      : undefined;
  }

  private async policyOf(
    config: WebhookConfig,
    workflowId: string,
  ): Promise<WebhookPolicy> {
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
    access: WorkflowAccessOptions = {},
  ): Promise<WebhookEndpointRecord | null> {
    // The URL carries the token that is the entire credential for a public
    // route, so handing it out is a read of the workflow itself.
    await this.assertCanReadWorkflow(workflowId, ctx, access.driveId);
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
    // Retryable: the sender tries again, and reaches the owner that runs it.
    if (this.closed) return { status: 503, unprocessed: true };
    const workflowId = request.key;
    const registration = this.liveWebhook(workflowId);
    // A waiting test samples the delivery; an armed workflow still runs it.
    const test = this.webhookTests.get(workflowId);
    if (test) {
      this.webhookTests.delete(workflowId);
      clearTimeout(test.timer);
      test.resolve(webhookPayload(request));
      if (!registration) return { status: test.config.responseStatus };
    }
    if (!registration) return UNAUTHORIZED;
    if (registration.kind === PIECE_WEBHOOK_KIND) {
      return this.deliverToPiece(registration.binding, request);
    }

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
      // Not run, and not this runtime's to run: the sender retries and
      // reaches the owner. A 500 would keep the dedupe key and lose it.
      if (run.error instanceof WorkflowRuntimeClosedError) {
        return { status: 503, unprocessed: true };
      }
      const message =
        run.error instanceof Error ? run.error.message : String(run.error);
      this.logger.error(
        `Webhook run failed for ${workflowId}: @error`,
        message,
      );
      return {
        status: 500,
        contentType: JSON_CONTENT_TYPE,
        body: JSON.stringify({ error: message }),
      };
    }

    return {
      status:
        run.result.status === "SUCCEEDED"
          ? config.responseStatus
          : refusalStatus(run.result.refusal),
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
        blockLabel(binding.block),
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
      const descriptor = await this.pieceDescriptor(bindingTarget(binding));
      return descriptor.triggers.find(
        (entry) => entry.name === binding.triggerName,
      )?.handshake;
    } catch (error) {
      // A delivery must not fail because the descriptor could not be read; the
      // cost of guessing wrong is one probe answered as a delivery.
      this.logger.warn(
        "Could not read the handshake config for @block",
        blockLabel(binding.block),
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
            blockLabel(binding.block),
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
        `Webhook secret unavailable for ${workflowId}: @error`,
        message,
      );
      return undefined;
    }
  }

  // Importable models for every piece child this runtime forks.
  private readonly models: ModelManifestSource = {
    entries: () => this.host.modelManifest?.() ?? [],
    lookup: (documentType) => this.modelEntries(documentType),
  };

  // Without a type: every type the reactor has registered, plus the boot list.
  private async modelEntries(
    documentType: string | undefined,
  ): Promise<ModelManifestEntry[]> {
    const lookup = this.host.modelEntries?.bind(this.host);
    if (!lookup) return [];
    if (documentType !== undefined) return lookup(documentType);
    const types = new Set(
      (this.host.modelManifest?.() ?? []).map((entry) => entry.documentType),
    );
    const modules = await this.host.reactorClient.getDocumentModelModules();
    for (const module of modules.results) {
      types.add(module.documentModel.global.id);
    }
    return [...types].flatMap((type) => lookup(type));
  }

  // The requireReactor a block's descriptor declares.
  private async declaredReactor(
    block: ParsedBlockType,
  ): Promise<"read" | "write" | undefined> {
    if (builtinPiece(block.packageName)) return undefined;
    const descriptor = await this.pieceDescriptor(targetOf(block));
    const blocks =
      block.kind === "trigger" ? descriptor.triggers : descriptor.actions;
    return blocks.find((candidate) => candidate.name === block.name)
      ?.requireReactor;
  }

  // Who a caller acts as at design time and in a single-step test.
  private callerRunUser(ctx: WorkflowCaller | undefined): RunUser | null {
    const subject = ctx ? this.host.subjectOf?.(ctx) : undefined;
    return subject?.address ? { address: subject.address, subject } : null;
  }

  // The bound reactor connection's scope, which the run user must be able to read.
  private async reactorScope(
    reactorConnectionId: string | null | undefined,
    requireReactor: "read" | "write",
    runUser: RunUser | null,
  ) {
    if (reactorConnectionId?.includes("{{")) {
      throw unboundReactorConnection(reactorConnectionId);
    }
    const base = await buildReactorRunScope(this.host, {
      reactorConnectionId,
      requireReactor,
      runUser,
    });
    if (runUser && reactorConnectionId) {
      await assertConnectionReadable(this.host, reactorConnectionId, runUser);
    }
    return base;
  }

  // ctx.reactor for a step: the run user, or the caller in a single-step test.
  private async stepReactorAccess(
    request: StepReactorRequest,
  ): Promise<ReactorTap | undefined> {
    const declared = await this.declaredReactor(request.block);
    if (!declared) return undefined;
    const base = await this.reactorScope(
      request.reactorConnectionId,
      declared,
      currentRunUser() ?? null,
    );
    return reactorTap(this.host, base, runJournal());
  }

  // A live hook acts as the publisher; a design-time test passes the caller.
  private async triggerReactorAccess(
    binding: PieceTriggerBinding,
    requireReactor: "read" | "write",
    runUser: RunUser | null | undefined,
  ): Promise<ReactorTap> {
    const bound = binding.reactorConnectionId;
    const user =
      runUser !== undefined
        ? runUser
        : ((await assertReactorConnectionsReadable(
            this.host,
            binding.workflowId,
            new Set(bound ? [bound] : []),
          )) ?? null);
    const base = await this.reactorScope(bound, requireReactor, user);
    return reactorTap(this.host, base, NO_JOURNAL);
  }

  // Option resolvers read as the GraphQL caller, within a bound connection.
  private async designReactorAccess(
    block: ParsedBlockType,
    ctx: WorkflowCaller | undefined,
    reactorConnectionId: string | undefined,
  ): Promise<ReactorTap | undefined> {
    if (!(await this.declaredReactor(block))) return undefined;
    const runUser = this.callerRunUser(ctx);
    if (!runUser && authEnforced(this.host)) {
      throw accessDenied(
        "Design-time reactor access requires a signed-in caller while auth enforcement is on",
      );
    }
    if (reactorConnectionId) {
      await this.reactorScope(reactorConnectionId, "read", runUser);
    }
    return reactorTap(this.host, designTimeScope(runUser), NO_JOURNAL);
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

  private readonly describing = new Map<string, Promise<PieceDescriptor>>();

  // Keyed on the resolved version and its source, never on what was asked for.
  private pieceDescriptor(target: PieceTarget): Promise<PieceDescriptor> {
    const cacheKey = `${target.source ?? ""}:${target.name}@${target.version}`;
    const cached = this.descriptors.get(cacheKey);
    if (cached) return Promise.resolve(cached);
    let pending = this.describing.get(cacheKey);
    if (!pending) {
      pending = this.describe(target, cacheKey).finally(() =>
        this.describing.delete(cacheKey),
      );
      this.describing.set(cacheKey, pending);
    }
    return pending;
  }

  private async describe(
    target: PieceTarget,
    cacheKey: string,
  ): Promise<PieceDescriptor> {
    const { name: packageName, version } = target;
    const builtin = builtinPiece(packageName);
    if (builtin) return describeBuiltinPiece(builtin);
    let descriptor = this.descriptors.get(cacheKey);
    if (!descriptor) {
      const piece = await pieceResolver().resolve(target);
      // Loading the bundle runs the piece module's top-level code, so the
      // descriptor is built in the worker, never in the reactor process.
      this.designWorker ??= new PieceWorker({ models: this.models });
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
  async runs(args: RunsArgs, ctx?: WorkflowCaller): Promise<RunRecord[]> {
    return (await this.runsPage(args, ctx)).records;
  }

  // One page, newest first. Access is the host's per-document call, so it
  // can't go into SQL: batches are read and filtered until the page is full.
  async runsPage(args: RunsPageArgs, ctx?: WorkflowCaller): Promise<RunPage> {
    const empty: RunPage = { records: [], hasNextPage: false, cursor: null };
    const after = args.cursor ? decodeRunCursor(args.cursor) : undefined;
    const store = await this.store();
    if (!store) return empty;
    // A drive scopes runs to the workflows it holds; an explicit workflowId is
    // narrower still, so it wins.
    let scope: string | string[] | undefined;
    if (args.workflowId) {
      await this.assertCanReadDocument(args.workflowId, ctx);
      scope = args.workflowId;
    } else if (args.driveId) {
      scope = await this.driveWorkflowIds(args.driveId, ctx);
      if (scope.length === 0) return empty;
    }
    // An unscoped listing is every workflow in the reactor, so it needs a
    // caller to filter by; no caller is served no run either way.
    if (!ctx) return empty;
    const pageSize = Math.min(Math.max(args.limit ?? 25, 1), MAX_LIST_RUNS);
    const batchSize = Math.min(pageSize + 1, MAX_LIST_RUNS);
    const served: RunRow[] = [];
    let position = after;
    let scanned = 0;
    let exhausted = false;
    // One past the page tells whether another follows.
    while (served.length <= pageSize && scanned < RUNS_SCAN_LIMIT) {
      const batch = await store.listRuns(scope, batchSize, {
        after: position,
        excludeTriggerKinds: args.excludeTriggerKinds,
      });
      scanned += batch.length;
      const last = batch.at(-1);
      if (last) position = { enqueuedAt: last.enqueued_at, id: last.id };
      served.push(
        ...(await this.servedRuns(
          await this.readableRows(batch, (row) => row.workflow_id, ctx),
          ctx,
        )),
      );
      if (batch.length < batchSize) {
        exhausted = true;
        break;
      }
    }
    const rows = served.slice(0, pageSize);
    const full = served.length > pageSize;
    const lastRow = rows.at(-1);
    // Out of scan budget: resume after the last row read, served or not.
    const resumeAt =
      full || exhausted
        ? lastRow && { enqueuedAt: lastRow.enqueued_at, id: lastRow.id }
        : position;
    const steps = await store.getStepsForRuns(
      rows.map((row) => row.id),
      { withData: args.withStepData ?? true },
    );
    return {
      records: rows.map((row) => ({ row, steps: steps.get(row.id) ?? [] })),
      hasNextPage: full || !exhausted,
      cursor: resumeAt ? encodeRunCursor(resumeAt) : null,
    };
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
    let page = await this.host.reactorClient.find(
      { type: "powerhouse/connection" },
      subject ? { subject } : undefined,
    );
    const found = [...page.results];
    // Every page, then the check: filtering one page would hide the rest.
    while (page.next) {
      page = await page.next();
      found.push(...page.results);
    }
    const readable = await this.readableDocuments(
      found as ConnectionDocument[],
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
    return this.checkConnectionDocument(
      await this.connectionDocument(connectionId),
    );
  }

  private async connectionDocument(
    connectionId: string,
  ): Promise<ConnectionDocument> {
    const document =
      await this.host.reactorClient.get<ConnectionDocument>(connectionId);
    if (document.header.documentType !== "powerhouse/connection") {
      throw new Error(
        `Document "${connectionId}" is not a powerhouse/connection`,
      );
    }
    return document;
  }

  // The check itself; the caller has already been authorized.
  private async checkConnectionDocument(
    document: ConnectionDocument,
  ): Promise<ConnectionCheckResult> {
    const connectionId = document.header.id;
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
    // No credentials: the reactor decides each call, so only the config is checked.
    if (state.authType === "REACTOR") {
      const parsed = parseReactorConnectionConfig(state.config);
      return this.recordCheckResult(document, {
        ok: parsed.ok,
        detail: parsed.ok
          ? `Local reactor, ${parsed.config.access ?? "write"} access`
          : parsed.error,
        accountLabel,
      });
    }
    if (state.authType !== "NONE" && !hasCredentials(state)) {
      return this.recordCheckResult(document, {
        ok: false,
        detail: "Connection is not configured",
        accountLabel,
      });
    }
    // No bundle work for auth kinds the runtime cannot execute yet.
    if (state.authType === "OIDC") {
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
      // A connection names no version: the installed piece, else the newest.
      const found = await this.blockResolver.latest(packageName, {
        fresh: true,
      });
      if (found.version === undefined) {
        throw new Error(
          `Could not resolve a version for piece "${packageName}"` +
            (found.unreachable ? `: ${found.unreachable}` : ""),
        );
      }
      moduleRef = pieceModuleRef(
        await pieceResolver().resolve({
          name: packageName,
          version: found.version,
          source: found.source,
        }),
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
        { piecePackage: packageName },
        this.oauthRefresher(),
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
      this.designWorker ??= new PieceWorker({ models: this.models });
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

  // Opens an OAuth2 sign-in for a connection that brings its own app. The
  // host serves redirectUri and passes what it receives to completeOAuth.
  async startOAuth(
    connectionId: string,
    ctx: WorkflowCaller | undefined,
    options: { redirectUri: string; returnUrl?: string },
  ): Promise<OAuthStart> {
    await this.assertCanReadDocument(connectionId, ctx);
    // Signing in stores a token on the connection.
    await this.assertCanWriteDocument(connectionId, ctx);
    const state = (await this.connectionDocument(connectionId)).state.global;
    if (state.authType !== "OAUTH2") {
      throw new OAuthError("This connection does not sign in with OAuth2");
    }
    const { [OAUTH_CLIENT_ID]: clientId, ...props } = (state.config ??
      {}) as Record<string, unknown>;
    if (typeof clientId !== "string" || clientId === "") {
      throw new OAuthError("Set the client ID before connecting");
    }
    const clientSecretRef = state.secretRefs.find(
      (entry) => entry.name === OAUTH_CLIENT_SECRET,
    )?.ref;
    if (!clientSecretRef) {
      throw new OAuthError("Save the client secret before connecting");
    }

    const packageName = packageFromConnectorId(state.connectorId);
    const found = await this.blockResolver.latest(packageName);
    if (found.version === undefined) {
      throw new OAuthError(
        `Could not resolve a version for piece "${packageName}"` +
          (found.unreachable ? `: ${found.unreachable}` : ""),
      );
    }
    const descriptor = await this.pieceDescriptor({
      name: packageName,
      version: found.version,
      source: found.source,
    });
    const method = authMethodFor(descriptor.auth, "OAUTH2") as
      | PieceAuthDescriptor
      | undefined;
    if (!method?.oauth2) {
      throw new OAuthError(`"${packageName}" does not sign in with OAuth2`);
    }
    if (method.unsupported) {
      throw new UnsupportedPieceFeatureError(
        `Piece "${packageName}"`,
        method.unsupported,
      );
    }
    return (await this.oauthAttempts()).start({
      connectionId,
      method: method.oauth2,
      props,
      clientId,
      clientSecretRef,
      redirectUri: options.redirectUri,
      ...(options.returnUrl ? { returnUrl: options.returnUrl } : {}),
    });
  }

  // How a sign-in stands, for the editor that opened it.
  async oauthAttempt(
    state: string,
    ctx: WorkflowCaller | undefined,
  ): Promise<OAuthAttemptView | null> {
    const view = await (await this.oauthAttempts()).view(state);
    if (!view) return null;
    await this.assertCanReadDocument(view.connectionId, ctx);
    return view;
  }

  // The provider's redirect. No caller: the state, minted for an authorized
  // caller and good for one exchange, is what vouches for it.
  async completeOAuth(callback: {
    state: string;
    code?: string;
    error?: string;
    errorDescription?: string;
  }): Promise<{
    ok: boolean;
    detail: string | null;
    returnUrl: string | null;
  }> {
    const attempts = await this.oauthAttempts();
    const attempt = await attempts.claim(callback.state);
    if (!attempt) {
      return {
        ok: false,
        detail: "This sign-in link has expired or was already used",
        returnUrl: null,
      };
    }
    const fail = async (detail: string) => {
      await attempts.finish(attempt.state, detail);
      return { ok: false, detail, returnUrl: attempt.return_url };
    };
    if (callback.error || !callback.code) {
      return fail(
        callback.errorDescription ??
          (callback.error
            ? `The provider refused the sign-in (${callback.error})`
            : "The provider sent no authorization code"),
      );
    }

    try {
      const document = await this.connectionDocument(attempt.connection_id);
      const state = document.state.global;
      const config = (state.config ?? {}) as Record<string, unknown>;
      // Changed while the user was signing in: the token would belong to
      // another app than the one the connection now names.
      if (
        state.authType !== "OAUTH2" ||
        config[OAUTH_CLIENT_ID] !== attempt.client_id
      ) {
        return await fail("The connection changed during sign-in; try again");
      }
      const secrets = await this.secrets();
      const tokens = await exchangeCode(
        attempt,
        callback.code,
        await secrets.get(attempt.client_secret_ref),
        this.designEgress,
      );
      const value = JSON.stringify(tokens);
      const existing = state.secretRefs.find(
        (entry) => entry.name === OAUTH_TOKEN,
      );
      let ref = existing?.ref;
      try {
        if (ref) await secrets.rotate(ref, value);
      } catch {
        ref = undefined;
      }
      if (!ref) {
        ref = (
          await secrets.create({
            value,
            label: `${state.name || "connection"} · OAuth2 token`,
          })
        ).ref;
        await this.host.reactorClient.execute(document.header.id, "main", [
          connectionActions.setSecretRef({
            id: existing?.id ?? generateId(),
            name: OAUTH_TOKEN,
            ref,
          }),
        ]);
      }
      const result = await this.checkConnectionDocument(
        await this.connectionDocument(attempt.connection_id),
      );
      if (!result.ok) {
        return await fail(result.detail ?? "Connection check failed");
      }
      await attempts.finish(attempt.state, null);
      return { ok: true, detail: null, returnUrl: attempt.return_url };
    } catch (error) {
      this.logger.warn(
        "OAuth2 sign-in for connection @id failed: @error",
        attempt.connection_id,
        error,
      );
      return fail(error instanceof Error ? error.message : String(error));
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
      installedPieces().map(async (piece) => {
        try {
          const descriptor = await this.pieceDescriptor(localTarget(piece));
          return { piece, descriptor };
        } catch (error) {
          this.logger.warn(
            'Could not describe the package piece "@piece": @error',
            piece.name,
            String(error),
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
    const piece = installedPiece(packageName);
    if (!piece) return undefined;
    return {
      piece,
      descriptor: await this.pieceDescriptor(localTarget(piece)),
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
      this.logger.warn("Serving package pieces only: @error", String(error));
      published = [];
    }
    const publishedVersions = new Map(
      published.map((entry) => [entry.name, entry.version]),
    );
    return [
      ...entries.map((entry) => {
        const publishedVersion = publishedVersions.get(entry.name);
        return publishedVersion ? { ...entry, publishedVersion } : entry;
      }),
      ...published.filter((entry) => !names.has(entry.name)),
    ].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  // A version reads that version; without one, the installed piece or the latest.
  async pieceActions(
    packageName: string,
    version?: string,
  ): Promise<PieceActionsResult> {
    const local = await this.localPieceAt(packageName, version);
    return local
      ? actionsResult(local.descriptor, local.piece.name, local.piece.version)
      : fetchPieceActions(packageName, version);
  }

  async pieceTriggers(
    packageName: string,
    version?: string,
  ): Promise<PieceTriggersResult> {
    const local = await this.localPieceAt(packageName, version);
    return local
      ? triggersResult(local.descriptor, local.piece.name, local.piece.version)
      : fetchPieceTriggers(packageName, version);
  }

  // Catalog search, with this reactor's own pieces always in it: the index
  // behind the published half may still be building, or unreachable.
  async searchBlocks(
    query: string,
    limit?: number,
  ): Promise<BlockSearchResult> {
    let local: BlockSearchIndex | undefined;
    try {
      local = indexFromHits(
        (await this.localPieces()).flatMap(({ piece, descriptor }) =>
          localSearchHits(descriptor, piece.name, piece.version),
        ),
      );
    } catch (error) {
      // The published half is still worth serving without them.
      this.logger.warn(
        "Could not index the package pieces: @error",
        String(error),
      );
    }
    return searchBlocks(query, limit, local);
  }

  async pieceDetail(packageName: string, version?: string): Promise<unknown> {
    const local = await this.localPieceAt(packageName, version);
    return local
      ? detailResult(local.descriptor, local.piece.name, local.piece.version)
      : fetchPieceDetail(packageName, version);
  }

  // The installed piece when it answers for the version asked (or none was).
  private async localPieceAt(
    packageName: string,
    version: string | undefined,
  ): Promise<{ piece: LocalPiece; descriptor: PieceDescriptor } | undefined> {
    const piece = installedPiece(packageName);
    if (!piece) return undefined;
    if (version && version !== piece.version && !isHostBound(piece.name)) {
      return undefined;
    }
    return this.localPiece(packageName);
  }

  // Design-time: the action/trigger descriptor (props, auth) driving the
  // editor form; triggers come back under a "trigger" key.
  async blockDescriptor(block: BlockRef): Promise<unknown> {
    const parsed = await this.resolvedPiece(block);
    if (!parsed) return null;
    const descriptor = await this.pieceDescriptor(targetOf(parsed));
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
    const documents = await store?.getRunDocumentsForRuns(
      rows.map((row) => row.id),
    );
    const served = await Promise.all(
      rows.map((row) =>
        this.servesDocuments(
          [
            ...journaledTriggerDocumentIds(row.trigger_payload),
            ...(documents?.get(row.id) ?? []),
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

  // A caller allowed on the drive waits (bounded) for a workflow that has not
  // reached this reactor; anyone else is refused at once.
  private async assertCanReadWorkflow(
    workflowId: string,
    ctx: WorkflowCaller | undefined,
    driveId: string | undefined,
  ): Promise<void> {
    try {
      await this.assertCanReadDocument(workflowId, ctx);
    } catch (denied) {
      const client = this.host.reactorClient;
      if (!driveId || !(await isNotHereYet(client, workflowId))) throw denied;
      await this.assertCanReadDocument(driveId, ctx);
      await waitForSync(
        client,
        workflowId,
        () => this.assertCanReadDocument(workflowId, ctx),
        this.host.syncWaitMs ?? SYNC_WAIT_MS,
      );
    }
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
    block: BlockRef,
    propName: string,
    input?: unknown,
    connectionId?: string,
    ctx?: WorkflowCaller,
    searchValue?: string,
    // The step's reactor connection, which narrows what a resolver reads.
    reactorConnectionId?: string,
  ): Promise<unknown> {
    // Auth-dependent options() resolvers need the step's connection. Nothing
    // about the request authorizes it, so the caller's own read access does.
    if (connectionId) await this.assertCanReadDocument(connectionId, ctx);
    if (reactorConnectionId) {
      await this.assertCanReadDocument(reactorConnectionId, ctx);
    }
    const resolution = await this.resolveBlock(block);
    const parsed = resolvedBlock(resolution);
    if (!parsed) {
      throw new Error(
        resolution.note ?? `${blockLabel(block)} does not resolve`,
      );
    }
    if (builtinPiece(parsed.packageName)) {
      throw new Error(`${blockLabel(block)} has no options to resolve`);
    }
    let auth: unknown;
    if (connectionId) {
      auth = await new DocumentConnectionResolver(
        this.host,
        this.secretProvider(),
        this.oauthRefresher(),
      ).resolve(connectionId, { piecePackage: parsed.packageName });
    }
    const piece = await pieceResolver().resolve(targetOf(parsed));
    const reactor = await this.designReactorAccess(
      parsed,
      ctx,
      reactorConnectionId,
    );
    this.designWorker ??= new PieceWorker({ models: this.models });
    const result = await this.designWorker.resolveOptions(
      {
        ...pieceModuleRef(piece),
        actionName: parsed.name,
        kind: parsed.kind,
        propName,
        refresherValues: (input ?? {}) as Record<string, unknown>,
        ...(searchValue !== undefined ? { searchValue } : {}),
        auth,
        projectId: PROJECT_SCOPE_KEY,
        // Options come from the same service the step will call: the editor
        // must not offer a choice a run cannot reach.
        ...(this.designEgress ? { egress: this.designEgress } : {}),
      },
      reactor ? { reactor } : {},
    );
    return result.output;
  }

  // Authored output shape of a block, for the editor's expression picker.
  async blockOutputTree(
    block: BlockRef,
    config?: unknown,
  ): Promise<OutputTree> {
    const record = (config ?? {}) as Record<string, unknown>;
    switch (blockKey(block)) {
      case MANUAL_BLOCK:
        return { source: "none", nodes: [] };
      case SCHEDULE_BLOCK:
        return { source: "static", nodes: scheduleTriggerTree() };
      case WEBHOOK_BLOCK:
        return { source: "static", nodes: webhookTriggerTree() };
      case BRANCH_BLOCK:
        return {
          source: "static",
          nodes: [
            { name: "operator", type: "String!" },
            { name: "left", type: "value" },
            { name: "right", type: "value" },
            { name: "result", type: "Boolean!" },
          ],
        };
      case ASSERT_BLOCK:
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
          nodes: documentTree(stateChildren),
        };
      }
      case DOCUMENT_CREATE_BLOCK:
      case DOCUMENT_DISPATCH_BLOCK:
        return { source: "static", nodes: documentReferenceTree() };
      default: {
        const parsed = await this.resolvedPiece(block);
        if (!parsed) return { source: "none", nodes: [] };
        // Described from the version that runs, not the catalog's latest.
        const detail = detailResult(
          await this.pieceDescriptor(targetOf(parsed)),
          parsed.packageName,
          parsed.version,
        ) as {
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
      const model = module.documentModel.global;
      const sdl = model.specifications.at(-1)?.state.global.schema;
      return sdl ? fieldsFromSdl(sdl, { state: model.name }) : [];
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
            return fieldsFromSdl(operation.schema, { input: operation.name });
          }
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  // Runs the draft trigger's test hook; the test store prefix keeps cursors
  // intact. The sample is journaled as a "test" run and noted as lastTest.

  // It resolves the trigger's connection and hands the credentials to piece
  // code, so the caller must be able to read both documents.
  // Core triggers: manual takes `payload` as its sample, schedule samples a
  // fire now, and webhook waits (up to `timeoutMs`) for the next delivery.
  async testTrigger(
    workflowId: string,
    ctx?: WorkflowCaller,
    options: TriggerTestOptions = {},
  ): Promise<unknown> {
    await this.assertCanReadWorkflow(workflowId, ctx, options.driveId);
    const document =
      await this.host.reactorClient.get<WorkflowDocument>(workflowId);
    const state = document.state.global;
    const trigger = state.trigger;
    if (!trigger) throw new Error("Workflow has no trigger");
    if (trigger.connectionId) {
      await this.assertCanReadDocument(trigger.connectionId, ctx);
    }
    if (trigger.reactorConnectionId) {
      await this.assertCanReadDocument(trigger.reactorConnectionId, ctx);
    }
    const test = await this.triggerTest(workflowId, trigger, options, ctx);
    const startedAt = new Date().toISOString();
    const recordTest = (
      outcome: Pick<
        StepExecutionRecord,
        "status" | "output" | "port" | "error" | "errorName"
      >,
    ) =>
      this.recordTest(workflowId, state, document.header.name, {
        stepId: trigger.id,
        key: "trigger",
        pieceName: trigger.pieceName,
        blockName: trigger.triggerName,
        input: test.input,
        ...outcome,
        startedAt,
        endedAt: new Date().toISOString(),
      });
    let output: unknown;
    try {
      output = await test.sample();
    } catch (error) {
      // A host call the hook made may have committed the write it asked for,
      // so the test neither succeeded nor failed. It takes no port either.
      const errorName = errorNameOf(error);
      await recordTest({
        status: isIndeterminateError(error) ? "INDETERMINATE" : "FAILED",
        error: pieceFailureDetail(error, "Trigger test timed out"),
        ...(errorName ? { errorName } : {}),
      });
      throw error;
    }
    await recordTest({ status: "SUCCEEDED", output, port: "next" });
    return output;
  }

  // What a trigger test samples, and the config it journals as input.
  private async triggerTest(
    workflowId: string,
    trigger: NonNullable<WorkflowState["trigger"]>,
    options: TriggerTestOptions,
    ctx?: WorkflowCaller,
  ): Promise<{ input: unknown; sample: () => Promise<unknown> }> {
    const config = configRecord(trigger.config);
    const block = triggerBlock(trigger);
    switch (blockKey(block)) {
      case MANUAL_BLOCK:
        return {
          input: config,
          sample: () => Promise.resolve(options.payload ?? {}),
        };
      case SCHEDULE_BLOCK: {
        const schedule = parseScheduleConfig(config);
        return {
          input: config,
          sample: () => {
            const now = new Date();
            return Promise.resolve(schedulePayload(schedule, now, now));
          },
        };
      }
      case WEBHOOK_BLOCK: {
        const webhook = parseWebhookConfig(config);
        // Minted now, so the author can send to it while this waits.
        if (!(await this.endpoints())) {
          throw new Error("This host serves no webhooks");
        }
        await this.mintWebhookEndpoint(workflowId);
        return {
          input: config,
          sample: () =>
            this.awaitWebhookTest(workflowId, webhook, options.timeoutMs),
        };
      }
    }
    const { binding } = await this.pieceBinding(workflowId, trigger);
    if (!binding) {
      throw new Error(
        `${blockLabel(block)} is not a trigger this runtime can test`,
      );
    }
    return {
      input: binding.config,
      // A trigger test acts as its caller.
      sample: () =>
        this.supervisor().test(binding, { runUser: this.callerRunUser(ctx) }),
    };
  }

  // One-shot listeners: the next delivery to the workflow's endpoint is the
  // sample. It runs the workflow only if the workflow is armed.
  private readonly webhookTests = new Map<string, WebhookTest>();

  private awaitWebhookTest(
    workflowId: string,
    config: WebhookConfig,
    timeoutMs = WEBHOOK_TEST_TIMEOUT_MS,
  ): Promise<WebhookPayload> {
    this.cancelTriggerTest(workflowId, "superseded by a newer test");
    const waitMs = Math.min(Math.max(timeoutMs, 0), WEBHOOK_TEST_TIMEOUT_MS);
    return new Promise<WebhookPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.webhookTests.delete(workflowId);
        reject(
          new Error(
            `No webhook delivery arrived within ${Math.round(waitMs / 1000)}s`,
          ),
        );
      }, waitMs);
      timer.unref();
      this.webhookTests.set(workflowId, { config, resolve, reject, timer });
    });
  }

  /** Stops a waiting webhook test; false when none was waiting. */
  cancelTriggerTest(workflowId: string, reason = "cancelled"): boolean {
    const pending = this.webhookTests.get(workflowId);
    if (!pending) return false;
    this.webhookTests.delete(workflowId);
    clearTimeout(pending.timer);
    pending.reject(new Error(`Trigger test ${reason}`));
    return true;
  }

  // The caller may read the workflow, as for a test.
  async cancelTriggerTestFor(
    workflowId: string,
    ctx?: WorkflowCaller,
  ): Promise<boolean> {
    await this.assertCanReadDocument(workflowId, ctx);
    return this.cancelTriggerTest(workflowId);
  }

  // Journals a design-time test as a one-step "test" run, then points the
  // tested block's lastTest at it. Both are best-effort.
  private async recordTest(
    workflowId: string,
    state: WorkflowState,
    name: string | undefined,
    record: StepExecutionRecord,
  ): Promise<void> {
    const store = await this.store();
    if (!store) return;
    let runId: string;
    try {
      runId = await store.startRun({
        workflowId,
        workflowName: runJournalName(state.name, name),
        workflowVersion: state.version,
        triggerKind: TEST_TRIGGER_KIND,
      });
      await store.recordStep(runId, 0, record);
      // An INDETERMINATE step ends a real run FAILED (coordinator.ts), and a
      // test run says the same rather than reading green: the step row carries
      // the INDETERMINATE status, the run row carries that it did not confirm.
      const indeterminate = record.status === "INDETERMINATE";
      const error = indeterminate
        ? `This test is INDETERMINATE: ${record.error ?? "a host call it made timed out"}`
        : record.error;
      await store.finishRun(runId, {
        status: record.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
        steps: [record],
        ...(error ? { error } : {}),
        ...(record.errorName ? { errorName: record.errorName } : {}),
      });
    } catch (error) {
      this.logger.warn(
        `Could not journal the test of "@step" on workflow ${workflowId}: @error`,
        record.key,
        error,
      );
      return;
    }
    await this.noteLastTest(
      workflowId,
      record,
      runId,
      record.endedAt ?? new Date().toISOString(),
    );
  }

  private async noteLastTest(
    workflowId: string,
    record: Pick<StepExecutionRecord, "stepId" | "key">,
    runId: string,
    testedAt: string,
  ): Promise<void> {
    try {
      await this.host.reactorClient.execute(workflowId, "main", [
        workflowActions.setLastTest({ id: record.stepId, runId, testedAt }),
      ]);
    } catch (error) {
      this.logger.warn(
        `Could not record the last test of "@step" on workflow ${workflowId}: @error`,
        record.key,
        error,
      );
    }
  }

  // Without a journal there is nowhere durable to keep ctx.store, so the
  // executor falls back to the worker's heap.
  private blockExecutor(store: WorkflowRunStore | undefined): BlockExecutor {
    return (this.executor ??= createBlockExecutor(
      this.host,
      this.secretProvider(),
      this.attachments,
      store ? createPieceStorePort(store, currentWorkflowId) : undefined,
      // A step resolves its block the way every other caller does, so a
      // trigger that arms cannot be followed by a step that cannot start.
      (block) => this.resolveBlock(block),
      this.oauthRefresher(),
      (request) => this.stepReactorAccess(request),
    ));
  }

  // One child per run, N runs at a time. Sized by the operator: each slot is a
  // node process, so this is the reactor's real connector concurrency.
  private workers(): PieceWorkerPool {
    // A queue depth of 0 waits without limit, which is what one shared worker
    // did — a cap turns a saturated pool into failures instead of latency.
    return (this.pieceWorkers ??= new PieceWorkerPool({
      models: this.models,
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
      completedSteps: Map<string, ReplayedStep>;
      rerunOf: string;
    },
    ctx?: WorkflowCaller,
    // A run this workflow's trigger already journaled as PENDING. Adopted
    // rather than created, so the row a matched operation left behind is the
    // row the run finishes in.
    enqueuedRunId?: string,
  ): Promise<PersistedRunResult> {
    if (this.closed) {
      return this.refuseClosed(await this.store(), workflowId, enqueuedRunId);
    }
    // `policy.runTimeoutSeconds` is measured from HERE, the moment the firing
    // reaches the runtime — not from admission. The queue wait is part of the
    // time the run took: computing the deadline after admit() meant a firing
    // could sit in a QUEUE lane for an hour under a 30-second timeout and then
    // run anyway, with its whole budget intact. The point of a run timeout is
    // that a trigger's work is either done inside it or not done at all.
    const firedAt = Date.now();
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
    let runUser: RunUser | null | undefined;
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
      // Before each run: grants can change after the publish was checked.
      runUser = await assertReactorConnectionsReadable(
        this.host,
        workflowId,
        declaredReactorConnectionIds(definition),
      );
    } catch (error) {
      // An adopted row is already durable: closing it out here is what keeps
      // a refused fire from leaving a PENDING run nothing will ever start.
      if (enqueuedRunId) {
        await store?.failRun(
          enqueuedRunId,
          error instanceof Error ? error.message : String(error),
          errorNameOf(error),
        );
      }
      throw error;
    }
    // Bound once, to the connections this definition names: an edit landing
    // mid-run cannot widen what the run may resolve.
    const connections = declaredConnectionIds(definition);
    const executor = this.blockExecutor(store);

    const runnable = runnableDefinition(state);
    // `policy.concurrency`, enforced. SINGLETON refuses here, before the run
    // row is adopted, so a dropped firing is journaled as the CANCELLED run it
    // is rather than disappearing; QUEUE and a bounded PARALLEL wait.
    const policy = effectiveRunPolicy(runnable);
    const deadline = policy.runTimeoutSeconds
      ? firedAt + policy.runTimeoutSeconds * 1000
      : undefined;
    const skipped = (reason: string, refusal: FiringRefusal) =>
      this.skipFiring(
        store,
        workflowId,
        enqueuedRunId,
        {
          reason,
          triggerKind,
          triggerPayload,
          workflowName: runJournalName(state.name, documentName),
          workflowVersion: runnable.version,
        },
        refusal,
      );
    let parked: string | undefined;
    try {
      parked = await this.parkedFiring(
        workflowId,
        triggerKind,
        runnable.version,
      );
    } catch (error) {
      // As a refused read above: an adopted row must not stay PENDING.
      if (enqueuedRunId) {
        await store?.failRun(
          enqueuedRunId,
          error instanceof Error ? error.message : String(error),
          errorNameOf(error),
        );
      }
      throw error;
    }
    if (parked) return skipped(parked, "parked");
    const admission = await this.runGate.admit(workflowId, policy);
    // Shut down while it waited, or as it was handed the slot: refused, not
    // journaled as a fresh CANCELLED run.
    if (this.closed) {
      if (admission.admitted) admission.release();
      return this.refuseClosed(store, workflowId, enqueuedRunId);
    }
    if (!admission.admitted) {
      if (admission.refusal === "closed") {
        return this.refuseClosed(store, workflowId, enqueuedRunId);
      }
      return skipped(admission.reason, admission.refusal);
    }
    // A firing that queued read the workflow before it waited: disabled,
    // re-published or parked meanwhile, it must not run on that old read.
    if (admission.waited) {
      let stale: string | undefined;
      try {
        stale = await this.staleAfterWait(
          workflowId,
          triggerKind,
          runnable.version,
        );
      } catch (error) {
        stale =
          "Skipped: the workflow could not be read again after this firing " +
          `waited for its slot: ${error instanceof Error ? error.message : String(error)}`;
      }
      if (stale) {
        admission.release();
        return skipped(stale, "stale");
      }
    }
    // The wait itself outlived the run's deadline, so there is nothing left to
    // run it in: CANCELLED without executing a single step, rather than a side
    // effect fired long after the timeout that was supposed to bound it. The
    // slot goes back first — this firing is not going to use it.
    if (deadline !== undefined && Date.now() >= deadline) {
      admission.release();
      return skipped(
        `Skipped: this firing waited past its runTimeoutSeconds ` +
          `(${policy.runTimeoutSeconds}s) for a concurrency slot and was ` +
          "cancelled without running",
        "expired",
      );
    }

    let runId: string | null = enqueuedRunId ?? null;
    let journalFailed = false;
    // Recorded whether or not the write lands: it is what lets finishRun put a
    // lost row back where the step ran.
    const executionOrder = new Map<string, number>();
    // This run's child, forked at its first piece step and killed below. Free
    // until then, so a run of document blocks never takes a slot.
    let session: PieceWorkerSession | undefined;
    // EVERYTHING after admit() belongs inside this try, the journal writes
    // below included: a throw between the admission and the finally would
    // never release the slot, and a leaked slot wedges the workflow for the
    // life of the process — SINGLETON refuses every later firing, QUEUE waits
    // for a run that is already over.
    try {
      if (enqueuedRunId) {
        await store?.beginRun(enqueuedRunId, {
          workflowName: runJournalName(state.name, documentName),
          workflowVersion: runnable.version,
        });
      } else {
        runId =
          (await store?.startRun({
            workflowId,
            workflowName: runJournalName(state.name, documentName),
            workflowVersion: runnable.version,
            triggerKind,
            triggerPayload,
            rerunOf: resume?.rerunOf,
          })) ?? null;
      }
      // Also in here: a pool disposed while this run was starting up refuses
      // here, and the journal records the run as failed rather than leaving it
      // to be swept up as an orphan.
      session = this.workers().session();
      // Resolved per run, so a rotated secret takes effect on the next one.
      const { variables, secretValues } = await resolveVariables(
        runnable.variables,
        this.secretProvider(),
      );
      const journal = store;
      const journaledRunId = runId;
      const handed = new Set<string>();
      const result = await withRunScope(
        {
          workflowId,
          runId,
          connections,
          pieceWorker: session,
          ...(runUser !== undefined ? { runUser } : {}),
          recordDocuments: async (documentIds: string[]) => {
            for (const documentId of documentIds) handed.add(documentId);
            if (journal && journaledRunId) {
              await journal.recordRunDocuments(journaledRunId, documentIds);
            }
          },
        },
        () =>
          runWorkflow({
            definition: { ...definition, variables },
            executor,
            declaredPorts: blockPorts,
            ...(secretValues.length > 0 ? { redactValues: secretValues } : {}),
            triggerPayload,
            completedSteps: resume?.completedSteps,
            // `policy.defaultRetry` and `policy.runTimeoutSeconds`, enforced.
            ...(policy.defaultRetry
              ? { defaultRetry: policy.defaultRetry }
              : {}),
            // From firedAt, so the queue wait and the document read count
            // against the timeout rather than being free.
            ...(deadline !== undefined ? { deadline } : {}),
            // Journal each step as it lands, so a reactor that dies mid-run
            // still leaves a rerunnable record of the work it finished.
            onStep:
              store && journaledRunId
                ? async (record, ordinal) => {
                    executionOrder.set(record.stepId, ordinal);
                    try {
                      await store.recordStep(journaledRunId, ordinal, record);
                    } catch (error) {
                      // Swallowed on purpose, but logged once per run: a dead
                      // journal must not look exactly like a healthy one.
                      if (journalFailed) return;
                      journalFailed = true;
                      this.logger.warn(
                        `Run ${journaledRunId}: journaling step "@step" failed; the run continues without per-step durability: @error`,
                        record.key,
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
      // `policy.onFailure`, enforced: PARK stops the trigger refiring, NOTIFY
      // says so where an operator will see it, IGNORE is the old behaviour.
      // Only for a trigger's firing: an operator's run says nothing about it.
      if (result.status === "FAILED" && !OPERATOR_RUN_KINDS.has(triggerKind)) {
        await this.applyFailureMode(
          policy,
          workflowId,
          runnable.version,
          runId,
          result.error,
        );
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
          errorNameOf(error),
        );
      }
      throw error;
    } finally {
      // The run owns the child, however it ended: closing kills it and hands
      // the slot to whichever run is waiting.
      session?.close();
      // And the concurrency slot, so the next QUEUE'd firing starts.
      admission.release();
    }
  }

  // Firings of one workflow at a time; see run-gate.ts.
  private readonly runGate = new WorkflowRunGate();

  /** Why a trigger's firing of a PARKED workflow is refused; undefined when
   * it is not parked, or when an operator started the run. */
  private async parkedFiring(
    workflowId: string,
    triggerKind: string,
    publishedVersion: number,
  ): Promise<string | undefined> {
    if (OPERATOR_RUN_KINDS.has(triggerKind)) return undefined;
    const park = await this.parks.get(workflowId);
    if (!park || park.published_version < publishedVersion) return undefined;
    return `Skipped: this workflow is PARKED (${park.reason})`;
  }

  /** Why a firing that waited for its slot may no longer run, if it may not. */
  private async staleAfterWait(
    workflowId: string,
    triggerKind: string,
    publishedVersion: number,
  ): Promise<string | undefined> {
    const document =
      await this.host.reactorClient.get<WorkflowDocument>(workflowId);
    const state = document.state.global;
    if (state.status !== "ENABLED") {
      return `Skipped: the workflow became ${state.status} while this firing waited for its slot`;
    }
    if (runnableDefinition(state).version !== publishedVersion) {
      return "Skipped: the workflow was re-published while this firing waited for its slot";
    }
    return this.parkedFiring(workflowId, triggerKind, publishedVersion);
  }

  /** Whether the workflow is still ENABLED at this published version. An
   * unreadable document counts as unchanged, so a failure still parks. */
  private async stillRunsVersion(
    workflowId: string,
    publishedVersion: number,
  ): Promise<boolean> {
    let state: WorkflowState;
    try {
      const document =
        await this.host.reactorClient.get<WorkflowDocument>(workflowId);
      state = document.state.global;
    } catch (error) {
      this.logger.warn(
        `Could not re-read workflow ${workflowId} before parking it: @error`,
        error,
      );
      return true;
    }
    return (
      state.status === "ENABLED" &&
      runnableDefinition(state).version === publishedVersion
    );
  }

  /** A park recorded against an earlier published version than this state's. */
  private async outdatedPark(
    workflowId: string,
    state: WorkflowState,
  ): Promise<boolean> {
    if (state.status !== "ENABLED") return false;
    const park = await this.parks.get(workflowId);
    return (
      park !== undefined &&
      runnableDefinition(state).version > park.published_version
    );
  }

  /**
   * A firing SINGLETON refused.
   *
   * Journaled as a CANCELLED run rather than dropped: a firing that vanished
   * is indistinguishable from a trigger that never fired, which is the class
   * of bug this work package exists to stamp out. An already-enqueued row is
   * closed out in place, so nothing is left PENDING for a sweep to find.
   */
  // An adopted row is durable, so a refused firing closes it out: left
  // PENDING, the next owner reads its dedupe claim as handled and never runs it.
  private async refuseClosed(
    store: WorkflowRunStore | undefined,
    workflowId: string,
    enqueuedRunId: string | undefined,
  ): Promise<never> {
    const error = new WorkflowRuntimeClosedError(workflowId);
    if (enqueuedRunId) {
      try {
        await store?.failRun(enqueuedRunId, error.message, errorNameOf(error));
      } catch (failure) {
        this.logger.warn(
          `Could not close out run ${enqueuedRunId} after shutdown: @error`,
          failure,
        );
      }
    }
    throw error;
  }

  private async skipFiring(
    store: WorkflowRunStore | undefined,
    workflowId: string,
    enqueuedRunId: string | undefined,
    details: {
      reason: string;
      triggerKind: string;
      triggerPayload?: unknown;
      workflowName: string;
      workflowVersion: number;
    },
    refusal: FiringRefusal,
  ): Promise<PersistedRunResult> {
    this.logger.info(`Workflow ${workflowId}: ${details.reason}`);
    let runId = enqueuedRunId ?? null;
    if (store) {
      try {
        if (runId) {
          // The row is already durable, with its trigger payload; adopt and
          // close it rather than leaving a PENDING run for a sweep to find.
          await store.beginRun(runId, details);
        } else {
          runId = await store.startRun({ workflowId, ...details });
        }
        await store.cancelRun(runId, details.reason);
      } catch (error) {
        this.logger.warn(
          `Could not journal the skipped firing of workflow ${workflowId}: @error`,
          error,
        );
      }
    }
    return { status: CANCELLED_RUN_STATUS, steps: [], runId, refusal };
  }

  /**
   * `policy.onFailure` for a run that failed terminally.
   *
   * PARK is the document model's own default, so this is where enforcing the
   * knob becomes visible: a terminal failure parks the workflow, whatever its
   * trigger kind, and nothing fires it until it is re-published or
   * re-enabled. That is what PARK means, and
   * leaving a broken workflow firing every minute is what it meant before.
   *
   * NOTIFY logs at error level, which is the only notification channel this
   * engine has; it is marked as such rather than pretending to page anyone.
   */
  private async applyFailureMode(
    policy: EffectiveRunPolicy,
    workflowId: string,
    publishedVersion: number,
    runId: string | null,
    error: string | undefined,
  ): Promise<void> {
    // A run that failed as the runtime shut down says nothing about the
    // workflow, and a park now would land in the next owner's journal.
    if (policy.onFailure === "IGNORE" || this.closed) return;
    const detail = error ?? "the run failed";
    if (policy.onFailure === "NOTIFY") {
      this.logger.error(
        `Workflow ${workflowId} run ${runId ?? "(unjournaled)"} failed and ` +
          `its policy is NOTIFY: @error`,
        detail,
      );
      return;
    }
    const store = await this.store();
    if (!store) return;
    const reason = `Parked after a failed run (policy.onFailure = PARK): ${detail}`;
    try {
      // The run may have outlived its version: a disable or re-publish that
      // landed meanwhile is not the state that failed.
      if (!(await this.stillRunsVersion(workflowId, publishedVersion))) return;
      if (this.closed) return;
      // The park row covers every trigger kind; the trigger_state row is what
      // stops the supervisor polling a schedule or piece trigger.
      const trigger = await this.supervisor().park(
        workflowId,
        publishedVersion,
        reason,
      );
      // Checked again after the write, so a change racing the park wins: one
      // that landed before this read is undone here, one after it clears the
      // park in its own registration.
      if (!(await this.stillRunsVersion(workflowId, publishedVersion))) {
        // A registration of the change arms on its own: a park never blocks
        // a version newer than the one that failed.
        await this.supervisor().liftPark(workflowId, publishedVersion, trigger);
        return;
      }
      // In registration order, and only while this park stands: a registration
      // of a newer version that already ran must keep its entry.
      const stands = await this.inRegistrationOrder(workflowId, async () => {
        const park = await this.parks.get(workflowId);
        const current = park?.published_version === publishedVersion;
        const registered = this.registry.get(workflowId);
        if (current && registered && !SUPERVISED_KINDS.has(registered.kind)) {
          this.registry.delete(workflowId);
        }
        return current;
      });
      if (!stands) return;
      this.logger.error(
        `Workflow ${workflowId} is PARKED after run ${runId ?? "(unjournaled)"} ` +
          "failed; its trigger will not fire again until the workflow is " +
          "re-published or re-enabled",
      );
    } catch (parkError) {
      this.logger.warn(
        `Applying onFailure = PARK to workflow ${workflowId} after a failed run failed; whether it is parked is unknown: @error`,
        parkError,
      );
    }
  }

  // Resume a FAILED run: journaled step outputs replay, execution restarts
  // at the first step that didn't succeed. Runs the current runnable definition.
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
    // A test ran one block on sample data; replaying it as a run would fire
    // the whole published workflow, side effects included
    if (run.trigger_kind === "test") {
      throw new Error(
        `Run "${runId}" tested a single step or trigger; test it again instead of rerunning it`,
      );
    }
    // A run its deadline cancelled resumes too; a refused firing never ran.
    const deadlineCancelled =
      run.status === CANCELLED_RUN_STATUS &&
      run.error_name === RUN_DEADLINE_ERROR_NAME;
    if (run.status !== "FAILED" && !deadlineCancelled) {
      throw new Error(
        `Only FAILED runs, and runs their deadline cancelled, can be rerun; run is ${run.status}`,
      );
    }
    const triggerPayload =
      run.trigger_payload === null
        ? undefined
        : (JSON.parse(run.trigger_payload) as unknown);
    // The journal capped an oversized payload to a marker (store.ts,
    // STEP_PAYLOAD_MAX_BYTES); replaying it would hand the marker to the
    // workflow as trigger data. Refuse before anything runs.
    if (isTruncatedStepPayload(triggerPayload)) {
      throw new Error(
        `Trigger payload of run "${runId}" was truncated by the journal and ` +
          "cannot be replayed; fire the workflow again instead of rerunning it",
      );
    }
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
      runnableDefinition(document.state.global).steps.map((step) => [
        step.id,
        stepDefinition(step),
      ]),
    );
    // Reuse an output only while the step is the step that produced it: same
    // key, and the same definition hash (block type, config, connection, schemas).
    const completedSteps = new Map<string, ReplayedStep>();
    for (const row of await store.getSteps(runId)) {
      if (row.status !== "SUCCEEDED" && row.status !== "REPLAYED") continue;
      const current = currentSteps.get(row.step_id);
      if (
        !current ||
        current.key !== row.step_key ||
        row.config_hash === null ||
        stepConfigHash(current) !== row.config_hash
      ) {
        continue;
      }
      const output =
        row.output === null ? undefined : (JSON.parse(row.output) as unknown);
      // The journal capped this output to a marker (store.ts,
      // STEP_PAYLOAD_MAX_BYTES). The step still counts as COMPLETED: it
      // succeeded, it had side effects, and re-running it would do them again
      // — which is exactly what dropping it from this map used to mean
      // (backlog item 15). Its output is unavailable instead, and a
      // downstream step that reads it fails the rerun by name. A declared
      // read has no side effect to repeat, so it re-runs instead.
      if (isTruncatedStepPayload(output)) {
        if (await this.rereads(current)) continue;
        completedSteps.set(row.step_id, {
          port: row.port,
          outputTruncated: true,
          // Carried so this rerun's REPLAYED row journals the marker again. A
          // NULL there would read as an ordinary replay on the NEXT rerun, and
          // the truncation fact would be gone after one generation.
          truncatedOutput: output,
        });
        continue;
      }
      // Reads re-read the documents they referenced; a succeeded write is never
      // repeated. An INDETERMINATE step is not in this map, so it runs again.
      if (containsDocumentRef(output) && (await this.rereads(current))) {
        continue;
      }
      completedSteps.set(row.step_id, { output, port: row.port });
    }
    return this.fire(
      run.workflow_id,
      triggerPayload,
      "rerun",
      { completedSteps, rerunOf: runId },
      ctx,
    );
  }

  // Whether a rerun executes this step again rather than reuse its output.
  private async rereads(
    step: ReturnType<typeof stepDefinition>,
  ): Promise<boolean> {
    const parsed = resolvedBlock(await this.resolveBlock(stepBlock(step)));
    return parsed ? (await this.declaredReactor(parsed)) === "read" : false;
  }

  // Runs one draft step against the latest test outputs of the blocks it
  // reads, journals it as a "test" run and notes it as the step's lastTest.

  // It hands the step's connection to piece code, so the caller must be able
  // to read the workflow and that connection, as for testTrigger.
  async testStep(
    workflowId: string,
    stepId: string,
    ctx?: WorkflowCaller,
    access: WorkflowAccessOptions = {},
  ): Promise<StepTestResult> {
    await this.assertCanReadWorkflow(workflowId, ctx, access.driveId);
    const document =
      await this.host.reactorClient.get<WorkflowDocument>(workflowId);
    const state = document.state.global;
    const step = state.steps.find((candidate) => candidate.id === stepId);
    if (!step) throw new Error(`Step "${stepId}" not found`);
    if (step.connectionId) {
      await this.assertCanReadDocument(step.connectionId, ctx);
    }
    if (step.reactorConnectionId) {
      await this.assertCanReadDocument(step.reactorConnectionId, ctx);
    }
    const refused = (error: string): StepTestResult => ({
      runId: null,
      status: "FAILED",
      error,
      durationMs: 0,
    });

    const upstream = await this.testScope(state, step, ctx);
    if ("error" in upstream) return refused(upstream.error);
    let resolved;
    try {
      resolved = await resolveVariables(state.variables, this.secretProvider());
    } catch (error) {
      return refused(error instanceof Error ? error.message : String(error));
    }
    const { variables, secretValues } = resolved;
    const definition = {
      name: state.name,
      trigger: null,
      steps: [draftStepDef(step)],
      edges: [],
      variables,
    };
    // A journaled sample carries markers where secrets were: refuse to hand
    // them to the step as if they were values.
    let input: unknown;
    try {
      input = resolveStepInput(definition.steps[0], {
        trigger: { payload: upstream.triggerPayload },
        steps: upstream.priorSteps,
        variables: Object.fromEntries(variables.map((v) => [v.key, v.value])),
      });
    } catch {
      // The run below fails the step with the same error, and journals it.
      input = step.config;
    }
    if (containsRedactedMarker(input) && !containsRedactedMarker(step.config)) {
      const sources = upstream.samples
        .filter((sample) => containsRedactedMarker(sample.value))
        .map((sample) => sample.label);
      return refused(
        `"${step.key}" reads a value redacted from the last test of ${sources.join(", ") || "an earlier block"}`,
      );
    }

    const store = await this.store();
    let runId: string | null = null;
    try {
      runId =
        (await store?.startRun({
          workflowId,
          workflowName: runJournalName(state.name, document.header.name),
          workflowVersion: state.version,
          triggerKind: TEST_TRIGGER_KIND,
        })) ?? null;
    } catch (error) {
      this.logger.warn(
        `Could not journal the test of "@step" on workflow ${workflowId}: @error`,
        step.key,
        error,
      );
    }
    const executor = this.blockExecutor(store);
    const handed = new Set<string>();
    const started = Date.now();
    let session: PieceWorkerSession | undefined;
    let result: WorkflowRunResult;
    try {
      session = this.workers().session();
      const journaledRunId = runId;
      result = await withRunScope(
        {
          workflowId,
          runId,
          connections: declaredConnectionIds(definition),
          pieceWorker: session,
          stepTest: true,
          // A single-step test acts as its caller.
          runUser: this.callerRunUser(ctx),
          recordDocuments: async (documentIds: string[]) => {
            for (const documentId of documentIds) handed.add(documentId);
            if (store && journaledRunId) {
              await store.recordRunDocuments(journaledRunId, documentIds);
            }
          },
        },
        () =>
          runWorkflow({
            definition,
            executor,
            ...(secretValues.length > 0 ? { redactValues: secretValues } : {}),
            triggerPayload: upstream.triggerPayload,
            priorSteps: upstream.priorSteps,
            onStep:
              store && journaledRunId
                ? (record, ordinal) =>
                    store.recordStep(journaledRunId, ordinal, record)
                : undefined,
          }),
      );
    } catch (error) {
      if (store && runId) {
        const detail = error instanceof Error ? error.message : String(error);
        await store
          .failRun(runId, detail, errorNameOf(error))
          .catch(() => undefined);
        await this.noteLastTest(
          workflowId,
          { stepId: step.id, key: step.key },
          runId,
          new Date().toISOString(),
        );
      }
      throw error;
    } finally {
      session?.close();
    }
    const durationMs = Date.now() - started;
    const [record] = result.steps;
    if (store && runId) {
      try {
        await store.finishRun(runId, result);
      } catch (error) {
        this.logger.warn(
          `Run ${runId}: closing the test of "@step" out failed: @error`,
          step.key,
          error,
        );
      }
      await this.noteLastTest(
        workflowId,
        record,
        runId,
        record.endedAt ?? new Date().toISOString(),
      );
    }
    // Served as `run` would serve it: documents the caller cannot read stay out.
    const ids = [...triggerDocumentIds(upstream.triggerPayload), ...handed];
    const served = ctx ? await this.servesDocuments(ids, ctx) : false;
    return {
      runId,
      status: testStatusOf(record.status),
      ...(served && record.output !== undefined
        ? { output: record.output }
        : {}),
      ...(record.error ? { error: record.error } : {}),
      ...(record.errorName ? { errorName: record.errorName } : {}),
      durationMs,
    };
  }

  // The scope a step test runs in: the trigger's and each read step's latest
  // test output. An untested block it reads is an error naming that block.
  private async testScope(
    state: WorkflowState,
    step: WorkflowState["steps"][number],
    ctx: WorkflowCaller | undefined,
  ): Promise<
    | { error: string }
    | {
        triggerPayload?: unknown;
        priorSteps: ExpressionScope["steps"];
        samples: { label: string; value: unknown }[];
      }
  > {
    const refs = scopeReferences(step.config);
    const samples: { label: string; value: unknown }[] = [];
    let triggerPayload: unknown;
    if (refs.trigger && state.trigger) {
      const sample = await this.lastTestSample(
        {
          id: state.trigger.id,
          pieceName: state.trigger.pieceName,
          name: state.trigger.triggerName,
          lastTest: state.trigger.lastTest,
        },
        ctx,
      );
      if (sample.kind !== "succeeded") {
        return { error: untestedError("the trigger", sample) };
      }
      const read = await this.readReferencedDocuments(sample.output, ctx);
      if ("error" in read) {
        return { error: `The last test of the trigger read ${read.error}` };
      }
      const { payload, empty } = triggerSamplePayload(read.value);
      if (empty) {
        return {
          error: "Test the trigger first: its last test returned no items",
        };
      }
      triggerPayload = payload;
      samples.push({ label: "the trigger", value: payload });
    }
    const upstream = upstreamStepIds(state, step.id);
    const read = state.steps.filter(
      (candidate) =>
        candidate.id !== step.id &&
        (refs.steps.has(candidate.key) ||
          (refs.allSteps && upstream.has(candidate.id))),
    );
    const priorSteps: ExpressionScope["steps"] = {};
    for (const candidate of read) {
      // A skipped step continues with a null output, as in a run.
      if (candidate.skip === true) {
        priorSteps[candidate.key] = { output: null };
        continue;
      }
      const label = `"${candidate.key}"`;
      const sample = await this.lastTestSample(
        {
          id: candidate.id,
          pieceName: candidate.pieceName,
          name: candidate.actionName,
          lastTest: candidate.lastTest,
        },
        ctx,
      );
      const fields = refs.steps.get(candidate.key);
      const readsErrorOnly =
        fields !== undefined && [...fields].every((field) => field === "error");
      if (sample.kind === "failed" && readsErrorOnly) {
        priorSteps[candidate.key] = { error: sample.error };
        continue;
      }
      if (sample.kind !== "succeeded") {
        return { error: untestedError(label, sample) };
      }
      const read = await this.readReferencedDocuments(sample.output, ctx);
      if ("error" in read) {
        return { error: `The last test of ${label} read ${read.error}` };
      }
      priorSteps[candidate.key] = { output: read.value };
      samples.push({ label, value: read.value });
    }
    return { triggerPayload, priorSteps, samples };
  }

  // A journaled sample with each document it references read now, as the
  // caller: the journal keeps references, not state.
  private async readReferencedDocuments(
    value: unknown,
    ctx: WorkflowCaller | undefined,
  ): Promise<{ value: unknown } | { error: string }> {
    const references = documentRefsIn(value);
    if (references.length === 0) return { value };
    const subject = ctx ? this.host.subjectOf?.(ctx) : undefined;
    const key = (reference: DocumentReference) =>
      `${reference.branch}:${reference.documentId}`;
    const read = new Map<string, Record<string, unknown>>();
    for (const reference of references) {
      if (read.has(key(reference))) continue;
      try {
        await this.assertCanReadDocument(reference.documentId, ctx);
        const document = await this.host.reactorClient.get(
          reference.documentId,
          { branch: reference.branch, ...(subject ? { subject } : {}) },
        );
        read.set(key(reference), {
          header: document.header,
          state: document.state,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          error: `document "${reference.documentId}", which cannot be read now: ${detail}`,
        };
      }
    }
    return {
      value: expandDocumentRefs(value, (reference) =>
        read.get(key(reference))!,
      ),
    };
  }

  // A journaled sample's document references as the picker's document shape:
  // the reference's own header fields, and the model's global state fields.
  private async documentShapes(
    value: unknown,
  ): Promise<{ value: unknown; nodes: OutputTreeNode[] }> {
    const types = [
      ...new Set(documentRefsIn(value).map((ref) => ref.documentType)),
    ];
    const fields = new Map(
      await Promise.all(
        types.map(
          async (type) => [type, await this.stateFields(type)] as const,
        ),
      ),
    );
    const treeOf = (reference: DocumentReference) =>
      documentTree(fields.get(reference.documentType) ?? []);
    const expanded = expandDocumentRefs(value, (reference) => {
      const shape = treeValue(treeOf(reference));
      return {
        ...shape,
        header: {
          ...(shape.header as Record<string, unknown>),
          id: reference.documentId,
          documentType: reference.documentType,
          branch: reference.branch,
          revision: reference.revision,
        },
      };
    });
    return { value: expanded, nodes: fromSample(value, 0, treeOf) };
  }

  // A block's lastTest, read back from the journal. A test of a different
  // block, or one the caller may not see, is no sample.
  private async lastTestSample(
    block: {
      id: string;
      pieceName: string;
      name: string;
      lastTest?: { runId: string; testedAt: string } | null;
    },
    ctx: WorkflowCaller | undefined,
  ): Promise<TestSample> {
    const lastTest = block.lastTest;
    const store = await this.store();
    if (!lastTest || !store) return { kind: "untested" };
    const run = await store.getRun(lastTest.runId);
    if (!run) return { kind: "untested" };
    if ((await this.servedRuns([run], ctx)).length === 0) {
      return { kind: "hidden" };
    }
    const row = (await store.getSteps(run.id)).find(
      (candidate) => candidate.step_id === block.id,
    );
    if (!row) return { kind: "untested" };
    if (row.piece_name !== block.pieceName || row.block_name !== block.name) {
      return { kind: "stale" };
    }
    const { runId, testedAt } = lastTest;
    if (row.status === "FAILED") {
      return { kind: "failed", runId, testedAt, error: row.error ?? "" };
    }
    // Not a sample either way: the test neither returned an output nor failed,
    // so a draft step that read it would be standing on a null nobody
    // confirmed. Its own kind, so the message says which of the two it is.
    if (row.status === "INDETERMINATE") return { kind: "indeterminate" };
    const output =
      row.output === null ? null : (JSON.parse(row.output) as unknown);
    // The journal capped this output to a marker (store.ts,
    // STEP_PAYLOAD_MAX_BYTES); serving it would hand the marker to a draft
    // step, or to the expression picker, as if it were the block's data.
    if (isTruncatedStepPayload(output)) return { kind: "truncated" };
    return { kind: "succeeded", runId, testedAt, output };
  }

  // Output tree of a draft step or trigger for the expression picker: its
  // latest test output when there is one, else the block's authored shape.
  async stepOutputTree(
    workflowId: string,
    stepId: string,
    ctx?: WorkflowCaller,
  ): Promise<OutputTree> {
    await this.assertCanReadDocument(workflowId, ctx);
    const document =
      await this.host.reactorClient.get<WorkflowDocument>(workflowId);
    const state = document.state.global;
    const isTrigger = state.trigger?.id === stepId;
    const step = state.steps.find((candidate) => candidate.id === stepId);
    const found =
      isTrigger && state.trigger
        ? { ...state.trigger, block: triggerBlock(state.trigger) }
        : step
          ? { ...step, block: stepBlock(step) }
          : undefined;
    if (!found) throw new Error(`Step "${stepId}" not found`);
    const sample = await this.lastTestSample(
      {
        id: found.id,
        pieceName: found.block.pieceName,
        name: found.block.name,
        lastTest: found.lastTest,
      },
      ctx,
    );
    if (sample.kind === "succeeded") {
      const journaled = isTrigger
        ? triggerSamplePayload(sample.output).payload
        : sample.output;
      // Documents the test read are journaled as references; their fields
      // come from the model, never from journaled state.
      const { value, nodes } = await this.documentShapes(journaled);
      return {
        source: "test",
        nodes,
        sample: value,
        testedAt: sample.testedAt,
        runId: sample.runId,
      };
    }
    return this.blockOutputTree(found.block, found.config);
  }

  // Every block of the draft as this reactor would run it, for the editor's
  // version badges and "update available".
  async blockResolutions(
    workflowId: string,
    ctx?: WorkflowCaller,
  ): Promise<BlockResolutionRecord[]> {
    const state = await this.draftOf(workflowId, ctx);
    return Promise.all(
      draftBlocks(state).map(async ({ id, block }) => {
        const resolution = await this.resolveBlock(block, { latest: true });
        return {
          stepId: id,
          pieceName: block.pieceName,
          pieceVersion: block.pieceVersion,
          name: block.name,
          kind: block.kind,
          resolvedVersion: resolution.resolved?.version ?? null,
          source: resolution.resolved?.source ?? null,
          match: resolution.match,
          note: resolution.note ?? null,
          latestVersion: resolution.latestVersion ?? null,
        };
      }),
    );
  }

  private async draftOf(
    workflowId: string,
    ctx: WorkflowCaller | undefined,
  ): Promise<WorkflowState> {
    await this.assertCanReadDocument(workflowId, ctx);
    const document =
      await this.host.reactorClient.get<WorkflowDocument>(workflowId);
    return document.state.global;
  }
}

/** The runtime a host composes: one instance, its lifetime the host's. */
export function createWorkflowRuntime(
  deps: WorkflowRuntimeHostDeps,
): WorkflowRuntimeService {
  return new WorkflowRuntimeService(deps);
}
