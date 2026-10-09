import { DriveCollectionId } from "@powerhousedao/reactor";
import type { RouterBackend } from "./backend.js";
import {
  CrossBackendBatchError,
  messageOf,
  MisrouteUnresolvedError,
  misrouteOf,
  NoEligibleBackendError,
  NOT_MISROUTED,
  rethrow,
  type MisrouteInfo,
} from "./errors.js";
import { OwnershipGuard, type Ownership } from "./guard.js";
import { RouterTable, type RouteEvidence } from "./table.js";
import {
  DEFAULT_BRANCH,
  DEFAULT_DOCUMENT_CACHE_SIZE,
  DEFAULT_MISROUTE_ATTEMPTS,
  type RouterDiagnostic,
  type RoutingOptions,
} from "./types.js";

/** What one operation is aimed at, and what the table learns from it. */
interface RouteTarget {
  readonly operation: string;
  readonly subject: string;
  /** The identifier an ownership probe asks about; `""` disables recovery. */
  readonly probeKey: string;
  select(excluded: ReadonlySet<string>): Promise<RouterBackend>;
  accepted(backend: RouterBackend, evidence: RouteEvidence): void;
  refused(backend: RouterBackend, info: MisrouteInfo): void;
}

const NOT_FOUND_ERROR_NAME = "DocumentNotFoundError";

const NONE: ReadonlySet<string> = new Set();

const distinctIds = (identifiers: readonly string[]): string[] => [
  ...new Set(identifiers.filter((id) => id !== "")),
];

/** Marks a step that runs before anything is submitted. */
export type BeforeSubmit = <T>(step: () => Promise<T>) => Promise<T>;

export type AttemptOptions = {
  /** Retry a non-misroute failure elsewhere; reads only, a write may have landed. */
  readonly recoverOnError: boolean;
};

export const ATTEMPT = Object.freeze({
  read: Object.freeze({ recoverOnError: true }) as AttemptOptions,
  write: Object.freeze({ recoverOnError: false }) as AttemptOptions,
});

/** Runs an operation on its backend; a misroute corrects the table and retries. */
export class RouteDispatcher {
  readonly table: RouterTable;
  readonly onDiagnostic: RouterDiagnostic;
  private readonly attempts: number;
  private readonly primaryName: string;
  private readonly guard: OwnershipGuard;

  constructor(
    backends: readonly RouterBackend[],
    options: RoutingOptions = {},
  ) {
    this.table = new RouterTable(backends, options);
    this.onDiagnostic =
      options.onDiagnostic ??
      ((message: string, detail?: unknown) => {
        console.warn(`[reactor-router] ${message}`, detail);
      });
    this.attempts = Math.max(
      1,
      options.misrouteAttempts ?? DEFAULT_MISROUTE_ATTEMPTS,
    );
    this.guard = new OwnershipGuard(
      (backend, identifier) => this.owns(backend, identifier),
      (backend, identifier) =>
        Promise.all(
          this.backends
            .filter((other) => other !== backend)
            .map(async (other) => ({
              backend: other.name,
              answer: await this.owns(other, identifier),
            })),
        ),
      options.documentCacheSize ?? DEFAULT_DOCUMENT_CACHE_SIZE,
    );
    this.primaryName =
      options.primaryBackend === undefined
        ? this.table.backends[0].name
        : this.table.backend(options.primaryBackend, "primaryBackend").name;
  }

  get backends(): readonly RouterBackend[] {
    return this.table.backends;
  }

  /** Answers what no collection owns: the registry and creation defaults. */
  get primary(): RouterBackend {
    return this.table.backend(this.primaryName, "primaryBackend");
  }

  /** Re-reads the facts of the named backend, or of every backend. */
  async refreshFacts(name?: string): Promise<void> {
    const targets =
      name === undefined
        ? this.backends
        : [this.table.backend(name, "refreshFacts")];
    await Promise.all(
      targets.map((backend) => backend.refreshFacts(this.onDiagnostic)),
    );
  }

  collectionFor(driveIdentifier: string, branch: string): DriveCollectionId {
    return DriveCollectionId.forDrive(
      driveIdentifier,
      branch === "" ? DEFAULT_BRANCH : branch,
    );
  }

  onDocument<T>(
    label: string,
    identifier: string,
    run: (backend: RouterBackend) => Promise<T>,
    options: AttemptOptions,
  ): Promise<T> {
    return this.attempt(this.documentTarget(label, identifier), run, options);
  }

