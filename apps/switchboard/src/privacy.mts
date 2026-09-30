import type {
  InProcessReactorModule,
  IReactorClient,
} from "@powerhousedao/reactor";
import {
  AuthorizationPolicy,
  PrivacyPermissionAdapter,
  type DocumentPermissionService,
  type GraphQLManager,
  type IAuthorizationService,
} from "@powerhousedao/reactor-api";
import {
  createModuleErasure,
  createPrivacySubgraph,
  DisclosureService,
  MIN_DEPLOYMENT_SECRET_BYTES,
  registerSubjectDocumentsReadModel,
  type ErasureScheduler,
  type IErasureService,
} from "@powerhousedao/reactor-privacy";
import type { ISigner } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PrivacyOptions = {
  /** Wins over PH_PRIVACY_ENABLED. */
  enabled?: boolean;
  /** Wins over PH_PRIVACY_DEPLOYMENT_SECRET. */
  deploymentSecret?: string;
  /** The reactor's signer, for a caller-provided reactor. */
  signer?: ISigner;
};

export type ResolvedPrivacy =
  | { enabled: false }
  | {
      enabled: true;
      deploymentSecret: string;
      intervalMs?: number;
      deadlineMs?: number;
      markerGraceMs?: number;
      purgeTimeoutMs?: number;
    };

/** Enabling privacy on a switchboard that cannot run it safely. */
export class PrivacyBootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyBootError";
  }
}

function positive(
  env: NodeJS.ProcessEnv,
  name: string,
  unitMs: number,
): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new PrivacyBootError(
      `${name} must be a positive number, got "${raw}"`,
    );
  }
  return value * unitMs;
}

export function resolvePrivacy(
  options: PrivacyOptions | undefined,
  env: NodeJS.ProcessEnv,
): ResolvedPrivacy {
  const enabled = options?.enabled ?? env.PH_PRIVACY_ENABLED === "true";
  if (!enabled) return { enabled: false };
  const deploymentSecret =
    options?.deploymentSecret ?? env.PH_PRIVACY_DEPLOYMENT_SECRET;
  if (
    !deploymentSecret ||
    Buffer.byteLength(deploymentSecret, "utf8") < MIN_DEPLOYMENT_SECRET_BYTES
  ) {
    throw new PrivacyBootError(
      `PH_PRIVACY_ENABLED needs PH_PRIVACY_DEPLOYMENT_SECRET of at least ${MIN_DEPLOYMENT_SECRET_BYTES} bytes`,
    );
  }
  return {
    enabled: true,
    deploymentSecret,
    intervalMs: positive(env, "PH_PRIVACY_INTERVAL_MS", 1),
    deadlineMs: positive(env, "PH_PRIVACY_DEADLINE_DAYS", DAY_MS),
    markerGraceMs: positive(env, "PH_PRIVACY_MARKER_GRACE_DAYS", DAY_MS),
    purgeTimeoutMs: positive(env, "PH_PRIVACY_PURGE_TIMEOUT_MINUTES", 60_000),
  };
}

export type RunningPrivacy = {
  erasure: IErasureService;
  scheduler: ErasureScheduler;
  stop(): Promise<void>;
};

/** Subject index, erasure scheduler and admin subgraph on a built reactor. */
export async function startPrivacy(deps: {
  config: Extract<ResolvedPrivacy, { enabled: true }>;
  reactorModule: InProcessReactorModule | undefined;
  signer: ISigner | undefined;
  authorizationService: IAuthorizationService;
  documentPermissionService: DocumentPermissionService | undefined;
  graphqlManager: GraphQLManager;
  reactorClient: IReactorClient;
  logger: ILogger;
}): Promise<RunningPrivacy> {
  const { config, reactorModule, authorizationService } = deps;
  if (authorizationService.config.policy === AuthorizationPolicy.OPEN) {
    throw new PrivacyBootError(
      "PH_PRIVACY_ENABLED is refused under the OPEN authorization policy: every caller, anonymous included, would administer erasure. Enable authentication (AUTH_ENABLED=true with ADMINS) first.",
    );
  }
  if (!reactorModule) {
    throw new PrivacyBootError(
      "PH_PRIVACY_ENABLED needs an in-process reactor module",
    );
  }
  if (!deps.signer?.app?.key) {
    throw new PrivacyBootError(
      "PH_PRIVACY_ENABLED needs a reactor signer (a Renown identity): every receiver refuses an unsigned purge marker",
    );
  }

  const permissions = deps.documentPermissionService
    ? new PrivacyPermissionAdapter(deps.documentPermissionService)
    : undefined;
  const { service, scheduler } = createModuleErasure(reactorModule, {
    deploymentSecret: config.deploymentSecret,
    signer: deps.signer,
    permissions,
    intervalMs: config.intervalMs,
    deadlineMs: config.deadlineMs,
    markerGraceMs: config.markerGraceMs,
    purgeTimeoutMs: config.purgeTimeoutMs,
    logger: deps.logger,
  });

  const disclosure = new DisclosureService(
    reactorModule.database,
    config.deploymentSecret,
    permissions,
  );
  let subgraph;
  try {
    subgraph = createPrivacySubgraph({
      authorizationService,
      erasure: service,
      disclosure,
    });
  } catch (error) {
    throw new PrivacyBootError(
      error instanceof Error ? error.message : String(error),
    );
  }

  await registerSubjectDocumentsReadModel(reactorModule, {
    deploymentSecret: config.deploymentSecret,
  });
  await deps.graphqlManager.registerSubgraphInstance(
    {
      ...subgraph,
      path: deps.graphqlManager.getBasePath(),
      reactorClient: deps.reactorClient,
      relationalDb: undefined as never,
    },
    "graphql",
    false,
  );

  scheduler.start();
  deps.logger.info("Privacy add-on started: subject index, erasure scheduler");
  return {
    erasure: service,
    scheduler,
    stop: () => scheduler.stop(),
  };
}
