import { DriveCollectionId } from "@powerhousedao/reactor";
import type { RouterBackend } from "./backend.js";
import { messageOf, UnknownBackendError } from "./errors.js";
import { ineligibleReason, placeCollection } from "./placement.js";
import {
  collectionRequirements,
  DEFAULT_DOCUMENT_CACHE_SIZE,
  DEFAULT_JOB_CACHE_SIZE,
  DEFAULT_PROVISIONAL_ROUTE_MS,
  NO_REQUIREMENTS,
  warnDiagnostic,
  type CollectionRequirements,
  type PlacementOrigin,
  type RouterDiagnostic,
  type RouterTableEntry,
  type RouterTableSnapshot,
  type RouteSource,
  type RoutingChange,
  type RoutingChangeListener,
  type RoutingOptions,
} from "./types.js";

/** Insertion-ordered and bounded; a read does not refresh an entry. */
export class BoundedMap<V = string> {
  private readonly entries = new Map<string, V>();

  constructor(private readonly limit: number) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): V | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: V): void {
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

  clear(): void {
    this.entries.clear();
  }

  list(): readonly { key: string; value: V }[] {
    return [...this.entries].map(([key, value]) => ({ key, value }));
  }
}

/** A cached route; `expiresAt` (epoch ms) marks it provisional. */
type CachedRoute = {
  readonly backend: string;
  readonly expiresAt?: number;
};

const expired = (route: CachedRoute, now: number): boolean =>
  route.expiresAt !== undefined && now >= route.expiresAt;

/** The drive id of a collection key, or `""` for a bare drive id. */
function driveIdOf(key: string): string {
  try {
    return DriveCollectionId.fromKey(key).driveId;
  } catch {
    return "";
  }
}

/** The placement layers for one key, as a table entry's annotation. */
function placementAnnotation(
  runtime: string | undefined,
  configured: string | undefined,
): Pick<RouterTableEntry, "origin" | "configured"> {
  const origin: PlacementOrigin | undefined =
    runtime !== undefined
      ? "runtime"
      : configured !== undefined
        ? "config"
        : undefined;
  return {
    ...(origin === undefined ? {} : { origin }),
    ...(configured === undefined ? {} : { configured }),
  };
}