  onCollection<T>(
    label: string,
    driveIdentifier: string,
    branch: string,
    run: (backend: RouterBackend) => Promise<T>,
    options: AttemptOptions,
  ): Promise<T> {
    const collection = this.collectionFor(driveIdentifier, branch);
    return this.attempt(
      this.collectionTarget(label, collection, driveIdentifier),
      run,
      options,
    );
  }

  /** The caller chose the backend; a misroute has nowhere else to go. */
  onBackend<T>(
    label: string,
    backend: RouterBackend,
    run: (backend: RouterBackend) => Promise<T>,
    options: AttemptOptions,
  ): Promise<T> {
    return this.attempt(
      {
        operation: label,
        subject: backend.name,
        probeKey: "",
        select: () => Promise.resolve(backend),
        accepted: () => {},
        refused: () => {},
      },
      run,
      options,
    );
  }

  /**
   * A batch-shaped write on the backend {@link resolveBatchBackend} names.
   * Existing ids are guarded strictly, created ids only against a holder
   * elsewhere. A refusal excludes the refusing backend for the id it refused
   * (every id when it names none, or for a not-found raised by a step wrapped
   * in `beforeSubmit`), and forgets the cached routes of every id of the
   * batch, so the next attempt probes them; a created id it names an owner
   * for routes as existing. Any other failure is the caller's, since a job
   * may have landed.
   */
  async onDocuments<T>(
    label: string,
    identifiers: readonly string[],
    run: (backend: RouterBackend, beforeSubmit: BeforeSubmit) => Promise<T>,
    created: ReadonlySet<string> = NONE,
  ): Promise<{ readonly value: T; readonly backend: RouterBackend }> {
    const distinct = distinctIds(identifiers);
    const creating = new Set(distinct.filter((id) => created.has(id)));
    const notFoundBeforeSubmit = new WeakSet<object>();
    const beforeSubmit: BeforeSubmit = async (step) => {
      try {
        return await step();
      } catch (error) {
        if (Error.isError(error) && error.name === NOT_FOUND_ERROR_NAME) {
          notFoundBeforeSubmit.add(error);
        }
        throw error;
      }
    };
    const excludedById = new Map<string, Set<string>>();
    const refusedBy: string[] = [];
    let failure: unknown = undefined;
    let info = NOT_MISROUTED;
    for (let attempt = 0; attempt < this.attempts; attempt++) {
      const backend = await this.resolveBatchBackend(
        label,
        distinct,
        creating,
        excludedById,
      );
      if (distinct.some((id) => excludedById.get(id)?.has(backend.name))) {
        break;
      }
      try {
        await Promise.all(
          distinct.map((identifier) =>
            creating.has(identifier)
              ? this.guard.assertNotHeldElsewhere(backend, identifier, label)
              : this.guard.assertOwned(backend, identifier, label),
          ),
        );
        return { value: await run(backend, beforeSubmit), backend };
      } catch (error) {
        info = misrouteOf(error);
        const notFound =
          Error.isError(error) && notFoundBeforeSubmit.has(error);
        if (!info.misrouted && !notFound) {
          throw error;
        }
        refusedBy.push(backend.name);
        failure = error;
        const named = info.misrouted && distinct.includes(info.documentId);
        for (const identifier of named ? [info.documentId] : distinct) {
          const excluded = excludedById.get(identifier) ?? new Set<string>();
          excluded.add(backend.name);
          excludedById.set(identifier, excluded);
        }
        for (const identifier of distinct) {
          this.table.forgetDocument(identifier);
          this.guard.forget(backend, identifier);
        }
        if (named) {
          this.applyHint(info.documentId, info);
          if (this.table.has(info.ownerHint)) {
            creating.delete(info.documentId);
          }
        }
      }
    }
    if (!info.misrouted) {
      rethrow(failure);
    }
    throw new MisrouteUnresolvedError(
      label,
      distinct.join(", "),
      refusedBy,
      info.reason,
    );
  }

