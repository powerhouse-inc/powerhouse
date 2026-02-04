# Usage

## Basic Setup

```tsx
import { 
  ReactorSubscriptionManager,
  DefaultSubscriptionErrorHandler,
  createDefaultSubscriptionErrorHandler
} from '@powerhousedao/reactor';

// Option 1: Use the default error handler (re-throws errors)
const errorHandler = createDefaultSubscriptionErrorHandler();
const subscriptionManager = new ReactorSubscriptionManager(errorHandler);

// Option 2: Create a custom error handler
const customErrorHandler: ISubscriptionErrorHandler = {
  handleError(error: unknown, context: SubscriptionErrorContext) {
    console.error(`Subscription error in ${context.eventType}:`, error);
    // Send to monitoring service, etc.
  }
};
const subscriptionManager = new ReactorSubscriptionManager(customErrorHandler);

// Option 3: Use ReactorClientBuilder (provides defaults)
const client = new ReactorClientBuilder()
  .withReactor(reactor)
  .withSigner(signer)
  // If no subscription manager provided, builder creates one with default error handler
  .build();

```

## Subscribing to Events

```tsx
// Subscribe to document creation events (returns only ids)
const unsubscribeCreated = subscriptionManager.onDocumentCreated(
  (result) => {
    console.log(`Documents ids created: ${result.results}`);
  },
  { type: "Task" },
);

// (returns full documents, since we need a view filter to determine whether or
// not it was an update)
const unsubscribeUpdated = subscriptionManager.onDocumentStateUpdated(
  (result) => {
    console.log("Documents updated:", result.results);
  },
  { parentId: "project-123" },
  { branch: "main" },
);

// Subscribe to relationship changes (returns parentId, childId, changeType)
const unsubscribeRelationship = subscriptionManager.onRelationshipChanged(
  (parentId, childId, changeType) => {
    if (changeType === RelationshipChangeType.Added) {
      console.log(`Document ${childId} was added to parent ${parentId}`);
    } else {
      console.log(`Document ${childId} was removed from parent ${parentId}`);
    }
  },
);

// Later, unsubscribe when no longer needed
unsubscribeCreated();
unsubscribeUpdated();
unsubscribeRelationship();
```

## Error Handling Examples

### Handling Errors in Callbacks

With the default error handler, errors in callbacks will be re-thrown:

```tsx
// This will cause the error to be re-thrown with context
const errorHandler = createDefaultSubscriptionErrorHandler();
const manager = new ReactorSubscriptionManager(errorHandler);

manager.onDocumentCreated((result) => {
  throw new Error("Something went wrong!"); // Will be re-thrown
});
```

### Custom Error Recovery

```tsx
// Custom handler that logs but doesn't re-throw
const recoveryHandler: ISubscriptionErrorHandler = {
  handleError(error: unknown, context: SubscriptionErrorContext) {
    console.error(`Error in ${context.eventType} subscription ${context.subscriptionId}:`, error);
    
    // Could implement recovery logic based on error type
    if (context.eventType === 'created' && isRetryableError(error)) {
      // Schedule retry logic
      scheduleRetry(context);
    }
  }
};

const manager = new ReactorSubscriptionManager(recoveryHandler);
```

### Monitoring and Alerting

```tsx
// Handler that sends errors to monitoring service
const monitoringHandler: ISubscriptionErrorHandler = {
  handleError(error: unknown, context: SubscriptionErrorContext) {
    // Log locally
    console.error(`Subscription error:`, { error, context });
    
    // Send to monitoring service
    sendToSentry(error, {
      tags: {
        eventType: context.eventType,
        subscriptionId: context.subscriptionId
      },
      extra: {
        eventData: context.eventData
      }
    });
  }
};
```

## Guaranteed Delivery

The subscription manager guarantees that all subscribers receive notifications even if some fail:

```tsx
const manager = new ReactorSubscriptionManager(customErrorHandler);

// Subscribe multiple callbacks
manager.onDocumentCreated(callback1); // Works fine
manager.onDocumentCreated(callback2); // Throws error
manager.onDocumentCreated(callback3); // Still receives notification

// When documents are created:
// 1. callback1 receives notification ✓
// 2. callback2 throws error → handled by error handler
// 3. callback3 still receives notification ✓
```
