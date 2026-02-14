import type { OperationWithContext } from "shared/document-model";

/**
 * Generic interface for any read model that can index operations.
 * Implementations include IDocumentView, search indices, caches, etc.
 */
export interface IReadModel {
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
   * Start listening for operation events and updating read models.
   */
  start(): void;

  /**
   * Stop listening and clean up subscriptions.
   */
  stop(): void;
}
