// Switchboard composes the workflow runtime from what it holds (the reactor
// module) and what startAPI hands back. The intake is a read model.
import {
  REACTOR_SCHEMA,
  supportsLiveReadModelRegistration,
  type AttachmentRef,
  type DocumentViewDatabase,
  type InProcessReactorClientModule,
  type IReactorClient,
  type IRelationalDb,
  type ModelManifestEntry,
  type ReactorBuilder,
} from "@powerhousedao/reactor";
import {
  AuthorizationPolicy,
  ForbiddenError,
  callerSubject,
  createCanonicalDocumentIdResolver,
  type CanonicalDocumentId,
  type Context,
  type IAttachmentAccessService,
  type IAuthorizationService,
  type IPackagePieceSource,
  type PackagePieceEntry,
  type SubgraphClass,
} from "@powerhousedao/reactor-api";
import { parseRef } from "@powerhousedao/reactor-attachments";
import type * as WorkflowEngine from "@powerhousedao/reactor-workflow";
import type {
  AttachmentClientLike,
  AttachmentReadRequest,
  HostIdentity,
  WorkflowCaller,
  WorkflowRuntimeHostDeps,
} from "@powerhousedao/reactor-workflow";
import type {
  IHttpScope,
  IWebhookScope,
  ScopedRouteHandle,
} from "@powerhousedao/shared/processors";
import type { Principal } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { Kysely } from "kysely";
import {
  callbackUrlOf,
  registerOAuthCallback,
} from "./workflow/oauth-callback.js";
import type {
  ReactorAccessInfo,
  ReactorIdentity,
} from "./workflow/resolvers.js";
import { createWorkflowRuntimeSubgraph } from "./workflow/subgraph.js";

type WorkflowEngineModule = typeof WorkflowEngine;

/** The npm name the workflow package owns: its HTTP namespace and its models. */
export const WORKFLOW_PACKAGE_NAME = "@powerhousedao/workflow";
export const WORKFLOW_TELEMETRY_SCOPE = "@powerhousedao/reactor-workflow";

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

/** The importable models piece workers load: the boot list, and a type's entries. */
export interface ModelManifestSource {
  modelManifest(): ModelManifestEntry[];
  modelEntries(documentType: string): ModelManifestEntry[];
}