  /**
   * The one backend a batch runs on:
   * 1. Each existing id resolves to its holder, skipping a backend only for an
   *    id it refused. A cached route is a hint for where to look first, never
   *    evidence of a split.
   * 2. Existing ids on different holders throw CrossBackendBatchError only
   *    after every cached holder is re-probed on that attempt; a route the
   *    probe contradicts is replaced. The deleteDocuments pre-check re-probes
   *    every cached holder, split or not.
   * 3. Created ids follow the existing ids' holder; a batch that creates every
   *    id is placed by its first id.
   * 4. A created id another backend holds is refused, naming that holder, and
   *    then routes as existing (see {@link onDocuments}).
   * 5. A refusal excludes the refusing backend only for the id it refused, and
   *    forgets the cached routes of every id of the batch.
   * Every create resolves by these rules: executeBatch, create, createAsync and
   * createEmpty* (the new id as created, beside its parent when given), and
   * drives.addFile (see {@link assertCreatableBeside}).
   */
  resolveBatchBackend(
    operation: string,
    identifiers: readonly string[],
    created: ReadonlySet<string> = NONE,
    excludedById: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
  ): Promise<RouterBackend> {
    return this.resolveBatch(
      operation,
      identifiers,
      created,
      excludedById,
      false,
    );
  }

  /** Like {@link resolveBatchBackend}, but re-probes every cached holder. */
  verifyBatchBackend(
    operation: string,
    identifiers: readonly string[],
  ): Promise<RouterBackend> {
    return this.resolveBatch(operation, identifiers, NONE, new Map(), true);
  }

  /**
   * An id created beside an anchor on `backend` and held on another backend
   * spans two backends, as the same create in one batch would.
   */
  async assertCreatableBeside(
    operation: string,
    backend: RouterBackend,
    createdId: string,
    anchorId: string,
  ): Promise<void> {
    try {
      await this.guard.assertNotHeldElsewhere(backend, createdId, operation);
    } catch (error) {
      const info = misrouteOf(error);
      if (!info.misrouted || !this.table.has(info.ownerHint)) {
        throw error;
      }
      this.table.recordDocument(createdId, info.ownerHint);
      throw new CrossBackendBatchError(operation, [
        { documentId: createdId, backend: info.ownerHint },
        { documentId: anchorId, backend: backend.name },
      ]);
    }
  }

  private async resolveBatch(
    operation: string,
    identifiers: readonly string[],
    created: ReadonlySet<string>,
    excludedById: ReadonlyMap<string, ReadonlySet<string>>,
    verifyCached: boolean,
  ): Promise<RouterBackend> {
    const distinct = distinctIds(identifiers);
    if (distinct.length === 0) {
      return this.primary;
    }
    const existing = distinct.filter((id) => !created.has(id));
    if (existing.length === 0) {
      const excluded = new Set(
        distinct.flatMap((id) => [...(excludedById.get(id) ?? NONE)]),
      );
      return this.placeDocument(distinct[0], excluded);
    }
    let holders = await Promise.all(
      existing.map(async (documentId) => ({
        documentId,
        ...(await this.holderOf(
          documentId,
          excludedById.get(documentId) ?? NONE,
        )),
      })),
    );
    const split = () =>
      holders.some((entry) => entry.backend !== holders[0].backend);
    if (verifyCached || split()) {
      holders = await Promise.all(
        holders.map(async (entry) =>
          entry.cached
            ? {
                ...entry,
                backend: await this.verifiedHolder(
                  entry.documentId,
                  entry.backend,
                  excludedById.get(entry.documentId) ?? NONE,
                ),
              }
            : entry,
        ),
      );
    }
    if (split()) {
      throw new CrossBackendBatchError(
        operation,
        holders.map((entry) => ({
          documentId: entry.documentId,
          backend: entry.backend.name,
        })),
      );
    }
    return holders[0].backend;
  }

  async resolveDocumentBackend(
    identifier: string,
    excluded: ReadonlySet<string> = new Set(),
  ): Promise<RouterBackend> {
    const cached = this.table.documentBackend(identifier);
    if (cached !== "" && this.table.has(cached) && !excluded.has(cached)) {
      return this.table.backend(cached, `cached route for ${identifier}`);
    }
    const serving = await this.servingBackends(identifier, excluded);
    if (serving.length > 0) {
      this.table.recordDocument(identifier, serving[0].name);
      return serving[0];
    }
    return this.placeDocument(identifier, excluded);
  }

  /** An id no backend serves is placed as a collection of its own. */
  async placeDocument(
    identifier: string,
    excluded: ReadonlySet<string> = new Set(),
  ): Promise<RouterBackend> {
    const route = await this.placed(() =>
      this.table.collectionRoute(
        DriveCollectionId.forDrive(identifier),
        excluded,
      ),
    );
    return this.table.backend(
      route.backend,
      `placement for ${JSON.stringify(identifier)}`,
    );
  }

