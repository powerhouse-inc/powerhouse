// Package-level runtime shared by the subgraph (config + manual fire) and the
// document-event processor; moves to a dedicated runtime package later.
import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import {
  buildDescriptor,
  ensurePieceBundle,
  loadPieceFromDir,
  parseBlockType,
  PieceWorker,
  runWorkflow,
  shapeAuthValue,
  throwingStub,
  type ApPiece,
  type BlockExecutor,
  type ConnectionAuthType,
  type ConnectorDescriptor,
  type SecretProvider,
  type SecretStore,
  type WorkflowRunResult,
} from "@powerhousedao/reactor-connectors";
import { childLogger, type OperationWithContext } from "document-model";
import {
  actions as connectionActions,
  type ConnectionDocument,
} from "document-models/connection/v1";
import type {
  WorkflowDocument,
  WorkflowState,
} from "document-models/workflow/v1";
import {
  DOCUMENT_OPTION_PROPS,
  resolveDocumentOptions,
  staticString,
} from "./document-options.js";
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
  type OutputTree,
} from "./output-tree.js";
import { fetchPieceCatalog, fetchPieceDetail } from "./piece-catalog.js";
import {
  BUNDLE_CACHE_DIR,
  createBlockExecutor,
  DocumentConnectionResolver,
  toWorkflowDefinition,
} from "./lib.js";
import { SCHEDULE_BLOCK } from "./schedule.js";
import { LocalEncryptedSecretStore } from "./secret-store.js";
import { WorkflowRunStore, type TriggerStateRow } from "./store.js";
import {
  TriggerSupervisor,
  type PieceTriggerBinding,
  type TriggerBinding,
} from "./trigger-supervisor.js";
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

const CHECK_TIMEOUT_MS = 30_000;

const logger = childLogger(["workflow", "runtime"]);

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";
const WORKFLOW_DOCUMENT_TYPE = "powerhouse/workflow";
// Document creation, deletion and parent linking are appended to the document
// itself in this scope, not to any drive.
const DOCUMENT_SCOPE = "document";
// The relationship type the reactor uses for containment: a drive (or any
// parent document) -> child document edge.
const CHILD_RELATIONSHIP = "child";

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function inputRecord(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== "object") return {};
  return input as Record<string, unknown>;
}

// Where a lifecycle payload's driveId / parentId come from. CREATE_DOCUMENT
// knows nothing about containment, so the parent is read off the sibling
// operations the reactor writes in the same job.
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

// Indexes one batch of operations by the document a lifecycle event is about.
// The reactor's own addFile writes CREATE_DOCUMENT and ADD_RELATIONSHIP in a
// single job, so the drive is known without a read; the drive's ADD_FILE lands
// in a later job and only enriches a fallback fire.
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

// "@acme/connector-imap#imap" -> "@acme/connector-imap"; mirrors the
// connector id scheme the connection editor writes.
function packageNameFromConnectorId(connectorId: string): string {
  const separator = connectorId.lastIndexOf("#");
  return separator > 0 ? connectorId.slice(0, separator) : connectorId;
}

// A piece's checkConnection returns void | boolean |
// { name | username | email | sub }; anything string-valued labels the account.
function accountLabelFromCheckResult(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  for (const key of ["name", "username", "email", "sub"]) {
    const value = record[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return undefined;
}

async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  const timedOut = new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () =>
        reject(
          new Error(
            `Connection check timed out after ${Math.round(timeoutMs / 1000)}s`,
          ),
        ),
      { once: true },
    );
  });
  return Promise.race([operation(), timedOut]);
}

type TriggerRegistration = {
  workflowId: string;
} & (
  | { kind: "document-event"; filter: DocumentEventFilter }
  | { kind: "document-created" | "document-deleted"; filter: LifecycleFilter }
  // Timer-driven kinds live in the TriggerSupervisor.
  | { kind: "piece" | "schedule" }
);

const SUPERVISED_KINDS = new Set(["piece", "schedule"]);

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

