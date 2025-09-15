import type { PHDocument } from "document-model";
import type {
  PagedResults,
  RelationshipChangeType,
  SearchFilter,
  ViewFilter,
} from "../shared/types.js";

/**
 * Error handler for subscription callback errors
 */
export interface ISubscriptionErrorHandler {
  /**
   * Called when a subscription callback throws an error
   * @param error - The error that was thrown
   * @param context - Context about which subscription failed
   */
  handleError(error: unknown, context: SubscriptionErrorContext): void;
}

/**
 * Context information about a subscription error
 */
export interface SubscriptionErrorContext {
  /** The type of event that was being processed */
  eventType: "created" | "deleted" | "updated" | "relationshipChanged";
  /** The subscription ID that failed */
  subscriptionId: string;
  /** Optional additional data about the event */
  eventData?: unknown;
}

/**
 * Interface for subscribing to document events in the reactor.
 */
export interface IReactorSubscriptionManager {
  /**
   * Subscribes to document creation events
   *
   * @param callback - Function called when documents are created
   * @param search - Optional search filter to limit which documents trigger events
   * @param view - Optional filter containing branch and scopes information
   * @returns A function that unsubscribes from the events
   */
  onDocumentCreated(
    callback: (result: PagedResults<string>) => void,
    search?: SearchFilter,
  ): () => void;

  /**
   * Subscribes to document deletion events
   *
   * @param callback - Function called when documents are deleted
   * @param search - Optional search filter to limit which documents trigger events
   * @returns A function that unsubscribes from the events
   */
  onDocumentDeleted(
    callback: (documentIds: string[]) => void,
    search?: SearchFilter,
  ): () => void;

  /**
   * Subscribes to document state updates
   *
   * @param callback - Function called when documents are updated
   * @param search - Optional search filter to limit which documents trigger events
   * @param view - Optional filter containing branch and scopes information
   * @returns A function that unsubscribes from the events
   */
  onDocumentStateUpdated(
    callback: (result: PagedResults<PHDocument>) => void,
    search?: SearchFilter,
    view?: ViewFilter,
  ): () => void;

  /**
   * Subscribes to parent-child relationship change events
   *
   * @param callback - Function called when parent-child relationships change
   * @param search - Optional search filter to limit which documents trigger events
   * @returns A function that unsubscribes from the events
   */
  onRelationshipChanged(
    callback: (
      parentId: string,
      childId: string,
      changeType: RelationshipChangeType,
    ) => void,
    search?: SearchFilter,
  ): () => void;
}