  async resolveCollectionBackend(
    collection: DriveCollectionId,
    excluded: ReadonlySet<string> = new Set(),
  ): Promise<RouterBackend> {
    const route = await this.placed(() =>
      this.table.collectionRoute(collection, excluded),
    );
    if (route.source !== "placed") {
      return this.table.backend(
        route.backend,
        `route for ${route.collectionId}`,
      );
    }
    const serving = await this.servingBackends(collection.driveId, excluded);
    if (serving.length > 0) {
      this.table.recordCollection(collection, serving[0].name, "probed");
      this.table.recordDocument(collection.driveId, serving[0].name);
      return serving[0];
    }
    return this.table.backend(
      route.backend,
      `placement for ${route.collectionId}`,
    );
  }

  /** Re-reads every backend's facts once before refusing a placement. */
  async placed<T>(place: () => T): Promise<T> {
    try {
      return place();
    } catch (error) {
      if (!(error instanceof NoEligibleBackendError)) {
        throw error;
      }
    }
    await this.refreshFacts();
    return place();
  }

  /** The backends that prove they hold the identifier, in configuration order. */
  async servingBackends(
    identifier: string,
    excluded: ReadonlySet<string> = new Set(),
  ): Promise<readonly RouterBackend[]> {
    if (identifier === "") {
      return [];
    }
    const candidates = this.backends.filter(
      (backend) => !excluded.has(backend.name),
    );
    const answers = await Promise.all(
      candidates.map((backend) => this.owns(backend, identifier)),
    );
    return candidates.filter((_backend, i) => answers[i] === "yes");
  }

  /** An id served only by a backend excluded for it stays on that backend. */
  private async holderOf(
    identifier: string,
    excluded: ReadonlySet<string>,
  ): Promise<{ readonly backend: RouterBackend; readonly cached: boolean }> {
    const cached = this.table.documentBackend(identifier);
    if (cached !== "" && this.table.has(cached) && !excluded.has(cached)) {
      return {
        backend: this.table.backend(cached, `cached route for ${identifier}`),
        cached: true,
      };
    }
    const answers = await Promise.all(
      this.backends.map((backend) => this.owns(backend, identifier)),
    );
    const serving = this.backends.filter((_backend, i) => answers[i] === "yes");
    const holder = serving.find((backend) => !excluded.has(backend.name));
    if (holder !== undefined) {
      this.table.recordDocument(identifier, holder.name);
      return { backend: holder, cached: false };
    }
    if (serving.length > 0) {
      return { backend: serving[0], cached: false };
    }
    return {
      backend: await this.placeDocument(identifier, excluded),
      cached: false,
    };
  }

  /** A cached holder that a probe finds elsewhere is replaced by the probed one. */
  private async verifiedHolder(
    identifier: string,
    cached: RouterBackend,
    excluded: ReadonlySet<string>,
  ): Promise<RouterBackend> {
    const answers = await Promise.all(
      this.backends.map((backend) => this.owns(backend, identifier)),
    );
    const serving = this.backends.filter((_backend, i) => answers[i] === "yes");
    if (serving.length === 0 || serving.includes(cached)) {
      return cached;
    }
    this.table.forgetDocument(identifier);
    this.guard.forget(cached, identifier);
    const holder = serving.find((backend) => !excluded.has(backend.name));
    if (holder === undefined) {
      return serving[0];
    }
    this.table.recordDocument(identifier, holder.name);
    return holder;
  }

  /** isServed, then isDocumentIdTaken when declared. A failure is unknown. */
  async owns(backend: RouterBackend, identifier: string): Promise<Ownership> {
    try {
      if (await backend.api.isServed(identifier)) {
        return "yes";
      }
      const api = backend.api;
      if (api.isDocumentIdTaken === undefined) {
        return "no";
      }
      return (await api.isDocumentIdTaken(identifier)) ? "yes" : "no";
    } catch (error) {
      this.onDiagnostic(
        `ownership probe: ${backend.name} could not say whether it holds ${JSON.stringify(identifier)} (${messageOf(error)})`,
        error,
      );
      return "unknown";
    }
  }

  recordJob(jobId: string, backend: string): void {
    this.table.recordJob(jobId, backend);
  }

  recordDocument(identifier: string, backend: string): void {
    this.table.recordDocument(identifier, backend);
  }