export class WorkflowRuntimeService {
  private subgraph?: BaseSubgraph;
  private executor?: BlockExecutor;
  private storePromise?: Promise<WorkflowRunStore>;
  private secretsPromise?: Promise<LocalEncryptedSecretStore>;
  private readonly registry = new Map<string, TriggerRegistration>();

  // Called by the subgraph on construction; seeds the trigger registry and
  // opens the run journal.
  configure(subgraph: BaseSubgraph): void {
    if (this.subgraph) return;
    this.subgraph = subgraph;
    this.storePromise = WorkflowRunStore.create(subgraph.relationalDb);
    this.storePromise.catch((error: unknown) => {
      logger.error("Failed to open the workflow run store", error);
    });
    this.seedRegistry().catch((error: unknown) => {
      logger.error("Failed to seed document-event registry", error);
    });
  }

  // The journal is best-effort: a broken store never blocks runs.
  async store(): Promise<WorkflowRunStore | undefined> {
    if (!this.storePromise) return undefined;
    try {
      return await this.storePromise;
    } catch {
      return undefined;
    }
  }

  // Unlike the journal, a broken secret store must fail resolution loudly.
  secrets(): Promise<SecretStore> {
    if (!this.subgraph) {
      return Promise.reject(
        new Error("Workflow runtime is not configured yet"),
      );
    }
    this.secretsPromise ??= LocalEncryptedSecretStore.create(
      this.subgraph.relationalDb,
    );
    return this.secretsPromise;
  }

  private secretProvider(): SecretProvider {
    return { get: (ref) => this.secrets().then((store) => store.get(ref)) };
  }

  private async seedRegistry(): Promise<void> {
    if (!this.subgraph) return;
    const page = await this.subgraph.reactorClient.find({
      type: "powerhouse/workflow",
    });
    for (const document of page.results as WorkflowDocument[]) {
      this.updateRegistration(document.header.id, document.state.global);
    }
    logger.info(`Trigger registry seeded: ${this.registry.size} workflow(s)`);
  }

