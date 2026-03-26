# Subgraph Migration Guide (v6 Reactor)

:::tip
This guide covers the **breaking changes** to the GraphQL subgraph API introduced in the v6 Reactor. If you were querying the old `/graphql/document-drive` or `/graphql/system` endpoints, or building custom subgraphs, **this migration is required**.
:::

## Overview

The v6 Reactor replaced the legacy hardcoded subgraphs (`document-drive`, `system`) with a new architecture:

- **Reactor subgraph** (`/graphql/r`) — manages drives, documents, sync, and subscriptions
- **Document-model subgraphs** (`/graphql/<model-name>`) — auto-generated per document model, with namespaced queries and mutations
- **Custom subgraphs** — user-defined subgraphs now extend `BaseSubgraph` with `reactorClient`

## Endpoint changes

| Legacy endpoint           | v6 endpoint             | Notes                                   |
| ------------------------- | ----------------------- | --------------------------------------- |
| `/graphql/document-drive` | `/graphql/r`            | Drive and document management           |
| `/graphql/system`         | `/graphql/r`            | Sync operations moved to reactor        |
| `/graphql/<custom>`       | `/graphql/<custom>`     | Custom subgraphs still user-defined     |
| N/A                       | `/graphql/<model-name>` | New: auto-generated per document model  |
| `/graphql`                | `/graphql`              | Supergraph still combines all subgraphs |

## Querying and mutating documents

In v6, every operation can be done through the **reactor subgraph** (`/graphql/r`) — which is generic and works with any document type — or through a **document-model subgraph** (`/graphql/<model-name>`) — which is namespaced and type-specific. Both are shown below for each operation.

Document-model subgraphs are auto-generated for each registered document model and provide:

- `document(identifier)` — get a single document
- `documents(paging)` — list all documents of this type
- `findDocuments(search, view, paging)` — search within this type
- `documentChildren(parentIdentifier)` — filtered to this type
- `documentParents(childIdentifier)`
- `createDocument(name, parentIdentifier)` mutation
- Per-operation mutations (e.g. `addTodoItem(docId, input)`)
- Async variants of each mutation (e.g. `addTodoItemAsync(docId, input)`)

### Getting a drive and its contents

**Legacy:**

```graphql
# Legacy — /graphql/document-drive
query {
  drive {
    id
    name
    nodes {
      ... on FileNode {
        id
        name
        documentType
      }
      ... on FolderNode {
        id
        name
      }
    }
  }
}
```

**v6 (reactor subgraph):**

```graphql
# v6 — /graphql/r
query {
  document(identifier: "my-drive-slug") {
    document {
      id
      name
      documentType
      state
    }
    childIds
  }
}
```

**v6 (document-model subgraph):**

```graphql
# v6 — /graphql/document-drive (or via supergraph)
query {
  DocumentDrive {
    document(identifier: "my-drive-slug") {
      document {
        id
        name
        state {
          global {
            nodes { ... }
          }
        }
      }
    }
  }
}
```

### Listing children of a drive

**Legacy:** Children were returned inline via the `drive.nodes` field (see above).

**v6 (reactor subgraph):**

```graphql
# v6 — /graphql/r
query {
  documentChildren(parentIdentifier: "my-drive-slug") {
    items {
      id
      name
      documentType
      state
    }
    totalCount
    hasNextPage
  }
}
```

**v6 (document-model subgraph):** To get only children of a specific type (e.g. todo lists):

```graphql
# v6 — /graphql/to-do-list (or via supergraph)
query {
  ToDoList {
    documentChildren(parentIdentifier: "my-drive-slug") {
      items {
        id
        name
        state {
          global {
            items {
              id
              text
              checked
            }
          }
        }
      }
      totalCount
    }
  }
}
```

### Finding documents by type

**Legacy:** Not directly available — required iterating `drive.nodes` and filtering by `documentType`.

**v6 (reactor subgraph):**

```graphql
# v6 — /graphql/r
query {
  findDocuments(search: { type: "powerhouse/todo-list" }) {
    items {
      id
      name
      state
    }
    totalCount
  }
}
```

**v6 (document-model subgraph):** The type filter is built in:

```graphql
# v6 — /graphql/to-do-list (or via supergraph)
query {
  ToDoList {
    documents {
      items {
        id
        name
        state {
          global {
            items {
              id
              text
              checked
            }
          }
        }
      }
      totalCount
    }
  }
}
```

### Getting a single document