  private documentTarget(operation: string, identifier: string): RouteTarget {
    return {
      operation,
      subject: identifier,
      probeKey: identifier,
      select: (excluded) => this.resolveDocumentBackend(identifier, excluded),
      accepted: (backend, evidence) => {
        this.table.recordDocument(identifier, backend.name);
        if (evidence === "refusal") {
          this.onDiagnostic(
            `misroute resolved: ${JSON.stringify(identifier)} is on ${backend.name}; the document route was corrected`,
          );
        }
      },
      refused: (_backend, info) => {
        this.table.forgetDocument(identifier);
        this.applyHint(identifier, info);
      },
    };
  }

  private collectionTarget(
    operation: string,
    collection: DriveCollectionId,
    driveIdentifier: string,
  ): RouteTarget {
    return {
      operation,
      subject: collection.key,
      probeKey: driveIdentifier,
      select: (excluded) => this.resolveCollectionBackend(collection, excluded),
      accepted: (backend, evidence) => {
        this.table.recordDocument(driveIdentifier, backend.name);
        this.table.recordCollection(collection, backend.name, evidence);
        if (evidence !== "refusal") {
          return;
        }
        const override = this.table.overrideFor(collection);
        if (override !== "" && override !== backend.name) {
          this.onDiagnostic(
            `collections override for ${collection.key} names ${override}, which refused the operation; ${backend.name} accepted it and the route was corrected. The override is stale.`,
          );
          return;
        }
        this.onDiagnostic(
          `misroute resolved: ${collection.key} is on ${backend.name}; the collection route was corrected`,
        );
      },
      refused: (backend, info) => {
        this.table.forgetCollection(collection, backend.name);
        this.table.forgetDocument(driveIdentifier);
        this.applyHint(driveIdentifier, info);
      },
    };
  }

  /** Believes a refusal that names an owner this router holds. */
  private applyHint(identifier: string, info: MisrouteInfo): void {
    if (info.ownerHint === "") {
      return;
    }
    if (!this.table.has(info.ownerHint)) {
      this.onDiagnostic(
        `misroute named owner ${JSON.stringify(info.ownerHint)}, which is not a backend of this router; re-probing instead`,
      );
      return;
    }
    this.table.recordDocument(identifier, info.ownerHint);
    if (info.collectionId === "") {
      return;
    }
    let collection: DriveCollectionId;
    try {
      collection = DriveCollectionId.fromKey(info.collectionId);
    } catch {
      this.onDiagnostic(
        `misroute named collection ${JSON.stringify(info.collectionId)}, which is not a collection id; ignoring that field`,
      );
      return;
    }
    this.table.recordCollection(collection, info.ownerHint, "refusal");
  }

  /** Stops early when `select` offers a backend that already refused. */
  private async attempt<T>(
    target: RouteTarget,
    run: (backend: RouterBackend) => Promise<T>,
    options: AttemptOptions,
  ): Promise<T> {
    const excluded = new Set<string>();
    const refusedBy: string[] = [];
    let lastReason = "";
    for (let attempt = 0; attempt < this.attempts; attempt++) {
      const backend = await target.select(excluded);
      if (excluded.has(backend.name)) {
        break;
      }
      try {
        if (!options.recoverOnError) {
          await this.guard.assertOwned(
            backend,
            target.probeKey,
            target.operation,
          );
        }
        const value = await run(backend);
        target.accepted(backend, attempt > 0 ? "refusal" : "accepted");
        return value;
      } catch (error) {
        const info = misrouteOf(error);
        if (!info.misrouted) {
          if (!options.recoverOnError) {
            throw error;
          }
          return this.recoverRead(target, backend, run, error);
        }
        target.refused(backend, info);
        excluded.add(backend.name);
        refusedBy.push(backend.name);
        lastReason = info.reason;
      }
    }
    throw new MisrouteUnresolvedError(
      target.operation,
      target.subject,
      refusedBy,
      lastReason,
    );
  }

  /** Retries a failed read once on a proven holder; routes stay unchanged. */
  private async recoverRead<T>(
    target: RouteTarget,
    failed: RouterBackend,
    run: (backend: RouterBackend) => Promise<T>,
    error: unknown,
  ): Promise<T> {
    const serving = await this.servingBackends(
      target.probeKey,
      new Set([failed.name]),
    );
    if (serving.length === 0) {
      rethrow(error);
    }
    return run(serving[0]);
  }
}
