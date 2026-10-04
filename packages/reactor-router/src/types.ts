import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  ReactorCapabilities,
  ReactorSyncChannel,
} from "@powerhousedao/reactor-monitor";

/**
 * One reactor the router may route to.
 *
 * Structurally a subset of `ManagedReactor` (`@powerhousedao/reactor-monitor`),
 * so a provisioned handle is a backend with no adapter -- asserted by
 * `test/backend-contract.test.ts` rather than left to read like a coincidence.
 * Declared as its own, narrower type because the router needs exactly three
 * things of a backend, and a consumer that reaches a reactor some other way (a
 * Switchboard's own `options.reactor` seam, plan stage 4) should not have to
 * manufacture an inspector, an event bus and a kill function to be routable.
 *
 * {@link ReactorCapabilities} is imported, not restated: it is the stage-2
 * capability contract and the router's declared input (plan: "Router client --
 * Input contract"). The import is TYPE-ONLY and this package has no runtime
 * dependency on reactor-monitor at all, so a server consumer pays nothing for
 * the lab bench it never loads.
 */
export interface ReactorBackend {
  /**
   * Stable identity. Every routing decision, misroute correction and refusal
   * names a backend by this, so it must be unique across one router and stable
   * for the router's life -- a `ManagedReactor.name` is both.
   */
  readonly name: string;
  /** The reactor's own client: an in-process client, an RPC proxy, anything. */
  readonly client: IReactorClient;
  /**
   * What this reactor can do, per the stage-2 contract. Read at placement time
   * and cacheable, because the contract is static for the life of an instance.
   */
  readonly capabilities: ReactorCapabilities;
}

/**
 * What a collection needs of the reactor that holds it.
 *
 * Placement filters candidates on this BEFORE the hash runs, so a collection
 * whose processors must run, or whose workflow triggers must fire, cannot be
 * placed on a reactor that declares it cannot serve them (plan agreed decision
 * 3 for workflows; capability contract's `processors` note for the other).
 *
 * Every field is required so a requirement set is a complete statement rather
 * than a shape whose silence means "no". Build one from a partial statement
 * with {@link collectionRequirements}.
 */
export type CollectionRequirements = {
  /** The target must be able to host processor factories. */
  readonly processors: boolean;
  /** The target must be able to run the workflow engine. */
  readonly workflows: boolean;
  /** The target's committed writes must outlive its host. */
  readonly durableStorage: boolean;
  /** The target must be inspectable (`inspection` other than `"none"`). */
  readonly inspectable: boolean;
  /** The target must route every one of these sync channel types. */
  readonly syncChannels: readonly ReactorSyncChannel[];
};

/** What a caller states; everything unsaid is "not required". */
export type CollectionRequirementsInput = {
  readonly processors?: boolean;
  readonly workflows?: boolean;
  readonly durableStorage?: boolean;
  readonly inspectable?: boolean;
  readonly syncChannels?: readonly ReactorSyncChannel[];
};

/** A collection that requires nothing: every backend is a candidate. */
export const NO_REQUIREMENTS: CollectionRequirements = Object.freeze({
  processors: false,
  workflows: false,
  durableStorage: false,
  inspectable: false,
  syncChannels: Object.freeze([]) as readonly ReactorSyncChannel[],
});

/** Completes a partial statement of requirements against {@link NO_REQUIREMENTS}. */
export function collectionRequirements(
  input: CollectionRequirementsInput,
): CollectionRequirements {
  return Object.freeze({
    processors: input.processors ?? NO_REQUIREMENTS.processors,
    workflows: input.workflows ?? NO_REQUIREMENTS.workflows,
    durableStorage: input.durableStorage ?? NO_REQUIREMENTS.durableStorage,
    inspectable: input.inspectable ?? NO_REQUIREMENTS.inspectable,
    syncChannels: Object.freeze([...(input.syncChannels ?? [])]),
  });
}

/**
 * How a collection came to be pointed at a backend. Carried on every table
 * entry and reported by {@link RouterTableSnapshot}, because "the operator said
 * so", "a backend proved it holds the drive" and "a backend refused and another
 * accepted" are three different levels of evidence and an operator diagnosing a
 * topology needs to tell them apart.
 *
 * - `override`: a static `collections` entry the host configured.
 * - `placed`: the hash over the capability-eligible backends. A guess, and the
 *   only entry kind that is routinely wrong after a topology change.
 * - `learned`: a backend answered that it serves the drive when the router
 *   probed for it.
 * - `corrected`: the previous answer was REFUSED by the backend it named, and
 *   this backend accepted the retry. The strongest evidence the router has.
 */
