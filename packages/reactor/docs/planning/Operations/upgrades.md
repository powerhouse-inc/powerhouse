# Upgrades

### Summary

Document Model upgrades provide a systematic approach to versioning and backward compatibility.

In Reactor, Actions act much like typical Command objects in the Event Sourcing architecture and Operations act much like Events.

However, unlike typical ES approaches, Operations _are never upcasted_. That is, version upgrades never mutate Operations. Instead, every `Action` must be executed by a specific version of the corresponding document model library to result in the expected `Operation`.

Operations are then decoupled from versioning, as the `Action` holds this information.

### Flow

Suppose we have a document of type `ph/todo`.

1. First, we create a new document:

```tsx
import { createDocument } from "ph/todo";

const doc = await createDocument({
  title: "My Todo List",
});
```

This creates a new document with one action:

```tsx
[
  {
    type: "ACTION_UPGRADE",
    version: "0",
    input: {
      
    },
    scope: "global",
  }
]
```


