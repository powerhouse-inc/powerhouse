import type { DriveCollectionId } from "@powerhousedao/reactor";
import type { RouterBackend } from "./backend.js";
import { UnknownBackendError } from "./errors.js";
import { ineligibleReason, placeCollection } from "./placement.js";
import {
  collectionRequirements,
  DEFAULT_DOCUMENT_CACHE_SIZE,
  DEFAULT_JOB_CACHE_SIZE,
  NO_REQUIREMENTS,
  type CollectionRequirements,
  type RouterTableEntry,
  type RouterTableSnapshot,
  type RouteSource,
  type RoutingOptions,
} from "./types.js";

/** Insertion-ordered and bounded; a read does not refresh an entry. */
export class BoundedMap {
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

export type CollectionRoute = {
  readonly backend: string;
  readonly source: RouteSource;
};

/**
 * What an operation proved about where a collection lives:
 * - `probed`: an ownership probe answered yes while placing. Nothing refused.
 * - `accepted`: the backend ran the operation on the first attempt.
 * - `refusal`: the backend ran it after another backend refused it.
 */
export type RouteEvidence = "probed" | "accepted" | "refusal";

/**
 * The single place route-source precedence is decided:
 * - only a refusal produces `corrected`;
 * - an acceptance keeps an entry naming the same backend, never downgrades a
 *   `corrected` entry, and otherwise records `learned`;
 * - a probe never replaces an entry; it only fills an empty one as `learned`.
 */
export function nextCollectionRoute(
  current: CollectionRoute | undefined,
  backend: string,
  evidence: RouteEvidence,
): CollectionRoute {
  if (evidence === "refusal") {
    return { backend, source: "corrected" };
  }
  if (current !== undefined) {
    if (evidence === "probed" || current.backend === backend) {
      return current;
    }
    if (current.source === "corrected") {
      return current;
    }
  }
  return { backend, source: "learned" };
}

/** Routing state. Any entry may be wrong; a refusal corrects it. */
export class RouterTable {
  private readonly order: readonly RouterBackend[];
  private readonly byName: ReadonlyMap<string, RouterBackend>;
  private readonly overrides: ReadonlyMap<string, string>;
  private readonly requirements: ReadonlyMap<string, CollectionRequirements>;
  private readonly fallbackRequirements: CollectionRequirements;
  private readonly learned = new Map<string, CollectionRoute>();
  private readonly documents: BoundedMap;
  private readonly jobs: BoundedMap;

  constructor(
    backends: readonly RouterBackend[],
    options: RoutingOptions = {},
  ) {
    if (backends.length === 0) {
      throw new Error("A routing reactor client needs at least one backend");
    }
    const byName = new Map<string, RouterBackend>();
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

  get backends(): readonly RouterBackend[] {
    return this.order;
  }

  backend(name: string, context: string): RouterBackend {
    const backend = this.byName.get(name);
    if (backend === undefined) {
      throw new UnknownBackendError(name, [...this.byName.keys()], context);
    }
    return backend;
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  requirementsFor(collection: DriveCollectionId): CollectionRequirements {
    return (
      this.requirements.get(collection.key) ??
      this.requirements.get(collection.driveId) ??
      this.fallbackRequirements
    );
  }

  /** Correction, override, learned, hash; `excluded` backends are skipped. */
  collectionRoute(
    collection: DriveCollectionId,
    excluded: ReadonlySet<string> = new Set(),
  ): RouterTableEntry {
    const learned = this.learned.get(collection.key);
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
    const override = this.overrideFor(collection);
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

  /** Records what an operation proved; see {@link nextCollectionRoute}. */
  recordCollection(
    collection: DriveCollectionId,
    backend: string,
    evidence: RouteEvidence,
  ): void {
    this.learned.set(
      collection.key,
      nextCollectionRoute(this.learned.get(collection.key), backend, evidence),
    );
  }

  overrideFor(collection: DriveCollectionId): string {
    return (
      this.overrides.get(collection.key) ??
      this.overrides.get(collection.driveId) ??
      ""
    );
  }

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

  /** One row per collection key, labelled by the entry that wins. */
  describe(): RouterTableSnapshot {
    const keys = new Set<string>([
      ...this.overrides.keys(),
      ...this.learned.keys(),
    ]);
    const collections: RouterTableEntry[] = [];
    for (const key of keys) {
      const learned = this.learned.get(key);
      const override = this.overrides.get(key);
      if (learned !== undefined && learned.source === "corrected") {
        collections.push({
          collectionId: key,
          backend: learned.backend,
          source: "corrected",
        });
      } else if (override !== undefined) {
        collections.push({
          collectionId: key,
          backend: override,
          source: "override",
        });
      } else if (learned !== undefined) {
        collections.push({
          collectionId: key,
          backend: learned.backend,
          source: learned.source,
        });
      }
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
    backend: RouterBackend,
    requirements: CollectionRequirements,
  ): boolean {
    return ineligibleReason(backend.facts, requirements) === "";
  }
}