  private updateRegistration(workflowId: string, state: WorkflowState): void {
    const trigger = state.status === "ENABLED" ? state.trigger : undefined;
    const kind: TriggerKind | undefined = trigger
      ? TRIGGER_KIND_BY_BLOCK[trigger.blockType]
      : undefined;
    const supervised =
      trigger && !kind
        ? this.supervisedBinding(workflowId, trigger)
        : undefined;

    if (!kind && !supervised) {
      const had = this.registry.get(workflowId);
      this.registry.delete(workflowId);
      if (had && SUPERVISED_KINDS.has(had.kind))
        this.dropSupervised(workflowId);
      return;
    }
    if (supervised) {
      const supervisedKind =
        supervised.kind === "schedule" ? "schedule" : "piece";
      this.registry.set(workflowId, { workflowId, kind: supervisedKind });
      this.supervisor()
        .upsert(supervised)
        .catch((error: unknown) => {
          logger.error(`Trigger enable failed for ${workflowId}`, error);
        });
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

  // Triggers the supervisor drives on its tick: piece polls and schedules.
  private supervisedBinding(
    workflowId: string,
    trigger: NonNullable<WorkflowState["trigger"]>,
  ): TriggerBinding | undefined {
    if (trigger.blockType === SCHEDULE_BLOCK) {
      return {
        kind: "schedule",
        workflowId,
        blockType: SCHEDULE_BLOCK,
        config: configRecord(trigger.config),
      };
    }
    return this.pieceBinding(workflowId, trigger);
  }

  private pieceBinding(
    workflowId: string,
    trigger: NonNullable<WorkflowState["trigger"]>,
  ): PieceTriggerBinding | undefined {
    const parsed = parseBlockType(trigger.blockType);
    if (!parsed || parsed.kind !== "trigger") return undefined;
    return {
      workflowId,
      blockType: trigger.blockType,
      packageName: parsed.packageName,
      version: parsed.version,
      triggerName: parsed.name,
      config: configRecord(trigger.config),
      connectionId: trigger.connectionId,
    };
  }

  private dropSupervised(workflowId: string): void {
    this.supervisor()
      .remove(workflowId)
      .catch((error: unknown) => {
        logger.error(`Trigger disable failed for ${workflowId}`, error);
      });
  }

  private async refreshRegistration(
    workflowId: string,
    resultingState?: string,
  ): Promise<void> {
    if (resultingState) {
      try {
        this.updateRegistration(
          workflowId,
          JSON.parse(resultingState) as WorkflowState,
        );
        return;
      } catch {
        // fall through to a fresh read
      }
    }
    if (!this.subgraph) return;
    const document =
      await this.subgraph.reactorClient.get<WorkflowDocument>(workflowId);
    this.updateRegistration(workflowId, document.state.global);
  }

  // The manager routes by filter only, so every per-drive processor instance
  // delivers every matching operation; dedup keeps fires once-per-operation.
  private readonly seenOps = new Set<string>();
  private readonly seenOpsQueue: string[] = [];

  private alreadySeen(op: OperationWithContext): boolean {
    const key =
      op.context.ordinal > 0
        ? `o:${op.context.ordinal}`
        : `${op.context.documentId}:${op.context.scope}:${op.context.branch}:${op.operation.index}`;
    if (this.seenOps.has(key)) return true;
    this.seenOps.add(key);
    this.seenOpsQueue.push(key);
    if (this.seenOpsQueue.length > 8192) {
      const evicted = this.seenOpsQueue.shift();
      if (evicted) this.seenOps.delete(evicted);
    }
    return false;
  }

  // Called by the document-event processor. Registry updates are awaited;
  // fires are not, so runs never block operation ingestion.
  async onOperations(operations: OperationWithContext[]): Promise<void> {
    const hints = collectLifecycleParentHints(operations);
    for (const { operation, context } of operations) {
      if (context.scope === DOCUMENT_SCOPE) {
        if (this.alreadySeen({ operation, context })) continue;
        await this.matchDocumentLifecycle(operation, context, hints);
        continue;
      }
      if (context.scope !== "global") continue;
      if (this.alreadySeen({ operation, context })) continue;
      // A workflow edit updates the registry, then falls through: workflow
      // documents are also a document-event source, so a workflow can watch
      // its own document type (e.g. SET_WORKFLOW_STATUS).
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
        this.fireFromTrigger(
          registration.workflowId,
          payload,
          registration.kind,
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

  private fireFromTrigger(
    workflowId: string,
    payload: unknown,
    kind: string,
  ): void {
    this.fire(workflowId, payload, kind).then(
      (run) => {
        logger.info(`${kind} fired workflow ${workflowId}: ${run.status}`);
      },
      (error: unknown) => {
        logger.error(`${kind} run failed for workflow ${workflowId}`, error);
      },
    );
  }

  // A document lifecycle event fires once per document, from whichever source
  // reports it first. Only a fire that actually matched a workflow is
  // recorded: a creation whose drive was still unknown matches no driveId
  // filter, and the drive's own ADD_FILE then still gets its turn.
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

  private fireLifecycle(
    kind: TriggerKind,
    payload: {
      documentId: string;
      documentType: string | null;
      name: string | null;
      driveId: string | null;
      parentId: string | null;
      operation: { index: number; timestampUtcMs: string };
    },
  ): void {
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
      this.fireFromTrigger(target.workflowId, payload, kind);
    }
    if (matched) this.recordLifecycleFired(kind, payload.documentId);
  }

  // A "child" edge names the parent document but not its type, and only a
  // drive parent is what a driveId filter is about. The lookup is cached: a
  // drive gathers many documents.
  private readonly driveParentCache = new Map<string, boolean>();

  private async driveIdFromParent(
    parentId: string | undefined,
  ): Promise<string | undefined> {
    if (!parentId) return undefined;
    const cached = this.driveParentCache.get(parentId);
    if (cached !== undefined) return cached ? parentId : undefined;
    if (!this.subgraph) return undefined;
    try {
      const parent = await this.subgraph.reactorClient.get(parentId);
      const isDrive = parent.header.documentType === DRIVE_DOCUMENT_TYPE;
      if (this.driveParentCache.size > 1024) this.driveParentCache.clear();
      this.driveParentCache.set(parentId, isDrive);
      return isDrive ? parentId : undefined;
    } catch {
      return undefined;
    }
  }

  // The document's own CREATE_DOCUMENT / DELETE_DOCUMENT. This is the source
  // of truth: it also covers a document created outside every drive, it
  // carries the real document type and name rather than a drive node's copy,
  // and it is the only signal that a document is actually gone.
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
    this.fireLifecycle(kind, {
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

  // The drive's own view of the same events, kept as a fallback. ADD_FILE
  // always accompanies a CREATE_DOCUMENT, so it only fires when that never
  // reached the processor. DELETE_NODE stands on its own: removing a file from
  // a drive leaves the document alive, and a drive-scoped workflow still wants
  // to hear about it.
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
        const document = await this.subgraph?.reactorClient.get(documentId);
        documentType = document?.header.documentType;
        name ??= document?.header.name ?? null;
      } catch {
        documentType = undefined;
      }
    }

    this.fireLifecycle(kind, {
      documentId,
      documentType: documentType ?? null,
      name,
      driveId,
      parentId: stringField(record, "parentFolder") ?? null,
      operation,
    });
  }

  private triggerSupervisor?: TriggerSupervisor;

  // Lazily built; started/stopped by the trigger processor's lifecycle.
  supervisor(): TriggerSupervisor {
    this.triggerSupervisor ??= new TriggerSupervisor({
      store: () => this.store(),
      resolveAuth: async (connectionId) => {
        if (!connectionId || !this.subgraph) return undefined;
        return new DocumentConnectionResolver(
          this.subgraph,
          this.secretProvider(),
        ).resolve(connectionId);
      },
      fire: (workflowId, payload, kind) => {
        this.fireFromTrigger(workflowId, payload, kind);
      },
      cacheDir: BUNDLE_CACHE_DIR,
      // Dev override; the 60s floor still applies.
      defaultIntervalMs:
        Number(process.env.WORKFLOW_POLL_INTERVAL_MS) || undefined,
    });
    return this.triggerSupervisor;
  }

  startTriggerSupervisor(): void {
    this.supervisor().start();
    if (!sigtermHooked) {
      sigtermHooked = true;
      process.once("SIGTERM", () => this.stopTriggerSupervisor());
    }
  }

  stopTriggerSupervisor(): void {
    this.triggerSupervisor?.stop();
  }

  async triggerStates(): Promise<TriggerStateRow[]> {
    const store = await this.store();
    return store ? store.listTriggerStates() : [];
  }

  private readonly descriptors = new Map<string, ConnectorDescriptor>();
  private designWorker?: PieceWorker;

  private async pieceDescriptor(
    packageName: string,
    version: string,
  ): Promise<ConnectorDescriptor> {
    const cacheKey = `${packageName}@${version}`;
    let descriptor = this.descriptors.get(cacheKey);
    if (!descriptor) {
      const bundle = await ensurePieceBundle({
        name: packageName,
        version,
        cacheDir: BUNDLE_CACHE_DIR,
      });
      const { piece } = await loadPieceFromDir(bundle.dir);
      descriptor = buildDescriptor(piece, { packageName, version });
      this.descriptors.set(cacheKey, descriptor);
    }
    return descriptor;
  }

  // The workflows a drive holds, so a drive app can scope runs to its own.
  async driveWorkflowIds(driveId: string): Promise<string[]> {
    if (!this.subgraph) return [];
    const page = await this.subgraph.reactorClient.drives.listNodes(driveId);
    // Only file nodes carry a documentType, so `in` also rules out folders.
    return page.results
      .filter(
        (node) =>
          "documentType" in node &&
          node.documentType === WORKFLOW_DOCUMENT_TYPE,
      )
      .map((node) => node.id);
  }

  // Design-time: every powerhouse/connection document, for connection pickers.
  async connections(): Promise<ConnectionSummary[]> {
    if (!this.subgraph) return [];
    const page = await this.subgraph.reactorClient.find({
      type: "powerhouse/connection",
    });
    return (page.results as ConnectionDocument[]).map((document) => {
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

  // Runs the piece's app.checkConnection (when declared) against the
  // connection's credentials and records the outcome on the document.
  async checkConnection(connectionId: string): Promise<ConnectionCheckResult> {
    if (!this.subgraph) {
      throw new Error("Workflow runtime is not configured yet");
    }
    const document =
      await this.subgraph.reactorClient.get<ConnectionDocument>(connectionId);
    if (document.header.documentType !== "powerhouse/connection") {
      throw new Error(
        `Document "${connectionId}" is not a powerhouse/connection`,
      );
    }
    const state = document.state.global;
    const accountLabel = state.accountLabel ?? null;

    if (state.status === "UNCONFIGURED") {
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

    const packageName = packageNameFromConnectorId(state.connectorId);
    let piece: ApPiece;
    try {
      const version = await this.pieceVersion(packageName);
      const bundle = await ensurePieceBundle({
        name: packageName,
        version,
        cacheDir: BUNDLE_CACHE_DIR,
      });
      piece = (await loadPieceFromDir(bundle.dir)).piece;
    } catch (error) {
      return this.recordCheckResult(document, {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        accountLabel,
      });
    }

    let shapedAuth: unknown;
    try {
      shapedAuth = await shapeAuthValue(
        {
          authType: state.authType as ConnectionAuthType,
          config: (state.config ?? {}) as Record<string, unknown>,
          secretRefs: state.secretRefs,
        },
        this.secretProvider(),
      );
    } catch (error) {
      // A missing or deleted secret names its ref in the message.
      return this.recordCheckResult(document, {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        accountLabel,
      });
    }

    const app = piece as ApPiece & {
      checkConnection?: (ctx: unknown) => Promise<unknown>;
    };
    if (typeof app.checkConnection !== "function") {
      return this.recordCheckResult(document, {
        ok: true,
        detail: "piece declares no connection check; credentials resolved",
        accountLabel,
      });
    }

    // Minimal check context: shaped auth and empty props; documented members
    // the runtime does not provide throw with their member path.
    const checkContext: Record<string, unknown> = {
      auth: shapedAuth,
      propsValue: {},
      logger,
      store: throwingStub("store"),
      files: throwingStub("files"),
      server: throwingStub("server"),
      events: throwingStub("events"),
      flow: throwingStub("flow"),
    };

    let ok = true;
    let detail: string | null = null;
    let label = accountLabel;
    try {
      const checkResult = await withTimeout(
        () => app.checkConnection!(checkContext),
        CHECK_TIMEOUT_MS,
      );
      if (checkResult === false) {
        ok = false;
        detail = "Connection check failed";
      } else {
        label = accountLabelFromCheckResult(checkResult) ?? accountLabel;
      }
    } catch (error) {
      ok = false;
      detail = error instanceof Error ? error.message : String(error);
    }
    return this.recordCheckResult(document, {
      ok,
      detail,
      accountLabel: label,
    });
  }

  // Catalog first, piece detail as fallback; the cache keeps this cheap.
  private async pieceVersion(packageName: string): Promise<string> {
    try {
      const catalog = await fetchPieceCatalog();
      const version = catalog.find(
        (entry) => entry.name === packageName,
      )?.version;
      if (version) return version;
    } catch {
      // Catalog unreachable; fall through to the piece detail.
    }
    const detail = (await fetchPieceDetail(packageName)) as {
      version?: unknown;
    };
    if (typeof detail.version === "string" && detail.version !== "") {
      return detail.version;
    }
    throw new Error(`Could not resolve a version for piece "${packageName}"`);
  }

  private async recordCheckResult(
    document: ConnectionDocument,
    result: ConnectionCheckResult,
  ): Promise<ConnectionCheckResult> {
    const action = connectionActions.recordCheckResult({
      status: result.ok ? "OK" : "ERROR",
      checkedAt: new Date().toISOString(),
      error: result.ok ? undefined : (result.detail ?? undefined),
    });
    await this.subgraph!.reactorClient.execute(document.header.id, "main", [
      action,
    ]);
    return result;
  }

  // Design-time: the action/trigger descriptor (props, auth) driving the
  // editor form; triggers come back under a "trigger" key.
  async blockDescriptor(blockType: string): Promise<unknown> {
    const parsed = parseBlockType(blockType);
    if (!parsed) return null;
    const descriptor = await this.pieceDescriptor(
      parsed.packageName,
      parsed.version,
    );
    const common = {
      displayName: descriptor.displayName,
      logoUrl: descriptor.logoUrl,
      auth: descriptor.auth ?? null,
    };
    if (parsed.kind === "trigger") {
      const trigger = descriptor.triggers.find(
        (entry) => entry.name === parsed.name,
      );
      return trigger ? { ...common, trigger } : null;
    }
    const action = descriptor.actions.find(
      (entry) => entry.name === parsed.name,
    );
    return action ? { ...common, action } : null;
  }

  // Design-time DROPDOWN options() / DYNAMIC props(), run in the piece worker.
  async blockOptions(
    blockType: string,
    propName: string,
    input?: unknown,
    connectionId?: string,
  ): Promise<unknown> {
    const parsed = parseBlockType(blockType);
    if (!parsed) {
      // Core blocks: document-aware props resolve against the reactor.
      if (this.subgraph && DOCUMENT_OPTION_PROPS.has(propName)) {
        return resolveDocumentOptions(
          this.subgraph.reactorClient,
          propName,
          (input ?? {}) as Record<string, unknown>,
        );
      }
      throw new Error(`Not a piece block type: "${blockType}"`);
    }
    // Auth-dependent options() resolvers need the step's connection.
    let auth: unknown;
    if (connectionId && this.subgraph) {
      auth = await new DocumentConnectionResolver(
        this.subgraph,
        this.secretProvider(),
      ).resolve(connectionId);
    }
    const bundle = await ensurePieceBundle({
      name: parsed.packageName,
      version: parsed.version,
      cacheDir: BUNDLE_CACHE_DIR,
    });
    this.designWorker ??= new PieceWorker();
    const result = await this.designWorker.resolveOptions({
      bundleDir: bundle.dir,
      actionName: parsed.name,
      kind: parsed.kind,
      propName,
      refresherValues: (input ?? {}) as Record<string, unknown>,
      auth,
    });
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
      case "core#branch":
        return {
          source: "static",
          nodes: [{ name: "condition", type: "value" }],
        };
      case "core#document-created":
      case "core#document-deleted":
        return { source: "static", nodes: lifecycleTriggerTree() };
      case "core#document-event": {
        const inputChildren = await this.operationInputFields(
          staticString(record.documentType),
          staticString(record.actionType),
        );
        return {
          source: inputChildren.length > 0 ? "schema" : "static",
          nodes: documentEventTree(inputChildren),
        };
      }
      case "core#document-find":
        return { source: "static", nodes: documentFindTree() };
      case "core#document-schema":
        return { source: "static", nodes: documentSchemaTree() };
      case "core#document-types":
        return { source: "static", nodes: documentTypesTree() };
      case "core#document-get": {
        // The type may come from a sibling hint when the id is an expression.
        const stateChildren = await this.stateFields(
          staticString(record.documentType),
        );
        return {
          source: stateChildren.length > 0 ? "schema" : "static",
          nodes: documentGetTree(stateChildren),
        };
      }
      case "core#document-create":
      case "core#document-dispatch": {
        const stateChildren = await this.stateFields(
          staticString(record.documentType),
        );
        return {
          source: stateChildren.length > 0 ? "schema" : "static",
          nodes: documentBlockTree(stateChildren),
        };
      }
      default: {
        const parsed = parseBlockType(blockType);
        if (!parsed) return { source: "none", nodes: [] };
        const detail = (await fetchPieceDetail(parsed.packageName)) as {
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
    if (!documentType || !this.subgraph) return [];
    try {
      const module =
        await this.subgraph.reactorClient.getDocumentModelModule(documentType);
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
    if (!documentType || !actionType || !this.subgraph) return [];
    try {
      const module =
        await this.subgraph.reactorClient.getDocumentModelModule(documentType);
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
  async testTrigger(workflowId: string): Promise<unknown> {
    if (!this.subgraph) {
      throw new Error("Workflow runtime is not configured yet");
    }
    const document =
      await this.subgraph.reactorClient.get<WorkflowDocument>(workflowId);
    const trigger = document.state.global.trigger;
    if (!trigger) throw new Error("Workflow has no trigger");
    const binding = this.pieceBinding(workflowId, trigger);
    if (!binding) {
      throw new Error(`"${trigger.blockType}" is not a piece trigger`);
    }
    return this.supervisor().test(binding);
  }

  async fire(
    workflowId: string,
    triggerPayload?: unknown,
    triggerKind = "manual",
    resume?: {
      completedSteps: Map<string, { output?: unknown; port?: string | null }>;
      rerunOf: string;
    },
  ): Promise<PersistedRunResult> {
    if (!this.subgraph) {
      throw new Error("Workflow runtime is not configured yet");
    }
    const document =
      await this.subgraph.reactorClient.get<WorkflowDocument>(workflowId);
    if (document.header.documentType !== "powerhouse/workflow") {
      throw new Error(`Document "${workflowId}" is not a powerhouse/workflow`);
    }
    const state = document.state.global;
    if (state.status !== "ENABLED") {
      throw new Error(
        `Workflow is ${state.status}; only ENABLED workflows can fire`,
      );
    }
    const definition = toWorkflowDefinition(state);
    this.executor ??= createBlockExecutor(this.subgraph, this.secretProvider());

    const store = await this.store();
    const runId =
      (await store?.startRun({
        workflowId,
        workflowName: state.name,
        workflowVersion: state.version,
        triggerKind,
        triggerPayload,
        rerunOf: resume?.rerunOf,
      })) ?? null;
    try {
      const result = await runWorkflow({
        definition,
        executor: this.executor,
        triggerPayload,
        completedSteps: resume?.completedSteps,
      });
      if (store && runId) await store.finishRun(runId, result);
      return { ...result, runId };
    } catch (error) {
      if (store && runId) {
        await store.failRun(
          runId,
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  }

  // Resume a FAILED run: journaled step outputs replay, execution restarts
  // at the first step that didn't succeed. Runs the current definition.
  async rerun(runId: string): Promise<PersistedRunResult> {
    if (!this.subgraph) {
      throw new Error("Workflow runtime is not configured yet");
    }
    const store = await this.store();
    if (!store) throw new Error("Run journal is unavailable");
    const run = await store.getRun(runId);
    if (!run) throw new Error(`Run "${runId}" not found`);
    if (run.status !== "FAILED") {
      throw new Error(`Only FAILED runs can be rerun; run is ${run.status}`);
    }
    const document = await this.subgraph.reactorClient.get<WorkflowDocument>(
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
    const triggerPayload =
      run.trigger_payload === null
        ? undefined
        : (JSON.parse(run.trigger_payload) as unknown);
    return this.fire(run.workflow_id, triggerPayload, "rerun", {
      completedSteps,
      rerunOf: runId,
    });
  }
}

let sigtermHooked = false;

export const workflowRuntime = new WorkflowRuntimeService();
