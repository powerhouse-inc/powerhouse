import {
  DocumentPurgeService,
  REACTOR_SCHEMA,
  type InProcessReactorClientModule,
  type ReactorBuilder,
} from "@powerhousedao/reactor";
import type {
  DocumentPermissionService,
  SubgraphArgs,
} from "@powerhousedao/reactor-api";
import {
  createPrivacySubgraph,
  PrivacyService,
  SubjectDocumentsReadModel,
} from "@powerhousedao/reactor-privacy";
import type { Kysely } from "kysely";

export const PH_PRIVACY_ENABLED = "PH_PRIVACY_ENABLED";
/** Keys the subject index; rotating it means rebuilding the index. */
export const PH_PRIVACY_SECRET = "PH_PRIVACY_SECRET";

export type PrivacyConfig =
  | { enabled: false }
  | { enabled: true; secret: string };

/** Off unless asked for; on without a secret is a misconfiguration, not a default. */
export function resolvePrivacyConfig(
  env: Record<string, string | undefined> = process.env,
): PrivacyConfig {
  const raw = env[PH_PRIVACY_ENABLED]?.trim().toLowerCase();
  if (raw !== "true" && raw !== "1") return { enabled: false };

  const secret = env[PH_PRIVACY_SECRET]?.trim();
  if (!secret) {
    throw new Error(
      `${PH_PRIVACY_ENABLED} is set but ${PH_PRIVACY_SECRET} is empty: the subject index needs a deployment secret`,
    );
  }
  return { enabled: true, secret };
}

/** The documents-by-subject index, built with the reactor so it backfills. */
export function registerSubjectDocumentsReadModel(
  reactorBuilder: ReactorBuilder,
  baseKysely: Kysely<unknown>,
  secret: string,
): void {
  reactorBuilder.withReadModelFactory(
    async ({
      operationIndex,
      writeCache,
      processorManagerConsistencyTracker,
    }) => {
      const readModel = new SubjectDocumentsReadModel(
        baseKysely,
        REACTOR_SCHEMA,
        operationIndex,
        writeCache,
        processorManagerConsistencyTracker,
        secret,
      );
      await readModel.init();
      return readModel;
    },
  );
}

export type PrivacySubgraphDeps = Pick<
  SubgraphArgs,
  | "reactorClient"
  | "graphqlManager"
  | "relationalDb"
  | "syncManager"
  | "authorizationService"
> & {
  clientModule: InProcessReactorClientModule | undefined;
  secret: string;
  documentPermissionService: DocumentPermissionService | undefined;
};

/** Undefined when the reactor graph is not in this process to purge. */
export function composePrivacySubgraph(deps: PrivacySubgraphDeps) {
  const reactorModule = deps.clientModule?.reactorModule;
  if (!reactorModule) return undefined;

  const service = new PrivacyService({
    db: reactorModule.database as unknown as Kysely<unknown>,
    purgeService: new DocumentPurgeService(reactorModule),
    secret: deps.secret,
    permissions: deps.documentPermissionService,
  });
  const PrivacySubgraph = createPrivacySubgraph(service);
  return new PrivacySubgraph({
    reactorClient: deps.reactorClient,
    http: deps.graphqlManager.scopeForPackage("@powerhousedao/reactor-privacy"),
    relationalDb: deps.relationalDb,
    analyticsStore: undefined as never,
    graphqlManager: deps.graphqlManager,
    syncManager: deps.syncManager,
    authorizationService: deps.authorizationService,
    path: deps.graphqlManager.getBasePath(),
  });
}
