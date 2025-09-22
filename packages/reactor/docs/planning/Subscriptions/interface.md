# Interface

## Core Subscription Interface

```tsx
/**
 * Interface for subscribing to document events in the reactor.
 */
interface IReactorSubscriptionManager {
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
```

## Error Handling

The subscription manager requires an error handler to manage subscription callback errors. This ensures guaranteed delivery to all subscribers even when individual callbacks fail.

### Error Handler Interface

```tsx
/**
 * Error handler for subscription callback errors
 */
interface ISubscriptionErrorHandler {
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
interface SubscriptionErrorContext {
  /** The type of event that was being processed */
  eventType: "created" | "deleted" | "updated" | "relationshipChanged";

  /** The subscription ID that failed */
  subscriptionId: string;

  /** Optional additional data about the event */
  eventData?: unknown;
}
```

### Default Error Handler

The framework provides a `DefaultSubscriptionErrorHandler` that re-throws errors with enhanced context:

```tsx
class DefaultSubscriptionErrorHandler implements ISubscriptionErrorHandler {
  handleError(error: unknown, context: SubscriptionErrorContext): void {
    // Re-throws the error with additional context information
    // Preserves original stack traces for debugging
  }
}
```

### Custom Error Handlers

You can implement custom error handlers for different behaviors:

```tsx
// Example: Logging error handler
class LoggingErrorHandler implements ISubscriptionErrorHandler {
  handleError(error: unknown, context: SubscriptionErrorContext): void {
    console.error(`Subscription error in ${context.eventType}:`, error);

    // Could also send to monitoring service
  }
}

// Example: Silent error handler
class SilentErrorHandler implements ISubscriptionErrorHandler {
  handleError(error: unknown, context: SubscriptionErrorContext): void {
    // Silently ignore errors (not recommended for production)
  }
}
```
