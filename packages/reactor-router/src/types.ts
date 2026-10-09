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
  /** False when the facts read failed and {@link UNKNOWN_REACTOR_INFO} stands in. */
  readonly known: boolean;
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

export type RouterTableEntry = {
  /** The canonical `DriveCollectionId.key`. */
  readonly collectionId: string;
  readonly backend: string;
  readonly source: RouteSource;
};

export type RouterTableSnapshot = {
  /** Backend names in configuration order. */
  readonly backends: readonly string[];
  readonly collections: readonly RouterTableEntry[];
  readonly documents: readonly { identifier: string; backend: string }[];
  readonly jobs: readonly { jobId: string; backend: string }[];
};

/** Where the router reports what it handled instead of throwing. */
export type RouterDiagnostic = (message: string, detail?: unknown) => void;

export const DEFAULT_MISROUTE_ATTEMPTS = 3;
export const DEFAULT_DOCUMENT_CACHE_SIZE = 10_000;
export const DEFAULT_JOB_CACHE_SIZE = 2_000;
export const DEFAULT_SUBSCRIPTION_DEDUP_SIZE = 2_048;
export const DEFAULT_BRANCH = "main";

/** Map keys are a collection id or a bare drive id (every branch). */
export type RoutingOptions = {
  /** Placement overrides: collection or drive id -> backend name. Advisory. */
  readonly collections?: Readonly<Record<string, string>>;
  readonly requirements?: Readonly<Record<string, CollectionRequirementsInput>>;
  readonly defaultRequirements?: CollectionRequirementsInput;
  /** Seeds the document -> backend cache. */
  readonly documents?: Readonly<Record<string, string>>;
  /** Answers what no collection owns. Defaults to the first backend. */
  readonly primaryBackend?: string;
  readonly misrouteAttempts?: number;
  readonly documentCacheSize?: number;
  readonly jobCacheSize?: number;
  readonly subscriptionDedupSize?: number;
  /** Defaults to `console.warn`. */
  readonly onDiagnostic?: RouterDiagnostic;
  /** Signs the actions the router builds itself. Defaults to no signature. */
  readonly signer?: ISigner;
  /** The module registry; absent, the primary backend's is used. */
  readonly documentModelModules?: readonly DocumentModelModule[];
};