**Legacy:**

```graphql
# Legacy — /graphql/document-drive
query {
  document(id: "abc123") {
    id
    name
    # ... limited to drive-level fields
  }
}
```

**v6 (reactor subgraph):**

```graphql
# v6 — /graphql/r
query {
  document(identifier: "abc123") {
    document {
      id
      name
      documentType
      state
    }
    childIds
  }
}
```

**v6 (document-model subgraph):**

```graphql
# v6 — /graphql/to-do-list (or via supergraph)
query {
  ToDoList {
    document(identifier: "abc123") {
      document {
        id
        name
        state {
          global {
            items {
              id
              text
              checked
            }
          }
        }
      }
    }
  }
}
```

### Creating a drive

**Legacy:**

```graphql
# Legacy — /graphql/document-drive
mutation {
  addDrive(name: "tutorial") {
    id
    name
  }
}
```

**v6 (reactor subgraph):**

```graphql
# v6 — /graphql/r
mutation {
  createDocument(
    document: { documentType: "powerhouse/document-drive", name: "tutorial" }
  ) {
    id
    name
  }
}
```

**v6 (document-model subgraph):**

```graphql
# v6 — /graphql/document-drive (or via supergraph)
mutation {
  DocumentDrive {
    createDocument(name: "tutorial") {
      id
      name
    }
  }
}
```

### Creating a document

In the legacy system, documents were created indirectly through drive operations or via Connect's internal APIs. In v6, documents are created directly.

**v6 (reactor subgraph):**

```graphql
# v6 — /graphql/r
mutation {
  createDocument(
    document: { documentType: "powerhouse/todo-list", name: "My List" }
    parentIdentifier: "my-drive-slug"
  ) {
    id
    name
  }
}
```

**v6 (document-model subgraph):**

```graphql
# v6 — /graphql/to-do-list (or via supergraph)
mutation {
  ToDoList {
    createDocument(name: "My List", parentIdentifier: "my-drive-slug") {
      id
      name
    }
  }
}
```

### Applying operations to a document

In the legacy system, document operations were applied through strand-based push/pull via the `system` subgraph. In v6, operations are applied directly.

**v6 (reactor subgraph):**

```graphql
# v6 — /graphql/r
mutation {
  mutateDocument(
    documentIdentifier: "abc123"
    actions: [
      {
        type: "ADD_TODO_ITEM"
        input: { text: "Buy milk" }
        scope: "global"
        id: "op-1"
        timestampUtcMs: "1711900000000"
      }
    ]
  ) {
    id
    name
    state
  }
}
```

**v6 (document-model subgraph):**

```graphql
# v6 — /graphql/to-do-list (or via supergraph)
mutation {
  ToDoList {
    addTodoItem(docId: "abc123", input: { text: "Buy milk" }) {
      id
      state {
        global {
          items {
            id
            text
            checked
          }
        }
      }
    }
  }
}
```

## Sync API changes

### Legacy: system subgraph (strand-based sync)

The old `system` subgraph provided strand-based synchronization via pull-responder listeners:

```graphql
# Legacy — /graphql/system
mutation {
  registerPullResponderListener(filter: {
    documentType: ["powerhouse/todo-list"]
    branch: ["main"]
  }) {
    # returned a Listener object
  }
}

query {
  system {
    sync {
      strands(listenerId: "listener-123") {
        driveId
        documentId
        scope
        branch
        operations {
          type
          input
          index
          hash
          timestamp
        }
      }
    }
  }
}
```

### v6: Channel-based sync

The v6 reactor replaces the strand/listener model with channel-based sync and real-time subscriptions:

```graphql
# v6 — /graphql/r
mutation {
  touchChannel(
    input: {
      id: "channel-1"
      name: "my-sync"
      collectionId: "drive-id"
      filter: { documentId: ["*"], scope: ["global"], branch: "main" }
      sinceTimestampUtcMs: "0"
    }
  ) {
    success
    ackOrdinal
  }
}

query {
  pollSyncEnvelopes(channelId: "channel-1", outboxAck: 0, outboxLatest: 100) {
    envelopes {
      type
      operations {
        operation {
          index
          hash
          action {
            type
            input
            scope
          }
        }
        context {
          documentId
          documentType
          scope
          branch
          ordinal
        }
      }
    }
    ackOrdinal
  }
}
```

Real-time updates are available via GraphQL subscriptions:

```graphql
subscription {
  documentChanges(search: { type: "powerhouse/todo-list" }) {
    type # CREATED, UPDATED, DELETED, etc.
    documents {
      id
      name
      state
    }
  }
}
```

## Query mapping reference

| Legacy query/mutation           | v6 equivalent                                                                  | Subgraph               |
| ------------------------------- | ------------------------------------------------------------------------------ | ---------------------- |
| `drive`                         | `document(identifier: driveSlug)`                                              | reactor (`/graphql/r`) |
| `drives`                        | `findDocuments(search: { type: "powerhouse/document-drive" })`                 | reactor                |
| `document(id)`                  | `document(identifier)`                                                         | reactor                |
| `documents`                     | `findDocuments()`                                                              | reactor                |
| `addDrive(name)`                | `createDocument(document: { documentType: "powerhouse/document-drive", ... })` | reactor                |
| `system { sync { strands } }`   | `pollSyncEnvelopes(channelId, ...)`                                            | reactor                |
| `registerPullResponderListener` | `touchChannel(input: {...})`                                                   | reactor                |
| `pushUpdates`                   | `pushSyncEnvelopes(envelopes: [...])`                                          | reactor                |
| N/A (new)                       | `<ModelName> { document(...) }`                                                | document-model         |
| N/A (new)                       | `<ModelName> { createDocument(...) }`                                          | document-model         |
| N/A (new)                       | `<ModelName> { <operationName>(docId, input) }`                                | document-model         |

## Migrating custom subgraphs

### Legacy pattern

Custom subgraphs exported a `resolvers` object and a `typeDefs` string, using `ctx.driveServer` for data access:

```typescript
// Legacy custom subgraph
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import { Context } from "../types";

export const typeDefs = `
  type Query {
    myCustomQuery(driveId: String!): [String!]!
  }
`;

export const resolvers: GraphQLResolverMap<Context> = {
  Query: {
    myCustomQuery: async (_parent, args, ctx: Context) => {
      const drive = await ctx.driveServer.getDrive(args.driveId);
      // ... process drive data
      return results;
    },
  },
};
```

### v6 pattern

Custom subgraphs now use `getResolvers(subgraph: BaseSubgraph)` and access data through `subgraph.reactorClient`:

```typescript
// v6 custom subgraph — subgraphs/my-custom/resolvers.ts
import type { BaseSubgraph } from "@powerhousedao/reactor-api";

export const getResolvers = (subgraph: BaseSubgraph) => {
  const reactorClient = subgraph.reactorClient;

  return {
    Query: {
      myCustomQuery: async (_parent: unknown, args: { driveId: string }) => {
        const children = await reactorClient.getChildren(args.driveId);
        // ... process documents
        return results;
      },
    },
  };
};
```

```typescript
// v6 custom subgraph — subgraphs/my-custom/schema.ts
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  type Query {
    myCustomQuery(driveId: String!): [String!]!
  }
`;
```

Generate the scaffolding with:

```bash
ph generate --subgraph my-custom
```

### Key differences

| Aspect               | Legacy                          | v6                                              |
| -------------------- | ------------------------------- | ----------------------------------------------- |
| Data access          | `ctx.driveServer`               | `subgraph.reactorClient`                        |
| Schema format        | Template literal string         | `gql` tagged template (`DocumentNode`)          |
| Resolver export      | `export const resolvers`        | `export const getResolvers = (subgraph) => ...` |
| Relational DB access | Not available                   | `subgraph.relationalDb`                         |
| File structure       | `resolvers.ts` + `type-defs.ts` | `resolvers.ts` + `schema.ts` + `index.ts`       |
| Registration         | Manual                          | Automatic via `ph generate`                     |

## Migration checklist

- [ ] Update all GraphQL client queries that target `/graphql/document-drive` to use `/graphql/r` or the appropriate document-model subgraph
- [ ] Replace `drive` queries with `document(identifier)` or `findDocuments`
- [ ] Replace strand-based sync (`registerPullResponderListener`, `system.sync.strands`) with `touchChannel` + `pollSyncEnvelopes`
- [ ] For real-time updates, use `documentChanges` subscription instead of polling strands
- [ ] Migrate custom subgraphs to `getResolvers(subgraph: BaseSubgraph)` pattern
- [ ] Replace `ctx.driveServer` calls with `subgraph.reactorClient` methods
- [ ] Update schema files from plain strings to `gql` tagged templates
- [ ] Regenerate custom subgraph scaffolding with `ph generate --subgraph <name>`
