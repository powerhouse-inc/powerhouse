// Switchboard composes the workflow runtime from what it holds (the reactor
// module) and what startAPI hands back. The intake is a read model.
import {
  REACTOR_SCHEMA,
  supportsLiveReadModelRegistration,
  type AttachmentHash,
  type AttachmentRef,
  type DocumentViewDatabase,
  type InProcessReactorClientModule,
  type IReactorClient,
  type IRelationalDb,
} from "@powerhousedao/reactor";
import {
  AuthorizationPolicy,
  ForbiddenError,
  createCanonicalDocumentIdResolver,
  type AttachmentReferenceProjectionCapability,
  type CanonicalDocumentId,
  type Context,
  type IAuthorizationService,
  type IPackagePieceSource,
  type PackagePieceEntry,
  type SubgraphClass,
} from "@powerhousedao/reactor-api";
import {
  createRef,
  parseRef,
  type IAttachmentReferenceReader,
} from "@powerhousedao/reactor-attachments";
import type * as WorkflowEngine from "@powerhousedao/reactor-workflow";
import type {
  AttachmentClientLike,
  WorkflowCaller,
  WorkflowRuntimeHostDeps,
} from "@powerhousedao/reactor-workflow";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { IWebhookScope } from "@powerhousedao/shared/processors";
import type { ILogger } from "document-model";
import type { Kysely } from "kysely";
import { createWorkflowRuntimeSubgraph } from "./workflow/subgraph.js";

type WorkflowEngineModule = typeof WorkflowEngine;

/** The npm name the workflow package owns: its HTTP namespace and its models. */
export const WORKFLOW_PACKAGE_NAME = "@powerhousedao/workflow";

/** The env var and OpenFeature flag key that turns workflows on. */
export const PH_WORKFLOWS_ENABLED = "PH_WORKFLOWS_ENABLED";

/** Whether the operation intake is indexing. Same shape as the attachment
 * reference projection, because it is the same limitation. */
export type WorkflowTriggersCapability =
  | { status: "available" }
  | {
      status: "unavailable";
      reason:
        | "in-process-reactor-module-unavailable"
        | "live-read-model-registration-unsupported";
    };

/** The slice of switchboard's OpenFeature client this needs. */
export interface BooleanFlagSource {
  getBooleanValue(flagKey: string, defaultValue: boolean): Promise<boolean>;
}

export interface WorkflowsFlagInput {
  featureFlags: BooleanFlagSource;
  /** The host's own answer; wins over everything. */
  override?: boolean;
  /** `workflows.enabled` from the powerhouse config file. */
  configEnabled?: boolean;
  /** Defaults to process.env; the tests pass their own. */
  env?: Record<string, string | undefined>;
}

/** Precedence, unchanged from the reactor-api resolver this replaces: the
 * host's option, then PH_WORKFLOWS_ENABLED, then the config file, then off. */
export async function resolveWorkflowsEnabled({
  featureFlags,
  override,
  configEnabled = false,
  env = process.env,
}: WorkflowsFlagInput): Promise<boolean> {
  if (override !== undefined) return override;

  // The env layer is switchboard's OpenFeature client, which casts only
  // "true"/"false": the numeric forms reactor-api took are answered here.
  const raw = env[PH_WORKFLOWS_ENABLED]?.trim();
  if (raw === "1") return true;
  if (raw === "0") return false;

  return featureFlags.getBooleanValue(PH_WORKFLOWS_ENABLED, configEnabled);
}

// The package manager reports an unresolvable package and continues; for one
// the host added itself that is a misconfigured switchboard, not a degraded
// one. The manager imports this subpath moments later, so the cache absorbs it.
export async function assertWorkflowPackageLoadable(
  load: () => Promise<unknown> = () =>
    import("@powerhousedao/workflow/document-models"),
): Promise<void> {
  try {
    await load();
  } catch (error) {
    throw new Error(
      `Workflows are enabled but ${WORKFLOW_PACKAGE_NAME} could not be loaded`,
      { cause: error },
    );
  }
}

