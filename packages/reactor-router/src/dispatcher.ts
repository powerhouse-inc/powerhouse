import { DriveCollectionId } from "@powerhousedao/reactor";
import {
  messageOf,
  MisrouteUnresolvedError,
  misrouteOf,
  rethrow,
  type MisrouteInfo,
} from "./errors.js";
import {
  DEFAULT_BRANCH,
  DEFAULT_MISROUTE_ATTEMPTS,
  type ReactorBackend,
  type RouterDiagnostic,
  type RoutingOptions,
} from "./types.js";
import { RouterTable } from "./table.js";

/**
 * What one operation is aimed at: how to pick a backend for it, and what the
 * router learns when a backend accepts or refuses it.
 *
 * The two implementations are the two things a router can route BY -- a
 * collection (the drive-level unit placement is defined over) and a document
 * (whose collection the router cannot compute from an identifier, so it has to
 * be discovered). Separating them here is what keeps
 * {@link RouteDispatcher.attempt} one retry loop instead of one per surface.
 */
interface RouteTarget {
  /** The `IReactorClient` method being routed, for refusals and diagnostics. */
  readonly operation: string;
  /** What the operation is aimed at: an identifier, or a collection id. */
  readonly subject: string;
  /**
   * The document identifier an ownership probe can ask about, or `""` when
   * there is nothing to probe (a placement the caller already decided). An
   * empty probe key disables read recovery for the target, which is correct: a
   * probe is the only positive evidence recovery is allowed to act on.
   */
  readonly probeKey: string;
  /** A backend to try, given the ones that have already refused. */
  select(excluded: ReadonlySet<string>): Promise<ReactorBackend>;
  /** A backend accepted the operation; `recovered` when it took a retry to get here. */
  accepted(backend: ReactorBackend, recovered: boolean): void;
  /** A backend refused; the router corrects what it believed. */
  refused(backend: ReactorBackend, info: MisrouteInfo): void;
}

export type AttemptOptions = {
  /**
   * Whether a NON-misroute failure may be retried on another backend that
   * probes as holding the target.
   *
   * True for reads only, and that asymmetry is deliberate. A read that failed
   * because the router aimed at a backend which does not hold the document is
   * recoverable from positive evidence (another backend answers that it serves
   * it) and re-running it costs nothing. A MUTATION that failed with an
   * unstructured error may well have been applied -- the error could be a lost
   * response, not a rejection -- and re-running it elsewhere would risk
   * applying it twice. A mutation is therefore re-aimed only on a STRUCTURED
   * misroute, which is a statement that nothing happened.
   */
  readonly recoverOnError: boolean;
};

const READ: AttemptOptions = Object.freeze({ recoverOnError: true });
const WRITE: AttemptOptions = Object.freeze({ recoverOnError: false });

/** Read and write attempt policies; see {@link AttemptOptions.recoverOnError}. */
export const ATTEMPT = Object.freeze({ read: READ, write: WRITE });

/**
 * Target selection: the part of a routing client that is actually new work.
 *
 * Holds the table, resolves a target to a backend, runs the operation, and --
 * the invariant everything else rests on -- turns a structured misroute into a
 * corrected table and a retry elsewhere, so a wrong table costs a round trip
 * and never a lost or misplaced write (plan agreed decision 4).
 *
 * The documented gap it exists to cover: **no reactor today can state which
 * collections it owns.** There is no "do you own this" call on
 * `IReactorClient`, so the router discovers ownership the two ways that are
 * available -- it asks every backend whether it SERVES the document
 * (`isServed`, falling back to `isDocumentIdTaken` so a soft-deleted document
 * still routes) and it believes a backend that refuses an operation. Both are
 * cached. When reactors grow a real ownership query, it replaces
 * {@link RouteDispatcher.servingBackends} and nothing above this class changes.
 */
export class RouteDispatcher {
  readonly table: RouterTable;
  readonly onDiagnostic: RouterDiagnostic;
  private readonly attempts: number;
  private readonly primaryName: string;

  constructor(
    backends: readonly ReactorBackend[],
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
    if (options.primaryBackend !== undefined) {
      this.primaryName = this.table.backend(
        options.primaryBackend,
        "primaryBackend",
      ).name;
    } else {
      this.primaryName = this.table.backends[0]?.name ?? "";
    }
  }

  get backends(): readonly ReactorBackend[] {
    return this.table.backends;
  }

  /**
   * The backend that answers what no collection owns: the document model
   * registry and the creation defaults. Those are properties of a reactor's
   * build, not of a drive, and merging several registries would hand a caller a
   * module some backend cannot execute.
   */
  get primary(): ReactorBackend {
    return this.table.backend(this.primaryName, "primaryBackend");
  }

