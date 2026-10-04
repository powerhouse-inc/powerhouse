import type { DriveCollectionId } from "@powerhousedao/reactor";
import { UnknownBackendError } from "./errors.js";
import {
  ineligibleReason,
  placeCollection,
  placeStandalone,
} from "./placement.js";
import {
  collectionRequirements,
  DEFAULT_DOCUMENT_CACHE_SIZE,
  DEFAULT_JOB_CACHE_SIZE,
  NO_REQUIREMENTS,
  type CollectionRequirements,
  type ReactorBackend,
  type RouterTableEntry,
  type RouterTableSnapshot,
  type RouteSource,
  type RoutingOptions,
} from "./types.js";

/**
 * An insertion-ordered map with a bound: the oldest entry is dropped when the
 * bound is reached, and reading an entry does NOT make it younger.
 *
 * Deliberately insertion-ordered rather than least-recently-used. Both caches
 * here are correctness-neutral (a dropped entry costs a probe, a wrong entry
 * costs a misroute retry), and an access-ordered map has to rewrite the map on
 * every read, which is the hot path.
 */
class BoundedMap {
  private readonly entries = new Map<string, string>();

  constructor(private readonly limit: number) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): string {
    return this.entries.get(key) ?? "";
  }

  set(key: string, value: string): void {
    if (this.limit < 1) {
      return;
    }
    if (this.entries.has(key)) {
      this.entries.set(key, value);
      return;
    }
    if (this.entries.size >= this.limit) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(key, value);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  list(): readonly { key: string; value: string }[] {
    return [...this.entries].map(([key, value]) => ({ key, value }));
  }
}

type CollectionRoute = {
  readonly backend: string;
  readonly source: RouteSource;
};

/**
 * The router's routing state: which backend holds which collection, where a
 * resolved document turned out to live, and which backend owns a submitted job.
 *
 * **The table is an optimisation, never an authority.** Every read of it is
 * allowed to be wrong, because a backend handed an operation it does not own
 * refuses with a structured misroute and the router re-aims (plan agreed
 * decision 4). That is what lets the table be a hash with overrides rather than
 * a consensus-maintained directory, and it is why `recordCorrection` is allowed
 * to overrule even an operator's explicit override: an override that a backend
 * refuses is a wrong override, and the write still has to land.
 *
 * Collection lookups fall back through three levels in order -- explicit
 * override, learned/corrected entry, placement hash -- and only the first two
 * are remembered; a placement is recomputed each time, so it follows the
 * capability table as the topology changes.
 */
export class RouterTable {
  private readonly order: readonly ReactorBackend[];
  private readonly byName: ReadonlyMap<string, ReactorBackend>;
  private readonly overrides: ReadonlyMap<string, string>;
  private readonly requirements: ReadonlyMap<string, CollectionRequirements>;
  private readonly fallbackRequirements: CollectionRequirements;
  private readonly learned = new Map<string, CollectionRoute>();
  private readonly documents: BoundedMap;
  private readonly jobs: BoundedMap;

  constructor(
    backends: readonly ReactorBackend[],
    options: RoutingOptions = {},
  ) {
    if (backends.length === 0) {
      throw new Error("A routing reactor client needs at least one backend");
    }
    const byName = new Map<string, ReactorBackend>();
    for (const backend of backends) {
      if (backend.name === "") {
        throw new Error("A reactor backend must have a non-empty name");
      }
      if (byName.has(backend.name)) {
        throw new Error(
          `Duplicate reactor backend name ${JSON.stringify(backend.name)}; names identify a routing target and must be unique`,
        );
      }
      byName.set(backend.name, backend);
    }
    this.order = [...backends];
    this.byName = byName;

    const overrides = new Map<string, string>();
    for (const [key, backend] of Object.entries(options.collections ?? {})) {
      if (!byName.has(backend)) {
        throw new UnknownBackendError(
          backend,
          [...byName.keys()],
          `collections override for ${JSON.stringify(key)}`,
        );
      }
      overrides.set(key, backend);
    }
    this.overrides = overrides;

    const requirements = new Map<string, CollectionRequirements>();
    for (const [key, input] of Object.entries(options.requirements ?? {})) {
      requirements.set(key, collectionRequirements(input));
    }
    this.requirements = requirements;
    this.fallbackRequirements =
      options.defaultRequirements === undefined
        ? NO_REQUIREMENTS
        : collectionRequirements(options.defaultRequirements);

    this.documents = new BoundedMap(
      options.documentCacheSize ?? DEFAULT_DOCUMENT_CACHE_SIZE,
    );
    for (const [identifier, backend] of Object.entries(
      options.documents ?? {},
    )) {
      if (!byName.has(backend)) {
        throw new UnknownBackendError(
          backend,
          [...byName.keys()],
          `documents seed for ${JSON.stringify(identifier)}`,
        );
      }
      this.documents.set(identifier, backend);
    }
    this.jobs = new BoundedMap(options.jobCacheSize ?? DEFAULT_JOB_CACHE_SIZE);
  }

  get backends(): readonly ReactorBackend[] {
    return this.order;
  }