export interface ComposeWorkflowRuntimeDeps {
  reactorClient: IReactorClient;
  /** The registry this host installs packages from; pieces come from it too.
   * Absent on a host that installs from none, and only the cloud is read. */
  pieceRegistryUrl?: string;
  /** Where the trigger read model registers; absent leaves the intake
   * unavailable rather than quietly dropping every document trigger. */
  clientModule?: InProcessReactorClientModule;
  relationalDb: IRelationalDb;
  attachments: AttachmentClientLike;
  /** The projected document/ref relationships a step's attachment read is
   * checked against; without them, or without the projection, nothing reads. */
  attachmentReferences?: IAttachmentReferenceReader;
  attachmentReferenceProjection?: AttachmentReferenceProjectionCapability;
  webhooks?: IWebhookScope;
  authorizationService: IAuthorizationService;
  /** Where the pieces installed packages ship come from; absent leaves the
   * runtime with none and only published bundles resolvable. */
  pieces?: IPackagePieceSource;
  logger: ILogger;
  /** Overridden by the tests; production always loads the real engine. */
  load?: () => Promise<WorkflowEngineModule>;
}

export interface ComposedWorkflowRuntime {
  subgraph: SubgraphClass;
  /** Whether document operations reach the runtime at all. */
  triggers: WorkflowTriggersCapability;
  start(): Promise<void>;
  stop(): Promise<void>;
}

// The engine's own access check, answered as BaseSubgraph answers it: an admin
// passes, another policy fails closed, an unresolvable identifier is a denial.
function readAssertion(
  authorizationService: IAuthorizationService,
  reactorClient: IReactorClient,
): WorkflowRuntimeHostDeps["assertCanRead"] {
  const resolveCanonical = createCanonicalDocumentIdResolver(reactorClient);
  return async (identifier: string, caller: WorkflowCaller) => {
    const ctx = caller as Context;
    if (authorizationService.isSupremeAdmin(ctx.user?.address)) return;
    if (
      authorizationService.config.policy !==
      AuthorizationPolicy.DOCUMENT_PERMISSIONS
    ) {
      throw new ForbiddenError();
    }
    let documentId: CanonicalDocumentId;
    try {
      documentId = await resolveCanonical(identifier);
    } catch {
      throw new ForbiddenError();
    }
    const canRead = await authorizationService.canRead(
      documentId,
      ctx.user?.address,
    );
    if (!canRead) throw new ForbiddenError("to read this document");
  };
}

/** The same, for a design-time call that writes what it names. */
function writeAssertion(
  authorizationService: IAuthorizationService,
  reactorClient: IReactorClient,
): WorkflowRuntimeHostDeps["assertCanWrite"] {
  const resolveCanonical = createCanonicalDocumentIdResolver(reactorClient);
  return async (identifier: string, caller: WorkflowCaller) => {
    const ctx = caller as Context;
    if (authorizationService.isSupremeAdmin(ctx.user?.address)) return;
    if (
      authorizationService.config.policy !==
      AuthorizationPolicy.DOCUMENT_PERMISSIONS
    ) {
      throw new ForbiddenError();
    }
    let documentId: CanonicalDocumentId;
    try {
      documentId = await resolveCanonical(identifier);
    } catch {
      throw new ForbiddenError();
    }
    const canWrite = await authorizationService.canWrite(
      documentId,
      ctx.user?.address,
    );
    if (!canWrite) throw new ForbiddenError("to write this document");
  };
}

/** Whether the workflow document really references the attachment. A step
 * carries no caller, so the relationship is the whole check. */
function attachmentRefCheck(
  deps: ComposeWorkflowRuntimeDeps,
): WorkflowRuntimeHostDeps["canReadAttachmentRef"] {
  const resolveCanonical = createCanonicalDocumentIdResolver(
    deps.reactorClient,
  );
  const references = deps.attachmentReferences;
  const projection = deps.attachmentReferenceProjection;
  return async (documentId: string, ref: string) => {
    // An index nobody maintains is evidence of nothing, so it denies rather
    // than waves the read through.
    if (!references || projection?.status !== "available") return false;
    let parsed: { version: number; hash: string };
    try {
      parsed = parseRef(ref as AttachmentRef);
    } catch {
      return false;
    }
    if (parsed.version !== 1) return false;
    const canonicalRef = createRef(parsed.hash.toLowerCase() as AttachmentHash);
    try {
      return await references.hasReference(
        await resolveCanonical(documentId),
        canonicalRef,
      );
    } catch {
      return false;
    }
  };
}