  /** The collection id a drive identifier and branch name. */
  collectionFor(driveIdentifier: string, branch: string): DriveCollectionId {
    return DriveCollectionId.forDrive(
      driveIdentifier,
      branch === "" ? DEFAULT_BRANCH : branch,
    );
  }

  /**
   * Runs an operation on the backend that holds a DOCUMENT, re-aiming it on a
   * structured misroute.
   */
  onDocument<T>(
    label: string,
    identifier: string,
    run: (backend: ReactorBackend) => Promise<T>,
    options: AttemptOptions,
  ): Promise<T> {
    return this.attempt(this.documentTarget(label, identifier), run, options);
  }

  /**
   * Runs an operation on the backend that holds a COLLECTION (a drive and
   * branch), re-aiming it on a structured misroute.
   *
   * This is the path that exercises placement: a collection nothing has told
   * the router about is placed by the hash, and the table remembers whatever
   * the attempt proves.
   */
  onCollection<T>(
    label: string,
    driveIdentifier: string,
    branch: string,
    run: (backend: ReactorBackend) => Promise<T>,
    options: AttemptOptions,
  ): Promise<T> {
    const collection = this.collectionFor(driveIdentifier, branch);
    return this.attempt(
      this.collectionTarget(label, collection, driveIdentifier),
      run,
      options,
    );
  }

