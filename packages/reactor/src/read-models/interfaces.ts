import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  PurgeDirective,
  PurgeFanOutOutcome,
  PurgeOutcome,
} from "../shared/purge-types.js";

/**
 * Generic interface for any read model that can index operations.
 * Implementations include IDocumentView, search indices, caches, etc.
 */
export interface IReadModel {
  /**
   * Unique name identifying this read model, used for lookup via getReadModel.
   */
  readonly name: string;

  /**
   * Indexes a list of operations into the read model.
   * This method is called asynchronously when operations are written to the operation store.
   *
   * @param operations - The operations with their context to index
   */
  indexOperations(operations: OperationWithContext[]): Promise<void>;
}

/**
 * Coordinates read model synchronization with operation writes.
 * Listens to operation events from the event bus and updates all registered read models.
 */
export interface IReadModelCoordinator {
  /**
   * All registered read models (pre-ready and post-ready).
   */
  readonly readModels: IReadModel[];

  /**
   * Start listening for operation events and updating read models.
   */
  start(): void;

  /**
   * Stop listening and clean up subscriptions.
   */
  stop(): void;

  /**
   * Resolves when every per-queueKey projection chain has flushed.
   * Intended for test fixtures and explicit shutdown.
   */
  drain(): Promise<void>;

  /**
   * Current number of in-flight per-queueKey projection chains.
   * Used as a backpressure signal by observability gauges.
   */
  getChainDepth(): number;
}

export type ReadModelRegistrationStage = "pre_ready" | "post_ready";

/**
 * Optional capability exposed by coordinators that support adding read models
 * after construction. Custom and remote coordinators are not required to
 * implement it.
 */
export interface ILiveReadModelCoordinator extends IReadModelCoordinator {
  addReadModel(readModel: IReadModel, stage: ReadModelRegistrationStage): void;
}

export function supportsLiveReadModelRegistration(
  coordinator: IReadModelCoordinator,
): coordinator is ILiveReadModelCoordinator {
  return (
    "addReadModel" in coordinator &&
    typeof coordinator.addReadModel === "function"
  );
}

/** Optional capability: removes a model's own rows for purged documents. */
export interface IDocumentPurgingReadModel extends IReadModel {
  purgeDocuments(
    ids: string[],
    directive: PurgeDirective,
  ): Promise<PurgeOutcome>;
}

/** A purging model that applies the purge journal against its own cursor. */
export interface IPurgeJournalReadModel extends IDocumentPurgingReadModel {
  /** Applies journal rows above the model's purge cursor; never throws. */
  reconcilePurges(): Promise<PurgeOutcome[]>;
}

/** Optional capability: fans a purge out to every model it coordinates. */
export interface IDocumentPurgingCoordinator extends IReadModelCoordinator {
  purgeDocuments(
    ids: string[],
    directive: PurgeDirective,
  ): Promise<PurgeFanOutOutcome>;
}

export function supportsDocumentPurge(
  x: unknown,
): x is IDocumentPurgingReadModel | IDocumentPurgingCoordinator {
  return (
    typeof x === "object" &&
    x !== null &&
    "purgeDocuments" in x &&
    typeof x.purgeDocuments === "function"
  );
}

export function supportsPurgeJournal(x: unknown): x is IPurgeJournalReadModel {
  return (
    supportsDocumentPurge(x) &&
    "reconcilePurges" in x &&
    typeof x.reconcilePurges === "function"
  );
}