export type CollectionRoute = {
  readonly backend: string;
  readonly source: RouteSource;
  /** Epoch ms after which a provisional route is probed again. */
  readonly expiresAt?: number;
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
 * - a probe never replaces an entry; it only fills an empty one as `learned`,
 *   provisional until `expiresAt` when one is given.
 */
export function nextCollectionRoute(
  current: CollectionRoute | undefined,
  backend: string,
  evidence: RouteEvidence,
  expiresAt?: number,
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
  return evidence === "probed" && expiresAt !== undefined
    ? { backend, source: "learned", expiresAt }
    : { backend, source: "learned" };
}

/** Routing state. Any entry may be wrong; a refusal corrects it. */
export class RouterTable {
  private readonly order: readonly RouterBackend[];
  private readonly byName: ReadonlyMap<string, RouterBackend>;
  private readonly configured: ReadonlyMap<string, string>;
  private readonly runtime = new Map<string, string>();
  private readonly listeners = new Set<RoutingChangeListener>();
  private readonly onDiagnostic: RouterDiagnostic;
  private readonly requirements: ReadonlyMap<string, CollectionRequirements>;
  private readonly fallbackRequirements: CollectionRequirements;
  private readonly learned = new Map<string, CollectionRoute>();
  private readonly documents: BoundedMap<CachedRoute>;
  private readonly jobs: BoundedMap;
  private readonly provisionalRouteMs: number;
  private readonly seeds = new Map<string, string>();

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
    this.onDiagnostic = options.onDiagnostic ?? warnDiagnostic;

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
    this.configured = overrides;

    const requirements = new Map<string, CollectionRequirements>();
    for (const [key, input] of Object.entries(options.requirements ?? {})) {
      requirements.set(key, collectionRequirements(input));
    }
    this.requirements = requirements;
    this.fallbackRequirements =
      options.defaultRequirements === undefined
        ? NO_REQUIREMENTS
        : collectionRequirements(options.defaultRequirements);

    this.provisionalRouteMs =
      options.provisionalRouteMs ?? DEFAULT_PROVISIONAL_ROUTE_MS;
    this.documents = new BoundedMap<CachedRoute>(
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
      this.seeds.set(identifier, backend);
    }
    this.seedDocuments();
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
    const known = this.knownRoute(collection, excluded);
    if (known !== undefined) {
      return known;
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

  /** The route the table holds evidence or config for, never a hash placement. */
  knownRoute(
    collection: DriveCollectionId,
    excluded: ReadonlySet<string> = new Set(),
  ): RouterTableEntry | undefined {
    const learned = this.learnedRoute(collection.key);
    const runtime = this.layerFor(this.runtime, collection);
    const configured = this.layerFor(this.configured, collection);
    const annotation = placementAnnotation(runtime, configured);
    if (
      learned !== undefined &&
      learned.source === "corrected" &&
      !excluded.has(learned.backend)
    ) {
      return {
        collectionId: collection.key,
        backend: learned.backend,
        source: "corrected",
        ...annotation,
      };
    }
    const override = runtime ?? configured;
    if (override !== undefined && !excluded.has(override)) {
      return {
        collectionId: collection.key,
        backend: override,
        source: "override",
        ...annotation,
      };
    }
    if (learned !== undefined && !excluded.has(learned.backend)) {
      return {
        collectionId: collection.key,
        backend: learned.backend,
        source: learned.source,
        ...annotation,
      };
    }
    return undefined;
  }

  /**
   * Places a collection (a collection key or a bare drive id, as in
   * `collections`) on a backend at runtime, above the config; `undefined`
   * removes the runtime placement, so the config applies again. The routes
   * learned or corrected for that collection are dropped, and so is every
   * cached document route but the seeded ones, since a cached route does not
   * say which drive holds its document: the next call for any document in
   * the drive follows the new placement.
   */
  setPlacement(key: string, backend: string | undefined): void {
    if (key === "") {
      throw new Error("A placement needs a collection key or a drive id");
    }
    if (backend !== undefined && !this.byName.has(backend)) {
      throw new UnknownBackendError(
        backend,
        [...this.byName.keys()],
        `setPlacement for ${JSON.stringify(key)}`,
      );
    }
    if (this.runtime.get(key) === backend) {
      return;
    }
    if (backend === undefined) {
      this.runtime.delete(key);
    } else {
      this.runtime.set(key, backend);
    }
    const driveId = driveIdOf(key);
    for (const learnedKey of [...this.learned.keys()]) {
      if (
        learnedKey === key ||
        (driveId === "" && driveIdOf(learnedKey) === key)
      ) {
        this.learned.delete(learnedKey);
      }
    }
    this.documents.clear();
    this.seedDocuments();
    this.notify({ key, reason: "placement" });
  }

  /** The placement that applies to a collection, and its layer. */
  placementFor(
    collection: DriveCollectionId,
  ):
    | { readonly backend: string; readonly origin: PlacementOrigin }
    | undefined {
    const runtime = this.layerFor(this.runtime, collection);
    if (runtime !== undefined) {
      return { backend: runtime, origin: "runtime" };
    }
    const configured = this.layerFor(this.configured, collection);
    return configured === undefined
      ? undefined
      : { backend: configured, origin: "config" };
  }

  /** Calls `listener` on every change to the collection table. */
  onChange(listener: RoutingChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Records what an operation proved; see {@link nextCollectionRoute}. A
   * `provisional` probe expires after `provisionalRouteMs`.
   */
  recordCollection(
    collection: DriveCollectionId,
    backend: string,
    evidence: RouteEvidence,
    provisional = false,
  ): void {
    // The raw entry: an expired one stays expired until the next lookup.
    const current = this.learned.get(collection.key);
    const next = nextCollectionRoute(
      current,
      backend,
      evidence,
      provisional ? Date.now() + this.provisionalRouteMs : undefined,
    );
    if (next === current) {
      return;
    }
    this.learned.set(collection.key, next);
    this.notify({
      key: collection.key,
      reason: next.source === "corrected" ? "corrected" : "learned",
    });
  }

  /** The backend the placement names (runtime, else config), or `""`. */
  overrideFor(collection: DriveCollectionId): string {
    return this.placementFor(collection)?.backend ?? "";
  }

  forgetCollection(collection: DriveCollectionId, backend: string): void {
    const learned = this.learnedRoute(collection.key);
    if (learned !== undefined && learned.backend === backend) {
      this.learned.delete(collection.key);
      this.notify({ key: collection.key, reason: "forgotten" });
    }
  }

  /** The cached backend, or `""`; an expired provisional route is dropped. */
  documentBackend(identifier: string): string {
    const route = this.documents.get(identifier);
    if (route === undefined) {
      return "";
    }
    if (expired(route, Date.now())) {
      this.documents.delete(identifier);
      return "";
    }
    return route.backend;
  }

  /** When a provisional route recorded now expires. */
  provisionalDeadline(): number {
    return Date.now() + this.provisionalRouteMs;
  }

  /** When the collection's learned route expires, if it is provisional. */
  learnedExpiry(collection: DriveCollectionId): number | undefined {
    return this.learnedRoute(collection.key)?.expiresAt;
  }

  /**
   * A route with `expiresAt` (epoch ms) is provisional until then. Recording
   * the backend a route already names, without one, keeps it as it is.
   */
  recordDocument(
    identifier: string,
    backend: string,
    expiresAt?: number,
  ): void {
    if (identifier === "" || backend === "") {
      return;
    }
    if (expiresAt !== undefined) {
      this.documents.set(identifier, { backend, expiresAt });
      return;
    }
    if (this.documents.get(identifier)?.backend === backend) {
      return;
    }
    this.documents.set(identifier, { backend });
  }

  forgetDocument(identifier: string): void {
    this.documents.delete(identifier);
  }

  jobBackend(jobId: string): string {
    return this.jobs.get(jobId) ?? "";
  }

  recordJob(jobId: string, backend: string): void {
    if (jobId === "" || backend === "") {
      return;
    }
    this.jobs.set(jobId, backend);
  }

  /** One row per collection key, labelled by the entry that wins. */
  describe(): RouterTableSnapshot {
    const now = Date.now();
    const keys = new Set<string>([
      ...this.configured.keys(),
      ...this.runtime.keys(),
      ...this.learned.keys(),
    ]);
    const collections: RouterTableEntry[] = [];
    for (const key of keys) {
      const learned = this.learnedRoute(key);
      const runtime = this.runtime.get(key);
      const configured = this.configured.get(key);
      const override = runtime ?? configured;
      const annotation = placementAnnotation(runtime, configured);
      if (learned !== undefined && learned.source === "corrected") {
        collections.push({
          collectionId: key,
          backend: learned.backend,
          source: "corrected",
          ...annotation,
        });
      } else if (override !== undefined) {
        collections.push({
          collectionId: key,
          backend: override,
          source: "override",
          ...annotation,
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
      health: this.order.flatMap((backend) => {
        const health = backend.health();
        return health === undefined ? [] : [{ backend: backend.name, health }];
      }),
      collections,
      documents: this.documents
        .list()
        .filter((entry) => !expired(entry.value, now))
        .map((entry) => ({
          identifier: entry.key,
          backend: entry.value.backend,
        })),
      jobs: this.jobs
        .list()
        .map((entry) => ({ jobId: entry.key, backend: entry.value })),
    };
  }

  private layerFor(
    layer: ReadonlyMap<string, string>,
    collection: DriveCollectionId,
  ): string | undefined {
    return layer.get(collection.key) ?? layer.get(collection.driveId);
  }

  private notify(change: RoutingChange): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        this.onDiagnostic(
          `routing change listener failed on ${JSON.stringify(change.key)} (${messageOf(error)})`,
          error,
        );
      }
    }
  }

  private seedDocuments(): void {
    for (const [identifier, backend] of this.seeds) {
      this.documents.set(identifier, { backend });
    }
  }

  /** The learned entry, dropping it once a provisional route has expired. */
  private learnedRoute(key: string): CollectionRoute | undefined {
    const route = this.learned.get(key);
    if (route !== undefined && expired(route, Date.now())) {
      this.learned.delete(key);
      return undefined;
    }
    return route;
  }

  private isEligible(
    backend: RouterBackend,
    requirements: CollectionRequirements,
  ): boolean {
    return ineligibleReason(backend.facts, requirements) === "";
  }
}
