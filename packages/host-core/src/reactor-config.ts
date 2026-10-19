/**
 * The shared `reactor` host-config block and its projections onto today's
 * Switchboard env / Connect runtime config. Phase 2 of uniform-runners: makes
 * the reactor block live through the bridge runners, BEFORE track R replaces
 * the projection with reactor-monitor's provision(). The headline is
 * single-sourced `reactor.protocol` — both projections read the same block, so
 * client and server cannot diverge, and a contradicting pre-set env fails boot.
 */

export type ReactorBackendKind = "in-process" | "worker" | "remote";

export interface ReactorStorageConfig {
  kind: "idb" | "memory" | "path" | "postgres";
  dataDir?: string;
  url?: string;
}

export interface ReactorPackageConfig {
  cdnUrl?: string;
  specs?: string[];
  /** on-demand model resolution (was DYNAMIC_MODEL_LOADING). */
  dynamic?: boolean;
}

export interface ReactorRemoteConfig {
  host?: string;
  url?: string;
}

export interface ReactorBackend {
  kind?: ReactorBackendKind;
  storage?: ReactorStorageConfig;
  readModel?: { url?: string };
  packages?: ReactorPackageConfig;
  remote?: ReactorRemoteConfig;
}

/** Replay/admission rules every sync peer must share. */
export interface ReactorProtocol {
  featureFlags?: {
    documentDecisions?: boolean;
    authEnforcement?: boolean;
    authGroups?: boolean;
    authConditions?: boolean;
    undoV3?: boolean;
  };
  createSignaturePolicy?: "legacy" | "v2-required";
  unsupportedStoredDocuments?: "refuse" | "read-only";
}

export interface ReactorConfig {
  backends?: Record<string, ReactorBackend>;
  placement?: {
    primary?: string;
    default?: Record<string, unknown>;
  };
  workflows?: boolean;
  protocol?: ReactorProtocol;
}

/** The single primary backend for phase-2 projection (multi-backend routing is
 * track R). Prefers placement.primary, else "main"/"local", else the first. */
export function primaryBackend(
  reactor: ReactorConfig | undefined,
): ReactorBackend | undefined {
  const backends = reactor?.backends;
  if (!backends) return undefined;
  const names = Object.keys(backends);
  if (names.length === 0) return undefined;
  const pick =
    reactor.placement?.primary ??
    (names.includes("main")
      ? "main"
      : names.includes("local")
        ? "local"
        : names[0]);
  return backends[pick];
}

const FLAG_ENV: Record<
  keyof NonNullable<ReactorProtocol["featureFlags"]>,
  string
> = {
  documentDecisions: "REACTOR_DOCUMENT_DECISIONS",
  authEnforcement: "REACTOR_AUTH_ENFORCEMENT",
  authGroups: "REACTOR_AUTH_GROUPS",
  authConditions: "REACTOR_AUTH_CONDITIONS",
  undoV3: "REACTOR_UNDO_V3",
};

/** The env vars a protocol block maps onto, with their string values. Only
 * keys the block actually sets appear. */
export function protocolEnv(
  protocol: ReactorProtocol | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (!protocol) return env;
  for (const [key, varName] of Object.entries(FLAG_ENV)) {
    const value = protocol.featureFlags?.[key as keyof typeof FLAG_ENV];
    if (value !== undefined) env[varName] = value ? "true" : "false";
  }
  if (protocol.createSignaturePolicy !== undefined) {
    env.CREATE_SIGNATURE_POLICY = protocol.createSignaturePolicy;
  }
  if (protocol.unsupportedStoredDocuments !== undefined) {
    env.REACTOR_UNSUPPORTED_STORED_DOCUMENTS =
      protocol.unsupportedStoredDocuments;
  }
  return env;
}

export interface SwitchboardReactorProjection {
  /** Env the switchboard server reads at boot. Only keys the block sets. */
  env: Record<string, string>;
  /** Options passed to startSwitchboard (DB path). */
  options: { dbPath?: string };
}

