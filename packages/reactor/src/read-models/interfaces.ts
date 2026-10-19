import type { OperationWithContext } from "@powerhousedao/shared/document-model";

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

  /** Claims a batch as it queues; a sweep then leaves it to the live path. */
  reserveOperations?(operations: OperationWithContext[]): IReadModelReservation;
}

/** A batch a read model claimed while it waits on the coordinator's chain. */
export interface IReadModelReservation {
  /** Indexes the batch; at most once. */
  apply(): Promise<void>;
  /** Frees the claims of a batch that will not be applied. */
  release(): void;
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

  /** The models indexed on this thread; catch-up sweeps them. */
  indexedReadModels?(): readonly IReadModel[];
}

export type ReadModelRegistrationStage = "pre_ready" | "post_ready";

/**
 * Optional capability exposed by coordinators that support adding read models
 * after construction. Custom and remote coordinators are not required to
 * implement it.
 */
export interface ILiveReadModelCoordinator extends IReadModelCoordinator {
  addReadModel(readModel: IReadModel, stage: ReadModelRegistrationStage): void;
  /** Detaches this instance, not its name; false when it is not registered.
   * A batch it reserved and has not applied is released. */
  removeReadModel(readModel: IReadModel): boolean;
}

export function supportsLiveReadModelRegistration(
  coordinator: IReadModelCoordinator,
): coordinator is ILiveReadModelCoordinator {
  return (
    "addReadModel" in coordinator &&
    typeof coordinator.addReadModel === "function" &&
    "removeReadModel" in coordinator &&
    typeof coordinator.removeReadModel === "function"
  );
}