export function modelManifestSource(
  builder: Pick<
    ReactorBuilder,
    "getResolvedModelManifest" | "getImportableEntries"
  >,
): ModelManifestSource {
  return {
    modelManifest: () => builder.getResolvedModelManifest() ?? [],
    modelEntries: (documentType) => builder.getImportableEntries(documentType),
  };
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
  /** False when relationalDb outlives the working directory, so the secret
   * store needs PH_WORKFLOWS_SECRETS_MASTER_KEY rather than a generated key. */
  secretsKeyFile?: false;
  attachments: AttachmentClientLike;
  /** Decides a step's attachment reads like the attachment routes do;
   * absent, a step reads none but the files its own run wrote. */
  attachmentAccess?: IAttachmentAccessService;
  webhooks?: IWebhookScope;
  /** The workflow package's HTTP namespace; the OAuth2 callback lives on it.
   * Absent leaves OAuth2 connections unable to sign in. */
  http?: IHttpScope;
  authorizationService: IAuthorizationService;
  /** Where the pieces installed packages ship come from; absent leaves the
   * runtime with none and only published bundles resolvable. */
  pieces?: IPackagePieceSource;
  logger: ILogger;
  /** Absent leaves pieces with no document models in their worker. */
  models?: ModelManifestSource;
  /** Where run, step, worker and reactor-call spans and metrics go. */
  telemetry?: WorkflowEngine.WorkflowRuntimeHostDeps["telemetry"];
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

// The engine's own access check, answered as BaseSubgraph answers it: the
// host ACL (an admin passes, another policy fails closed, an unresolvable
// identifier is a denial), then the reactor's read gate as the caller.
function readAssertion(
  authorizationService: IAuthorizationService,
  reactorClient: IReactorClient,
): WorkflowRuntimeHostDeps["assertCanRead"] {
  const resolveCanonical = createCanonicalDocumentIdResolver(reactorClient);
  const hostCanRead = async (identifier: string, ctx: Context) => {
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
  return async (identifier: string, caller: WorkflowCaller) => {
    const ctx = caller as Context;
    await hostCanRead(identifier, ctx);
    let served: boolean;
    try {
      served = await reactorClient.isServed(identifier, {
        subject: callerSubject(ctx.user),
      });
    } catch {
      throw new ForbiddenError();
    }
    if (!served) throw new ForbiddenError("to read this document");
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

/** What the reactor enforces and who it signs as; unknown counts as enforced. */
export function reactorAccessOf(
  clientModule: InProcessReactorClientModule | undefined,
): ReactorAccessInfo {
  const flags = clientModule?.reactorModule?.featureFlags;
  const signer = clientModule?.signer;
  const key = signer?.app?.key;
  const identity: ReactorIdentity | null = key
    ? { address: signer.user?.address ?? null, key }
    : null;
  return {
    authEnforcement: flags ? flags.authEnforcement : true,
    authConditions: flags?.authConditions === true,
    identity,
  };
}

/** Whom a run's created documents also grant: the host, as §8 grants it. */
export function hostPrincipalOf(
  access: ReactorAccessInfo,
): Principal | undefined {
  const identity = access.identity;
  if (!identity) return undefined;
  if (access.authConditions) {
    return { match: { eq: [{ attr: "subject.key" }, { lit: identity.key }] } };
  }
  return identity.address ? { address: identity.address } : undefined;
}

/** Who the host signs as, so a publish it signs makes no run user. */
export function hostIdentityOf(
  access: ReactorAccessInfo,
): HostIdentity | undefined {
  const identity = access.identity;
  if (!identity) return undefined;
  return identity.address
    ? { address: identity.address, key: identity.key }
    : { key: identity.key };
}

const REFERENCE_INDEX_RETRIES = 8;
const REFERENCE_INDEX_RETRY_MS = 250;

/** A step reads an attachment the way the download route serves one: when the
 * run's user may read a document that references it. The candidates are the
 * documents the run was handed; the reference index can trail the operation
 * that fired the trigger, so a denial is retried briefly. */
export function attachmentReadPolicy(
  access: IAttachmentAccessService | undefined,
  retryMs = REFERENCE_INDEX_RETRY_MS,
): (request: AttachmentReadRequest) => Promise<boolean> {
  return async (request) => {
    try {
      if (parseRef(request.ref as AttachmentRef).version !== 1) return false;
    } catch {
      return false;
    }
    if (!access || request.documentIds.length === 0) return false;
    const subject = request.runUser?.subject;
    const caller = {
      ...(subject?.address ? { userAddress: subject.address } : {}),
      ...(subject?.key ? { appKey: subject.key } : {}),
    };
    for (let attempt = 0; attempt <= REFERENCE_INDEX_RETRIES; attempt++) {
      for (const documentId of request.documentIds) {
        const result = await access.canReadAttachment({
          documentId,
          attachmentRef: request.ref,
          ...caller,
        });
        if (result.kind === "allowed") return true;
      }
      if (attempt < REFERENCE_INDEX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, retryMs));
      }
    }
    return false;
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
  // Sorted by package name, so which package keeps a contested piece is stable.
  const apply = (byPackage: Map<string, PackagePieceEntry[]>) => {
    registry.setPieces(
      [...byPackage.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .flatMap(([, pieces]) => pieces),
    );
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

  const access = reactorAccessOf(deps.clientModule);
  const models = deps.models;
  const runtime = engine.createWorkflowRuntime({
    relationalDb: deps.relationalDb,
    secretsKeyFile: deps.secretsKeyFile,
    reactorClient: deps.reactorClient,
    assertCanRead: readAssertion(deps.authorizationService, deps.reactorClient),
    subjectOf: (caller) => callerSubject((caller as Context).user),
    assertCanWrite: writeAssertion(
      deps.authorizationService,
      deps.reactorClient,
    ),
    // Unknown flags leave it absent, which the engine takes as on.
    ...(deps.clientModule?.reactorModule
      ? { authEnforcement: access.authEnforcement }
      : {}),
    hostPrincipal: hostPrincipalOf(access),
    hostIdentity: hostIdentityOf(access),
    ...(models
      ? {
          modelManifest: () => models.modelManifest(),
          modelEntries: (documentType: string) =>
            models.modelEntries(documentType),
        }
      : {}),
    webhooks: deps.webhooks,
    attachments: deps.attachments,
    canReadAttachmentRef: attachmentReadPolicy(deps.attachmentAccess),
    logger: deps.logger,
    ...(deps.telemetry ? { telemetry: deps.telemetry } : {}),
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
  const oauthCallback: ScopedRouteHandle | undefined = deps.http
    ? registerOAuthCallback(deps.http, runtime)
    : undefined;

  return {
    subgraph: createWorkflowRuntimeSubgraph(
      runtime,
      deps.http ? { callbackUrl: callbackUrlOf(deps.http) } : undefined,
      access,
    ),
    triggers,

    async start() {
      // The endpoint family first: a restored webhook trigger asks for its URL
      // as soon as the supervisor starts.
      await runtime.registerWebhookEndpoint();
      runtime.startTriggerSupervisor();
      // So the first search in the editor finds the catalog indexed.
      runtime.warmPieceSearch();
    },

    stop() {
      if (stopped) return Promise.resolve();
      stopped = true;
      oauthCallback?.dispose();
      runtime.shutdown();
      return Promise.resolve();
    },
  };
}
