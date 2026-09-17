---
title: Read models
---

# Read models

A read model projects document state into a queryable shape.

Register it on the builder:

```ts
const reactor = await new ReactorBuilder()
  .withReadModel(new DocumentCountReadModel())
  .build();
```

The `IReadModel` interface has two members:   `onOperations`   and
`query`. Both are called by the reactor after each batch.

Errors thrown from `onOperations` are logged and swallowed.
