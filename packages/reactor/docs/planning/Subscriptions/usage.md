# Usage

```tsx
// subscribe to changes through the subscription manager
const subscriptionManager: IReactorSubscriptionManager =
  new ReactorSubscriptionManager();

// (returns only ids)
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