// Live registration is the capability the attachment reference index needs
// too, so a coordinator without it reads unavailable for the same reason.
async function registerWorkflowTriggersReadModel(
  engine: WorkflowEngineModule,
  runtime: WorkflowEngine.WorkflowRuntimeService,
  clientModule: InProcessReactorClientModule | undefined,
): Promise<WorkflowTriggersCapability> {
  const reactorModule = clientModule?.reactorModule;
  if (!reactorModule) {
    return {
      status: "unavailable",
      reason: "in-process-reactor-module-unavailable",
    };
  }

  const coordinator = reactorModule.readModelCoordinator;
  if (!supportsLiveReadModelRegistration(coordinator)) {
    return {
      status: "unavailable",
      reason: "live-read-model-registration-unsupported",
    };
  }

  // Schema-qualified: the cursor row lives in the reactor's own ViewState.
  const readModel = new engine.WorkflowTriggersReadModel(
    (reactorModule.database as unknown as Kysely<unknown>).withSchema(
      REACTOR_SCHEMA,
    ) as unknown as Kysely<DocumentViewDatabase>,
    reactorModule.operationIndex,
    reactorModule.writeCache,
    reactorModule.processorManagerConsistencyTracker,
    runtime,
  );
  await readModel.init();
  coordinator.addReadModel(
    readModel,
    engine.WORKFLOW_TRIGGERS_READ_MODEL_STAGE,
  );

  return { status: "available" };
}

// The runtime holds pieces; reactor-api is what resolves them. Rebound on
// every change, so a package rebuilt while this runs needs no restart.
export function bindPackagePieces(
  registry: { setPieces(pieces: readonly PackagePieceEntry[]): void },
  source: IPackagePieceSource,
): void {
  const apply = (byPackage: Map<string, PackagePieceEntry[]>) => {
    registry.setPieces([...byPackage.values()].flat());
  };
  // The initial load already happened inside startAPI, so what it reported is
  // read here rather than waited for.
  apply(source.getPieces());
  source.onPiecesChange(apply);
}

// Builds the runtime, registers its intake, and returns its GraphQL face plus
// the lifecycle the host drives. The engine loads lazily: off means unloaded.
export async function composeWorkflowRuntime(
  deps: ComposeWorkflowRuntimeDeps,
): Promise<ComposedWorkflowRuntime> {
  const load = deps.load ?? (() => import("@powerhousedao/reactor-workflow"));

  let engine: WorkflowEngineModule;
  try {
    engine = await load();
  } catch (error) {
    throw new Error(
      "Workflows are enabled but @powerhousedao/reactor-workflow could not be loaded",
      { cause: error },
    );
  }

  // The same registry the host installs packages from, so a piece it indexes
  // is reachable without a second setting to keep in step.
  engine.setPieceRegistryUrl(deps.pieceRegistryUrl);

  // Before the runtime exists: a restored trigger asks for a piece as soon as
  // the supervisor starts, and the catalog is served from the same holder.
  if (deps.pieces) bindPackagePieces(engine.packagePieces, deps.pieces);

  const runtime = engine.createWorkflowRuntime({
    relationalDb: deps.relationalDb,
    reactorClient: deps.reactorClient,
    assertCanRead: readAssertion(deps.authorizationService, deps.reactorClient),
    assertCanWrite: writeAssertion(
      deps.authorizationService,
      deps.reactorClient,
    ),
    webhooks: deps.webhooks,
    attachments: deps.attachments,
    canReadAttachmentRef: attachmentRefCheck(deps),
    logger: deps.logger,
  });

  const triggers = await registerWorkflowTriggersReadModel(
    engine,
    runtime,
    deps.clientModule,
  );
  if (triggers.status === "available") {
    deps.logger.info(
      `Workflow trigger read model registered (${engine.WORKFLOW_TRIGGERS_READ_MODEL}, ${engine.WORKFLOW_TRIGGERS_READ_MODEL_STAGE})`,
    );
  } else {
    // Loudly: the runtime still serves GraphQL and still runs webhook and
    // schedule triggers, so nothing else says the document ones are dead.
    deps.logger.error(
      "Workflow document triggers are NOT armed (@reason): this reactor's " +
        "read-model coordinator takes no live registration, so no document " +
        "operation reaches the runtime. Webhook and schedule triggers are " +
        "unaffected.",
      triggers.reason,
    );
  }

  let stopped = false;

  return {
    subgraph: createWorkflowRuntimeSubgraph(runtime),
    triggers,

    async start() {
      // The endpoint family first: a restored webhook trigger asks for its URL
      // as soon as the supervisor starts.
      await runtime.registerWebhookEndpoint();
      runtime.startTriggerSupervisor();
    },

    stop() {
      if (stopped) return Promise.resolve();
      stopped = true;
      runtime.shutdown();
      return Promise.resolve();
    },
  };
}