/** Project the reactor block onto the switchboard's env + options. */
export function projectReactorToSwitchboard(
  reactor: ReactorConfig | undefined,
): SwitchboardReactorProjection {
  const env = protocolEnv(reactor?.protocol);
  const backend = primaryBackend(reactor);
  const options: { dbPath?: string } = {};

  if (backend?.storage) {
    const s = backend.storage;
    const dbUrl = s.kind === "postgres" ? s.url : s.dataDir;
    if (dbUrl) env.PH_REACTOR_DATABASE_URL = dbUrl;
  }
  if (backend?.readModel?.url) options.dbPath = backend.readModel.url;
  if (backend?.packages?.dynamic) env.DYNAMIC_MODEL_LOADING = "true";
  if (reactor?.workflows !== undefined) {
    env.PH_WORKFLOWS_ENABLED = reactor.workflows ? "1" : "0";
  }
  return { env, options };
}

/** The four reactor-client shapes a Connect host can select (mirrors the
 * shared PHReactorClientMode; kept local to avoid an import cycle). */
export type ReactorClientMode = "in-process" | "worker" | "remote" | "router";

const LOCAL_BACKEND_KINDS = new Set<ReactorBackendKind | undefined>([
  "in-process",
  "worker",
  undefined,
]);

/**
 * Which reactor client the backend topology asks for:
 *  - local (in-process/worker) AND remote backends -> `router`
 *  - remote backend(s) only                        -> `remote`
 *  - a worker backend                              -> `worker`
 *  - anything else local                           -> `in-process`
 * `undefined` when no backends are declared — the caller then keeps the
 * legacy reactorWorker/multiReactor behaviour untouched.
 */
export function reactorClientMode(
  reactor: ReactorConfig | undefined,
): ReactorClientMode | undefined {
  const backends = reactor?.backends;
  if (!backends) return undefined;
  const kinds = Object.values(backends).map((b) => b.kind);
  if (kinds.length === 0) return undefined;
  const hasLocal = kinds.some((k) => LOCAL_BACKEND_KINDS.has(k));
  const hasRemote = kinds.some((k) => k === "remote");
  if (hasLocal && hasRemote) return "router";
  if (hasRemote) return "remote";
  return primaryBackend(reactor)?.kind === "worker" ? "worker" : "in-process";
}

export interface ConnectReactorProjection {
  /** Patch merged into the connect runtime config (connect.*). */
  connect: {
    reactor?: ReactorProtocol;
    instance?: { reactorWorker?: boolean; reactorClient?: ReactorClientMode };
    app?: { workflowsEnabled?: boolean };
  };
}

/** Project the reactor block onto the Connect runtime config: protocol →
 * connect.reactor (same shape), backend topology → instance.reactorWorker
 * (legacy) + instance.reactorClient (the explicit 4-way selector),
 * workflows → app.workflowsEnabled. */
export function projectReactorToConnect(
  reactor: ReactorConfig | undefined,
): ConnectReactorProjection {
  const connect: ConnectReactorProjection["connect"] = {};
  if (reactor?.protocol) connect.reactor = reactor.protocol;
  const backend = primaryBackend(reactor);
  const mode = reactorClientMode(reactor);
  if (backend?.kind !== undefined || mode !== undefined) {
    connect.instance = {
      ...(backend?.kind !== undefined
        ? { reactorWorker: backend.kind === "worker" }
        : {}),
      ...(mode !== undefined ? { reactorClient: mode } : {}),
    };
  }
  if (reactor?.workflows !== undefined) {
    connect.app = { workflowsEnabled: reactor.workflows };
  }
  return { connect };
}

/**
 * The enforcement teeth of single-sourcing: if a pre-set env var CONTRADICTS
 * the host's protocol block, fail loudly naming the var, the host value, and
 * the env value. An env var that merely matches, or is unset, is fine (phase-2
 * transition keeps an operator's explicit env as an escape hatch unless it
 * disagrees with the protocol — see the WBS precedence note).
 */
export function assertProtocolConsistency(
  protocol: ReactorProtocol | undefined,
  env: Record<string, string | undefined>,
  hostFile = "the host file",
): void {
  if (!protocol) return;
  const expected = protocolEnv(protocol);
  for (const [varName, hostValue] of Object.entries(expected)) {
    const envValue = env[varName];
    if (envValue === undefined) continue;
    // The switchboard reads undoV3 as on unless the value is exactly "false".
    const agrees =
      varName === FLAG_ENV.undoV3
        ? (envValue !== "false") === (hostValue === "true")
        : envValue === hostValue;
    if (!agrees) {
      throw new Error(
        `reactor.protocol conflict: ${varName} is "${envValue}" in the environment ` +
          `but "${hostValue}" in ${hostFile}. These are fleet-consensus settings — ` +
          `a mismatch would diverge replay. Remove the env override or align the host.`,
      );
    }
  }
}