  /**
   * Runs an operation on a backend the caller has already chosen -- a placement
   * for a document that does not exist yet, or the primary.
   *
   * A misroute here has nowhere to go: the caller's choice was the whole
   * decision. It is still surfaced as a {@link MisrouteUnresolvedError} rather
   * than as a bare refusal, so a caller reads "this router could not place it"
   * instead of a backend-internal error.
   */
  onBackend<T>(
    label: string,
    backend: ReactorBackend,
    run: (backend: ReactorBackend) => Promise<T>,
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

  /** The backend an identifier resolves to right now, without running anything. */
  async resolveDocumentBackend(
    identifier: string,
    excluded: ReadonlySet<string> = new Set(),
  ): Promise<ReactorBackend> {
    const cached = this.table.documentBackend(identifier);
    if (cached !== "" && this.table.has(cached) && !excluded.has(cached)) {
      return this.table.backend(cached, `cached route for ${identifier}`);
    }
    const serving = await this.servingBackends(identifier, excluded);
    if (serving.length > 0) {
      const owner = serving[0];
      this.table.recordDocument(identifier, owner.name);
      return owner;
    }
    // Nothing serves it: either it does not exist yet (a create) or it is in
    // flight. Fall back to placement, and do NOT remember a guess.
    return this.table.standaloneRoute(identifier, excluded);
  }

  /** The backend a collection resolves to right now, without running anything. */
  async resolveCollectionBackend(
    collection: DriveCollectionId,
    excluded: ReadonlySet<string> = new Set(),
  ): Promise<ReactorBackend> {
    const route = this.table.collectionRoute(collection, excluded);
    if (route.source !== "placed") {
      return this.table.backend(
        route.backend,
        `route for ${route.collectionId}`,
      );
    }
    // A placement is a guess. Before acting on it, ask whether some backend
    // demonstrably holds the drive -- cheap, bounded, and the one piece of
    // positive evidence available until reactors can state ownership.
    const serving = await this.servingBackends(collection.driveId, excluded);
    if (serving.length > 0) {
      const owner = serving[0];
      this.table.recordLearnedCollection(collection, owner.name);
      this.table.recordDocument(collection.driveId, owner.name);
      return owner;
    }
    return this.table.backend(
      route.backend,
      `placement for ${route.collectionId}`,
    );
  }

  /**
   * The backends that serve the identifier, in the router's stable order.
   *
   * Asked concurrently. A document that sync has replicated onto several
   * backends is served by all of them, and the first in configuration order
   * wins -- a stable answer that does not move when an unrelated backend joins,
   * which matters because it decides where WRITES go.
   */
  async servingBackends(
    identifier: string,
    excluded: ReadonlySet<string> = new Set(),
  ): Promise<readonly ReactorBackend[]> {
    if (identifier === "") {
      return [];
    }
    const candidates = this.table.backends.filter(
      (backend) => !excluded.has(backend.name),
    );
    const settled = await Promise.all(
      candidates.map((backend) => this.serves(backend, identifier)),
    );
    const serving: ReactorBackend[] = [];
    for (let i = 0; i < settled.length; i++) {
      if (settled[i]) {
        serving.push(candidates[i]);
      }
    }
    return serving;
  }

  /** Remembers which backend a submitted job belongs to. */
  recordJob(jobId: string, backend: string): void {
    this.table.recordJob(jobId, backend);
  }

  /** Remembers that a document lives on a backend (a create, or a drive member). */
  recordDocument(identifier: string, backend: string): void {
    this.table.recordDocument(identifier, backend);
  }

  private async serves(
    backend: ReactorBackend,
    identifier: string,
  ): Promise<boolean> {
    try {
      const served = await backend.client.isServed(identifier);
      if (served) {
        return true;
      }
    } catch (error) {
      this.onDiagnostic(
        `ownership probe: ${backend.name} could not answer isServed(${identifier}) (${messageOf(error)})`,
        error,
      );
    }
    try {
      // A soft-deleted document is not served but its id is still taken, and
      // operations on it still have exactly one right destination.
      return await backend.client.isDocumentIdTaken(identifier);
    } catch {
      return false;
    }
  }

  private documentTarget(operation: string, identifier: string): RouteTarget {
    return {
      operation,
      subject: identifier,
      probeKey: identifier,
      select: (excluded) => this.resolveDocumentBackend(identifier, excluded),
      accepted: (backend, recovered) => {
        this.table.recordDocument(identifier, backend.name);
        if (recovered) {
          this.onDiagnostic(
            `misroute resolved: ${JSON.stringify(identifier)} is on ${backend.name}; the document route was corrected`,
          );
        }
      },
      refused: (backend, info) => {
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
      accepted: (backend, recovered) => {
        this.table.recordDocument(driveIdentifier, backend.name);
        if (!recovered) {
          this.table.recordLearnedCollection(collection, backend.name);
          return;
        }
        const override = this.table.overrideFor(collection);
        this.table.recordCorrectedCollection(collection, backend.name);
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

  /**
   * Believes a refusal that names the owner. A hint naming a backend this
   * router does not hold is reported and ignored rather than refused: the
   * refusal itself is already valid and recovery does not depend on the hint.
   */
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
    if (info.collectionId !== "") {
      this.applyCollectionHint(info);
    }
  }

  private applyCollectionHint(info: MisrouteInfo): void {
    let collection: DriveCollectionId;
    try {
      collection = DriveCollectionId.fromKey(info.collectionId);
    } catch {
      this.onDiagnostic(
        `misroute named collection ${JSON.stringify(info.collectionId)}, which is not a collection id; ignoring that field`,
      );
      return;
    }
    this.table.recordCorrectedCollection(collection, info.ownerHint);
  }

  /**
   * The retry loop. One attempt per backend the target selects, bounded by the
   * configured budget, every refusal recorded, and a refusal that outlasts the
   * budget raised as a {@link MisrouteUnresolvedError} -- never swallowed, and
   * never resolved as if the operation had happened.
   *
   * Stops short of the budget the moment `select(excluded)` has nothing new to
   * offer -- it returns a backend already in `excluded`. That is `select`
   * saying it is out of alternatives (an {@link onBackend} target always
   * returns the one backend the caller pinned, ignoring `excluded` entirely;
   * a table-backed target falls back to its placement answer once every
   * candidate is excluded), and re-running the operation against a backend
   * that already refused it once can only reproduce the same refusal. Burning
   * the rest of the budget on that guaranteed repeat is pure latency with no
   * chance of a different outcome, so the loop raises immediately instead.
   */
  private async attempt<T>(
    target: RouteTarget,
    run: (backend: ReactorBackend) => Promise<T>,
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
        const value = await run(backend);
        target.accepted(backend, attempt > 0);
        return value;
      } catch (error) {
        const info = misrouteOf(error);
        if (!info.misrouted) {
          if (!options.recoverOnError) {
            throw error;
          }
          const recovered = await this.recoverRead(target, backend, run, error);
          return recovered;
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

  /**
   * One bounded retry for a READ that failed without a structured misroute --
   * the shape of "the router aimed at a reactor that does not hold this
   * document", which the reactor reports as a plain not-found.
   *
   * Retried only on POSITIVE evidence: another backend has to answer that it
   * serves the target. Without that, the original error is raised unchanged, so
   * a genuine failure is never dressed up as a routing problem.
   */
  private async recoverRead<T>(
    target: RouteTarget,
    failed: ReactorBackend,
    run: (backend: ReactorBackend) => Promise<T>,
    error: unknown,
  ): Promise<T> {
    const serving = await this.servingBackends(
      target.probeKey,
      new Set([failed.name]),
    );
    if (serving.length === 0) {
      rethrow(error);
    }
    const owner = serving[0];
    const value = await run(owner);
    target.accepted(owner, true);
    return value;
  }
}
