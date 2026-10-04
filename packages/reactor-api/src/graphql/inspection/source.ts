import {
  channelFactoryTypes,
  createReactorInspector,
  queryThroughDialect,
  type IInspector,
  type InProcessReactorModule,
  type InspectableSyncManager,
  type IReactorDbQuery,
  type WireReactorInspectionInfo,
} from "@powerhousedao/reactor";

/**
 * What a reactor reports about itself over the inspection surface: the facts a
 * caller on the far side of HTTP cannot derive, plus which inspection tiers
 * this deployment has opted into.
 *
 * The shared wire type, not a server-side transcription of it: the remote
 * client decodes exactly this record (`@powerhousedao/reactor`,
 * `src/inspector/wire.ts`), so the one contract has one definition.
 *
 * `hosting`/`inspection` are fixed strings rather than computed: anything
 * reading this is remote by construction, and it reaches the reactor over this
 * surface. They are reported anyway so a client's capability row is a read of
 * the server's own answer rather than an assumption about the endpoint it
 * happens to be talking to.
 */
export type ReactorInspectionInfo = WireReactorInspectionInfo;

/**
 * The reactor the inspection subgraph serves, and the tiers it may serve.
 *
 * SECURITY POSTURE -- three tiers, enforced in `resolvers.ts`, and each one is
 * a separate decision:
 *
 * 1. READS (`Query.inspection.*`) need no host opt-in, but they are NOT
 *    harmless and are not public: queue jobs and dead-letter records carry
 *    operation payloads, i.e. document content. Every read is therefore gated
 *    on the host's policy-wide reader check (`IAuthorizationService.
 *    isSupremeAdmin`) -- everyone under OPEN, which is what an unauthenticated
 *    dev Switchboard already is for every other read, and the ADMINS list
 *    under ADMIN_ONLY and DOCUMENT_PERMISSIONS.
 * 2. MUTATIONS (pause/resume, retryProcessor, sweep, the integrity rebuilds
 *    and every sync repair lever) need {@link adminEnabled} -- an explicit host
 *    opt-in, default OFF -- *and* the same admin check. A refusal names the
 *    flag, so an operator can tell "not allowed here" from "not turned on".
 * 3. RAW SQL (`inspectionQueryDb`) needs {@link sqlEnabled} on top of
 *    {@link adminEnabled}. It is the only field in the schema that is
 *    unconstrained read/write access to the reactor's store, so it does not
 *    ride along on the admin opt-in: a host that wants operator repair levers
 *    has not thereby asked to expose its database.
 *
 * Both flags are read once at construction, from the host's option or the
 * environment, so a deployment's posture cannot change under a REQUEST. It can
 * change under a long-lived CLIENT, which is the documented operator flow:
 * restart the host with `PH_INSPECTION_ADMIN=true` and the same levers go live.
 * A client therefore re-reads `info()` rather than treating the tiers it saw
 * once as fixed for the life of its handle.
 */
export interface IReactorInspectionSource {
  /** The reactor's typed inspection surface (`IInspector`, W0.3). */
  readonly inspector: IInspector;
  /**
   * The reactor's sync manager, which is also its `ISyncInspector` (W0.5) and
   * the holder of `listHolds`/`list`.
   */
  readonly syncManager: InspectableSyncManager;
  /** Raw SQL against the reactor's store; served only under tier 3. */
  readonly dbQuery: IReactorDbQuery;
  /** Tier 2: the mutating ops are served at all. */
  readonly adminEnabled: boolean;
  /** Tier 3: raw SQL is served at all. */
  readonly sqlEnabled: boolean;
  /** The facts this reactor reports about itself; see {@link ReactorInspectionInfo}. */
  info(): ReactorInspectionInfo;
  /**
   * Records whether the workflow engine is composed on this host.
   *
   * The engine is composed by the host AFTER the API boots (plan agreed
   * decision 3: Node-only and a singleton), so the API cannot observe it and
   * has to be told — and until W3.3 nothing told it, so a vetra Switchboard
   * whose runtime had booted reported `workflows: false`. The host calls this
   * once `composeWorkflowRuntime` has returned, and `info()` reads the current
   * value rather than one frozen at construction.
   *
   * Only this fact is late-bound. The security tiers deliberately are not: a
   * deployment's posture must not change under a request.
   */
  setWorkflowsComposed(composed: boolean): void;
}

