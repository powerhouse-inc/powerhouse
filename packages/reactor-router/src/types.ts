import type { ReactorInfo } from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";

/** How the viewer reaches a reactor: facts about the handle, not the reactor. */
export type ReactorReach = {
  readonly hosting: "in-process" | "worker" | "remote";
  readonly inspection: "direct" | "rpc" | "none";
};

export type BackendFacts = {
  readonly reactor: ReactorInfo;
  readonly reach: ReactorReach;
  /**
   * False when the last facts read failed: {@link UNKNOWN_REACTOR_INFO} stands
   * in for a reactor read that failed, and `documentTypes` is absent after a
   * document-type read that failed.
   */
  readonly known: boolean;
  /**
   * The document types the backend can create. Absent: not declared, not read
   * yet, or the read failed; the router then does not constrain creates.
   */
  readonly documentTypes?: ReadonlySet<string>;
};

/** Stands in for a reactor whose facts could not be read; satisfies nothing. */
export const UNKNOWN_REACTOR_INFO: ReactorInfo = Object.freeze({
  storage: Object.freeze({
    engine: "unknown",
    persistence: "unknown",
    durable: false,
    selfHeal: false,
  }),
  workflows: false,
  syncChannels: Object.freeze([]) as readonly string[],
  access: Object.freeze({ admin: false, sql: false }),
});

/** What a collection needs of the reactor that holds it. */
export type CollectionRequirements = {
  readonly workflows: boolean;
  readonly durableStorage: boolean;
  /** Inspection reach other than `"none"`. */
  readonly inspectable: boolean;
  /** Every one of these channel types must be served. */
  readonly syncChannels: readonly string[];
};

/** What a caller states; everything unsaid is not required. */
export type CollectionRequirementsInput = Partial<CollectionRequirements>;

export const NO_REQUIREMENTS: CollectionRequirements = Object.freeze({
  workflows: false,
  durableStorage: false,
  inspectable: false,
  syncChannels: Object.freeze([]) as readonly string[],
});

export function collectionRequirements(
  input: CollectionRequirementsInput,
): CollectionRequirements {
  return Object.freeze({
    workflows: input.workflows ?? NO_REQUIREMENTS.workflows,
    durableStorage: input.durableStorage ?? NO_REQUIREMENTS.durableStorage,
    inspectable: input.inspectable ?? NO_REQUIREMENTS.inspectable,
    syncChannels: Object.freeze([...(input.syncChannels ?? [])]),
  });
}

/** Evidence behind a route, weakest (`placed`) to strongest (`corrected`). */
export type RouteSource = "override" | "placed" | "learned" | "corrected";

/** Which layer a placement comes from; a runtime placement wins over config. */
export type PlacementOrigin = "config" | "runtime";

export type RouterTableEntry = {
  /** The canonical `DriveCollectionId.key`. */
  readonly collectionId: string;
  readonly backend: string;
  readonly source: RouteSource;
  /** The layer of the placement for this key, when one is set. */
  readonly origin?: PlacementOrigin;
  /** The backend the config places this key on, when it places it. */
  readonly configured?: string;
};

/** What changed in the collection table; see `onRoutingChange`. */
export type RoutingChange = {
  /** The collection key, or the placement key as it was set. */
  readonly key: string;
  readonly reason: "placement" | "learned" | "corrected" | "forgotten";
};

export type RoutingChangeListener = (change: RoutingChange) => void;

/** A backend's own report of whether it can be reached; see `IRoutableBackend.health`. */
export type BackendHealth = "up" | "down";

export type RouterTableSnapshot = {
  /** Backend names in configuration order. */
  readonly backends: readonly string[];
  /** One row per backend that declares `health`, in configuration order. */
  readonly health: readonly { backend: string; health: BackendHealth }[];
  readonly collections: readonly RouterTableEntry[];
  readonly documents: readonly { identifier: string; backend: string }[];
  readonly jobs: readonly { jobId: string; backend: string }[];
};

/** Where the router reports what it handled instead of throwing. */
export type RouterDiagnostic = (message: string, detail?: unknown) => void;

export const warnDiagnostic: RouterDiagnostic = (message, detail) => {
  console.warn(`[reactor-router] ${message}`, detail);
};

export const DEFAULT_MISROUTE_ATTEMPTS = 3;
export const DEFAULT_DOCUMENT_CACHE_SIZE = 10_000;
export const DEFAULT_JOB_CACHE_SIZE = 2_000;
export const DEFAULT_SUBSCRIPTION_DEDUP_SIZE = 2_048;
export const DEFAULT_BRANCH = "main";
export const DEFAULT_PROBE_TIMEOUT_MS = 3_000;
export const DEFAULT_PROVISIONAL_ROUTE_MS = 30_000;

/** Map keys are a collection id or a bare drive id (every branch). */
export type RoutingOptions = {
  /**
   * Placements from config: collection or drive id -> backend name. Advisory:
   * a refusal corrects them. `setPlacement` layers runtime placements above.
   */
  readonly collections?: Readonly<Record<string, string>>;
  readonly requirements?: Readonly<Record<string, CollectionRequirementsInput>>;
  readonly defaultRequirements?: CollectionRequirementsInput;
  /** Seeds the document -> backend cache. */
  readonly documents?: Readonly<Record<string, string>>;
  /** Answers what no collection owns. Defaults to the first backend. */
  readonly primaryBackend?: string;
  /**
   * Where a new collection goes when nothing places it: a create with no
   * placement or route lands here while it is eligible and not excluded,
   * and parentless create defaults are asked of it. Absent, new collections
   * hash over the eligible backends and the primary answers create defaults.
   */
  readonly defaultBackend?: string;
  readonly misrouteAttempts?: number;
  /**
   * Bound on one ownership probe; a probe that does not answer in time
   * answers "unknown". Defaults to {@link DEFAULT_PROBE_TIMEOUT_MS}; `0` or
   * `Infinity` waits for the answer.
   */
  readonly probeTimeoutMs?: number;
  /**
   * How long a provisional route stands before it is probed again: one found
   * on a backend while an earlier backend in the order did not hold the
   * document. Defaults to {@link DEFAULT_PROVISIONAL_ROUTE_MS}. Corrected
   * routes and placements never expire.
   */
  readonly provisionalRouteMs?: number;
  readonly documentCacheSize?: number;
  readonly jobCacheSize?: number;
  readonly subscriptionDedupSize?: number;
  /** Defaults to `console.warn`. */
  readonly onDiagnostic?: RouterDiagnostic;
  /**
   * Answers an id check (`isDocumentIdTaken`) that failed because a backend
   * could not answer: given the id and the failure, the answer to give, or
   * `undefined` to throw the failure. Absent, every such failure is thrown.
   */
  readonly answerFailedIdCheck?: (
    documentId: string,
    error: unknown,
  ) => boolean | undefined;
  /** Signs the actions the router builds itself. Defaults to no signature. */
  readonly signer?: ISigner;
  /** The module registry, or a getter read on each lookup; absent, the primary backend's is used. */
  readonly documentModelModules?:
    | readonly DocumentModelModule[]
    | (() => readonly DocumentModelModule[]);
};