  /** The backend of that name, or a refusal naming the ones there are. */
  backend(name: string, context: string): ReactorBackend {
    const backend = this.byName.get(name);
    if (backend === undefined) {
      throw new UnknownBackendError(name, [...this.byName.keys()], context);
    }
    return backend;
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** What the collection requires of its host; the default when it says nothing. */
  requirementsFor(collection: DriveCollectionId): CollectionRequirements {
    return (
      this.requirements.get(collection.key) ??
      this.requirements.get(collection.driveId) ??
      this.fallbackRequirements
    );
  }

  /**
   * Where the collection should go, and on what evidence. An override wins, a
   * learned or corrected entry comes next, and the placement hash answers for
   * everything the router has never been told about.
   *
   * `excluded` names backends that have already refused this operation in the
   * current attempt sequence, so a retry cannot be handed the same refusal
   * again: an excluded entry is skipped at every level, and an excluded
   * placement falls through to the next eligible backend in the router's stable
   * order. With every backend excluded the caller is out of options and gets
   * the placement answer anyway -- it is the caller's attempt budget, not this
   * table, that ends the sequence.
   */
  collectionRoute(
    collection: DriveCollectionId,
    excluded: ReadonlySet<string> = new Set(),
  ): RouterTableEntry {
    const learned = this.learned.get(collection.key);
    // A CORRECTION outranks an override: the override named a backend that
    // refused the operation, and a route that keeps naming it would repeat the
    // refusal on every call. The contradiction is reported when it is recorded
    // (`dispatcher.ts`), so the operator hears about a stale override instead
    // of having it silently honoured or silently dropped.
    if (
      learned !== undefined &&
      learned.source === "corrected" &&
      !excluded.has(learned.backend)
    ) {
      return {
        collectionId: collection.key,
        backend: learned.backend,
        source: "corrected",
      };
    }
    const override =
      this.overrides.get(collection.key) ??
      this.overrides.get(collection.driveId) ??
      "";
    if (override !== "" && !excluded.has(override)) {
      return {
        collectionId: collection.key,
        backend: override,
        source: "override",
      };
    }
    if (learned !== undefined && !excluded.has(learned.backend)) {
      return {
        collectionId: collection.key,
        backend: learned.backend,
        source: learned.source,
      };
    }
    const requirements = this.requirementsFor(collection);
    const placed = placeCollection(collection, this.order, requirements);
    if (!excluded.has(placed.name)) {
      return {
        collectionId: collection.key,
        backend: placed.name,
        source: "placed",
      };
    }
    const alternative = this.order.find(
      (backend) =>
        !excluded.has(backend.name) &&
        backend !== placed &&
        this.isEligible(backend, requirements),
    );
    return {
      collectionId: collection.key,
      backend: (alternative ?? placed).name,
      source: "placed",
    };
  }

  /** Placement for a parentless document, honouring the default requirements. */
  standaloneRoute(
    documentId: string,
    excluded: ReadonlySet<string> = new Set(),
  ): ReactorBackend {
    const placed = placeStandalone(
      documentId,
      this.order,
      this.fallbackRequirements,
    );
    if (!excluded.has(placed.name)) {
      return placed;
    }
    const alternative = this.order.find(
      (backend) =>
        !excluded.has(backend.name) &&
        this.isEligible(backend, this.fallbackRequirements),
    );
    return alternative ?? placed;
  }

  /** The backend a probe or a creation proved holds the collection. */
  recordLearnedCollection(
    collection: DriveCollectionId,
    backend: string,
  ): void {
    this.learned.set(collection.key, { backend, source: "learned" });
  }

  /**
   * The backend that ACCEPTED an operation a previously-routed backend refused.
   *
   * Recorded as `corrected`, and recorded even over an explicit override: an
   * override the owning backend rejects is wrong, and the next operation must
   * not repeat the refusal. The caller reports the contradiction through
   * `onDiagnostic` so the operator learns their configuration is stale rather
   * than having it quietly ignored.
   */
  recordCorrectedCollection(
    collection: DriveCollectionId,
    backend: string,
  ): void {
    this.learned.set(collection.key, { backend, source: "corrected" });
  }

  /** Whether an override points this collection somewhere. */
  overrideFor(collection: DriveCollectionId): string {
    return (
      this.overrides.get(collection.key) ??
      this.overrides.get(collection.driveId) ??
      ""
    );
  }

  /** Drops a learned entry that named a backend which has since refused it. */
  forgetCollection(collection: DriveCollectionId, backend: string): void {
    const learned = this.learned.get(collection.key);
    if (learned !== undefined && learned.backend === backend) {
      this.learned.delete(collection.key);
    }
  }

  documentBackend(identifier: string): string {
    return this.documents.get(identifier);
  }

  recordDocument(identifier: string, backend: string): void {
    if (identifier === "" || backend === "") {
      return;
    }
    this.documents.set(identifier, backend);
  }

  forgetDocument(identifier: string): void {
    this.documents.delete(identifier);
  }

  jobBackend(jobId: string): string {
    return this.jobs.get(jobId);
  }

  recordJob(jobId: string, backend: string): void {
    if (jobId === "" || backend === "") {
      return;
    }
    this.jobs.set(jobId, backend);
  }

  /** Everything the router currently believes, for a test or an operator view. */
  describe(): RouterTableSnapshot {
    const collections: RouterTableEntry[] = [];
    for (const [key, backend] of this.overrides) {
      // The override's key may be a bare drive id; report the canonical id when
      // it is a collection key and the raw key otherwise.
      collections.push({
        collectionId: key,
        backend,
        source: this.learned.has(key) ? "corrected" : "override",
      });
    }
    for (const [key, route] of this.learned) {
      collections.push({
        collectionId: key,
        backend: route.backend,
        source: route.source,
      });
    }
    return {
      backends: this.order.map((backend) => backend.name),
      collections,
      documents: this.documents
        .list()
        .map((entry) => ({ identifier: entry.key, backend: entry.value })),
      jobs: this.jobs
        .list()
        .map((entry) => ({ jobId: entry.key, backend: entry.value })),
    };
  }

  private isEligible(
    backend: ReactorBackend,
    requirements: CollectionRequirements,
  ): boolean {
    return ineligibleReason(backend.capabilities, requirements) === "";
  }
}