/** Host-side configuration of the inspection surface; both tiers default off. */
export type ReactorInspectionOptions = {
  /**
   * Serve the mutating inspection ops. Defaults to whether
   * `PH_INSPECTION_ADMIN` reads as an opt-in; see {@link ENV_OPT_IN_SPELLINGS}.
   */
  admin?: boolean;
  /**
   * Serve raw SQL against the reactor store. Defaults to whether
   * `PH_INSPECTION_SQL` reads as an opt-in ({@link ENV_OPT_IN_SPELLINGS}), and
   * is ignored unless {@link admin} is on as well.
   */
  sql?: boolean;
  /**
   * Whether the workflow engine is composed into this host, as far as the host
   * knows AT BOOT. Defaults to false, i.e. "this reactor does not run
   * workflows", which is the right answer for every host that has not said
   * otherwise — and the honest one before the engine has been composed.
   *
   * A host that composes the engine after the API boots (which is every host
   * that composes it at all) calls
   * {@link IReactorInspectionSource.setWorkflowsComposed} instead, once the
   * runtime is actually there.
   */
  workflows?: boolean;
};

/**
 * The spellings of an explicit opt-in, compared case-insensitively after
 * trimming.
 *
 * Wider than the original `"true" | "1"` because the thing on the other end of
 * these variables is a deployment's env file, a Docker `-e`, a Helm value or a
 * shell export, and every one of those has shipped `TRUE`, `True`, `yes`,
 * `on` or a trailing space at some point. A posture that silently stays OFF
 * because an operator wrote `PH_INSPECTION_ADMIN=TRUE` is the worst of both
 * worlds: the flag is set, the levers are refused, and the refusal says to set
 * the flag. Refusals name these spellings for the same reason.
 *
 * Still an explicit allow-list, not general truthiness: anything unrecognised
 * (`maybe`, `0`, `false`, empty) leaves the tier off, so the default-off
 * posture can only be lifted by something that reads as a yes.
 */
export const ENV_OPT_IN_SPELLINGS: readonly string[] = [
  "true",
  "1",
  "yes",
  "on",
];

/** Whether an environment variable reads as an explicit opt-in. */
function envEnabled(value: string | undefined): boolean {
  return ENV_OPT_IN_SPELLINGS.includes((value ?? "").trim().toLowerCase());
}

/**
 * The reactor module's own store class, as an informational string. Derived
 * from whether the builder registered instrumented `pg` pools: a Postgres
 * deployment has at least one, a PGlite one has none.
 *
 * Informational only. A caller's capability contract records a remote
 * reactor's store as `remote` -- not this process's to open, close or heal --
 * and this string tells an operator which kind of store is on the far side
 * without pretending the caller can do anything about it.
 */
function storageKindOf(module: InProcessReactorModule): string {
  return module.pools.length > 0 ? "postgres" : "pglite";
}

/**
 * Builds the inspection source over a reactor module composed in this process.
 *
 * The inspector itself comes from `@powerhousedao/reactor`'s
 * `createReactorInspector`, which is the same wiring the browser monitor's
 * in-process and worker reactors are inspected through -- the point of W3.2 is
 * that a remote reactor answers the SAME surface, so it must not be a second
 * assembly of it.
 *
 * No storage-health provider is passed: the self-heal tracker that feeds that
 * dimension belongs to a host that opened a recreatable PGlite session
 * (W0.7/W0.8), which a server reactor over Postgres has no analog of. The
 * inspector then reports the healthy, never-recreated default, so one client
 * reads every hosting kind the same way.
 */
export function createReactorInspectionSource(
  module: InProcessReactorModule,
  syncManager: InspectableSyncManager,
  options: ReactorInspectionOptions = {},
): IReactorInspectionSource {
  const adminEnabled =
    options.admin ?? envEnabled(process.env.PH_INSPECTION_ADMIN);
  const sqlEnabled =
    adminEnabled && (options.sql ?? envEnabled(process.env.PH_INSPECTION_SQL));
  // The one late-bound fact: the host composes the workflow engine after this
  // boots and tells us (setWorkflowsComposed).
  let workflows = options.workflows ?? false;
  const storageKind = storageKindOf(module);
  const syncChannels: readonly string[] = Object.freeze(
    module.syncModule
      ? [...channelFactoryTypes(module.syncModule.channelFactory)]
      : [],
  );
  const inspector = createReactorInspector(module);
  const dbQuery: IReactorDbQuery = {
    queryDb: (sql, params) => queryThroughDialect(module.database, sql, params),
  };

  // Built per call rather than frozen once: `workflows` is a fact about this
  // host that becomes true after the API has booted, and a frozen record is
  // what made the server report `workflows: false` on a Switchboard whose
  // runtime had started (W3.2 live finding).
  const info = (): ReactorInspectionInfo =>
    Object.freeze({
      hosting: "remote",
      inspection: "rpc",
      storageKind,
      // A server reactor registers its own factories in its own realm; nothing
      // has to survive a postMessage for it to host one.
      processors: true,
      workflows,
      syncChannels,
      adminEnabled,
      sqlEnabled,
    } as const);

  return {
    inspector,
    syncManager,
    dbQuery,
    adminEnabled,
    sqlEnabled,
    info,
    setWorkflowsComposed(composed: boolean) {
      workflows = composed;
    },
  };
}