export type RouteSource = "override" | "placed" | "learned" | "corrected";

/** One collection's current routing, with the evidence behind it. */
export type RouterTableEntry = {
  /** The canonical `DriveCollectionId.key` this entry routes. */
  readonly collectionId: string;
  readonly backend: string;
  readonly source: RouteSource;
};

/** The router's whole routing state, for a test, an operator view or a demo. */
export type RouterTableSnapshot = {
  /** Backend names in the router's stable order (configuration order). */
  readonly backends: readonly string[];
  readonly collections: readonly RouterTableEntry[];
  /** Resolved document identifier -> backend, the resolve-and-cache state. */
  readonly documents: readonly { identifier: string; backend: string }[];
  /** Submitted job id -> the backend that owns it. */
  readonly jobs: readonly { jobId: string; backend: string }[];
};

/** Where a diagnostic the router swallowed instead of throwing is reported. */
export type RouterDiagnostic = (message: string, detail?: unknown) => void;

/** How many times a misrouted operation is re-aimed before it is refused. */
export const DEFAULT_MISROUTE_ATTEMPTS = 3;

/** Resolved document identifiers remembered before the oldest is dropped. */
export const DEFAULT_DOCUMENT_CACHE_SIZE = 10_000;

/** Submitted job ids remembered, so `waitForJob` need not probe. */
export const DEFAULT_JOB_CACHE_SIZE = 2_000;

/** Change events remembered for de-duplication across fanned-in backends. */
export const DEFAULT_SUBSCRIPTION_DEDUP_SIZE = 2_048;

/** Branch a collection id is built on when a caller names none. */
export const DEFAULT_BRANCH = "main";

/**
 * How to route, beyond the backends themselves.
 *
 * Every map is keyed by EITHER a canonical collection id
 * (`drive.<branch>.<driveId>`) or a bare drive id, which then applies to every
 * branch of that drive. An operator configuring a topology thinks in drive ids;
 * the router thinks in collections; accepting both costs one lookup and spares
 * every caller the spelling.
 */
export type RoutingOptions = {
  /**
   * Static placement overrides: collection (or drive id) -> backend name. They
   * win over the hash, and an entry naming an unknown backend is refused at
   * construction rather than at the first operation that needs it.
   *
   * An override is still ADVISORY. A backend that refuses an operation for a
   * collection an override pointed at it corrects the entry at runtime (and
   * says so through {@link onDiagnostic}), because correctness never depends on
   * the table being right.
   */
  readonly collections?: Readonly<Record<string, string>>;
  /**
   * Per-collection requirements, filtering placement candidates. Also consulted
   * when an override is honoured, so an override that contradicts a capability
   * is reported rather than silently placing a workflow drive on a browser.
   */
  readonly requirements?: Readonly<Record<string, CollectionRequirementsInput>>;
  /** Requirements for every collection with no entry of its own. */
  readonly defaultRequirements?: CollectionRequirementsInput;
  /**
   * Seeds the document -> backend cache. Mostly a test seam (seed it WRONG and
   * the advisory machinery is what has to save the write), and a host that
   * already knows where a document lives can skip a probe with it.
   */
  readonly documents?: Readonly<Record<string, string>>;
  /**
   * The backend that answers the questions no collection owns -- the document
   * model registry and the creation defaults. Defaults to the first backend in
   * configuration order.
   */
  readonly primaryBackend?: string;
  /** Attempts a misrouted operation gets. Defaults to {@link DEFAULT_MISROUTE_ATTEMPTS}. */
  readonly misrouteAttempts?: number;
  /** Document identifiers remembered. Defaults to {@link DEFAULT_DOCUMENT_CACHE_SIZE}. */
  readonly documentCacheSize?: number;
  /** Job ids remembered. Defaults to {@link DEFAULT_JOB_CACHE_SIZE}. */
  readonly jobCacheSize?: number;
  /** Events remembered for subscription de-duplication. */
  readonly subscriptionDedupSize?: number;
  /**
   * Where the router reports what it swallowed: a backend that failed a
   * tolerant fan-in, an override a backend refused, a subscription a backend
   * would not take. Defaults to `console.warn`, because a router that drops
   * these silently is the failure mode this initiative exists to stamp out.
   */
  readonly onDiagnostic?: RouterDiagnostic;
};
