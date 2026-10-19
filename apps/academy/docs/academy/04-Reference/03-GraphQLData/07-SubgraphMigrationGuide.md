# Subgraph migration guide

:::tip
The v5-to-v6 Reactor upgrade changed client endpoints and document arguments. Use the client guide below if you still query the v5 `/graphql/document-drive` or `/graphql/system` APIs. The later [class-authoring migration](#migrate-a-subgraph-class) preserves existing v6 endpoints.
:::

## v5-to-v6 client migration

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

- `document(idOrSlug)` — get a single document
- `documents(paging)` — list all documents of this type
- `findDocuments(search, view, paging)` — search within this type
- `documentOutgoingRelationships(sourceIdOrSlug, relationshipType)` — filtered to this type
- `documentIncomingRelationships(targetIdOrSlug, relationshipType)`
- `createDocument(name, parentIdOrSlug)` mutation
- Per-operation mutations (e.g. `addTodoItem(documentIdOrSlug, input)`)
- Async variants of each mutation (e.g. `addTodoItemAsync(documentIdOrSlug, input)`)

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
  document(idOrSlug: "my-drive-slug") {
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
    document(idOrSlug: "my-drive-slug") {
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
  documentOutgoingRelationships(
    sourceIdOrSlug: "my-drive-slug"
    relationshipType: "child"
  ) {
    items {
      id
      name
      documentType
      state
    }
    hasNextPage
  }
}
```

**v6 (document-model subgraph):** To get only children of a specific type (e.g. todo lists):

```graphql
# v6 — /graphql/to-do-list (or via supergraph)
query {
  ToDoList {
    documentOutgoingRelationships(
      sourceIdOrSlug: "my-drive-slug"
      relationshipType: "child"
    ) {
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
      hasNextPage
      cursor
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
    hasNextPage
    cursor
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
      hasNextPage
      cursor
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
  document(idOrSlug: "abc123") {
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
    document(idOrSlug: "abc123") {
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
    parentIdOrSlug: "my-drive-slug"
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
    createDocument(name: "My List", parentIdOrSlug: "my-drive-slug") {
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
  execute(
    documentIdOrSlug: "abc123"
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
    addTodoItem(documentIdOrSlug: "abc123", input: { text: "Buy milk" }) {
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
| `drive`                         | `document(idOrSlug: driveSlug)`                                                | reactor (`/graphql/r`) |
| `drives`                        | `findDocuments(search: { type: "powerhouse/document-drive" })`                 | reactor                |
| `document(id)`                  | `document(idOrSlug)`                                                           | reactor                |
| `documents`                     | `findDocuments()`                                                              | reactor                |
| `addDrive(name)`                | `createDocument(document: { documentType: "powerhouse/document-drive", ... })` | reactor                |
| `system { sync { strands } }`   | `pollSyncEnvelopes(channelId, ...)`                                            | reactor                |
| `registerPullResponderListener` | `touchChannel(input: {...})`                                                   | reactor                |
| `pushUpdates`                   | `pushSyncEnvelopes(envelopes: [...])`                                          | reactor                |
| N/A (new)                       | `<ModelName> { document(...) }`                                                | document-model         |
| N/A (new)                       | `<ModelName> { createDocument(...) }`                                          | document-model         |
| N/A (new)                       | `<ModelName> { <operationName>(documentIdOrSlug, input) }`                     | document-model         |

## Migrate a subgraph class

Upgrade your subgraph authoring code before its next build. A converted subgraph keeps its route name, so the host serves it at the same HTTP and GraphQL endpoints and WebSocket and SSE mounts. `ph migrate` converts only the class shapes listed in this section and refuses every other class. It also refuses a class that package code can reach through a module namespace used other than to read a named member. Review and test each converted subgraph.

### Convert the package

1. Upgrade the CLI and `@powerhousedao/reactor-api` together. Use a host that supports the new subgraph protocol.
2. Run `ph migrate --subgraphs-only` in the package root to convert subgraphs without upgrading packages or bundling migrations. Plain `ph migrate` also converts subgraphs before its other migrations. The transform converts the released template and the hand edits listed after these steps into `schema.graphql(...)`.
   For each converted module, migration keeps its barrel namespace export (such as `export * as BillingSubgraph from "./billing/index.js"`), so its other exports remain reachable. It adds a direct class export and `SubgraphCheck` alongside the namespace, using an alias when the namespace already takes the class name. Namespace exports for modules that were not converted stay unchanged.
3. Review each converted class. Preserve the route name as `static override readonly subgraphName = "existing-name"`. Put SDL, resolver coordinates, and the resolver factory in `getSchema(schema: SchemaBuilder<YourClass>)`.
4. Move instance access into the factory's `subgraph` parameter. Remove instance schema fields, custom path configuration, and the subscription flag. The host derives subscriptions from the schema's operation roots.
5. Make lifecycle methods overrides that call `super`. Make teardown safe after partial setup. `onDisconnect` runs when the subgraph is unregistered while the process continues. It is not a process-exit hook.
6. Export concrete classes through the package's `subgraphs/index.ts` and `subgraphs/*/index.ts` entries. Remove subgraph entries from `definitionSources`, which now covers document models only.
7. Run `ph model check`, `ph build`, and your resolver tests. Compare your schema and resolver coordinates with the previous package before publishing.

The codemod generates resolver coordinates and removes the released resolver factory's `Record<string, unknown>` return annotation so TypeScript can infer its map. It keeps the constructor and lifecycle code. It marks `onSetup` and `onDisconnect` as `override`, and inserts `await super.onSetup()` or `await super.onDisconnect()` at the start of a hook that does not call it. It converts a class only when the class has the shape of the released template or of these hand edits:

- `name` is a lowercase kebab-case string literal. `typeDefs` is a `gql` literal from `graphql-tag`, written inline or held in an imported or module `const`. `hasSubscriptions`, `path`, and `additionalContextFields` hold literals or imported or module `const` values.
- `resolvers` is an inline resolver map, or a call such as `getResolvers(this)` to a factory declared as a named function or `const`. The factory can come through an import, a re-export alias, a star barrel, or a default export. Classes can share one factory.
- The factory takes no parameter, or one `subgraph` parameter without a type or typed as `BaseSubgraph`, the subgraph class, `any`, or `unknown`. Its body can declare `const reactor = subgraph.reactorClient` for any service that the `BaseSubgraph` constructor sets. Then it returns a resolver map.
- A resolver map is an object literal that can contain other object literals. Each value in it is a function, a method, a literal, or an identifier that names an import or a module `const`, written as `example: example` or as the shorthand `{ example }`. An identifier value must be callable, such as an imported `function` declaration or a `const` arrow function. The exception is the value for a scalar type, such as `Date: DateScalar`.
- Resolver functions can read the request context, `this.member`, `subgraph.member`, and `subgraphName`. An inline resolver map does not use the class's `super`. Elsewhere, instance code uses `this` only as `this.member` or as the factory argument. It never assigns a `BaseSubgraph` service such as `reactorClient`. That rules out `=`, compound assignment, `++` and `--`, `delete`, destructuring targets, and `for...of` and `for...in` heads. Other fields, the constructor, and lifecycle method bodies stay as written apart from the inserted `super` call, so `onSetup` can await `this.reactorClient`.

Migrate refuses every other class before it edits any file, and reports each refusal with its file and line. Migration removes the `name`, `typeDefs`, `resolvers`, `hasSubscriptions`, `path`, and `additionalContextFields` fields, so it also refuses a matching class that package code, including the class body, references outside its declaration, an import or export, or its factory's parameter type. For example, `new`, `instanceof`, a type annotation, or passing the class as a value refuses it. It also refuses a matching class that a namespace exposes through `import * as`, a named import of an `export * as` namespace, `import()`, or `require` when package code uses that namespace other than in an export or to read a named member such as `ns.schema` or `ns["schema"]`, for example in `Object.values(ns)`, a spread, an argument, a loop, or a dynamic key such as `ns[key]`. An `import()` or `require` whose path is neither a string literal nor a template literal without substitutions, anywhere in the package, refuses every matching migration candidate, because migrate can't tell which module it loads. It also refuses a matching class when other package code uses its factory, and when its factory needs an edit in a file that contains a refused class. A file that contains a refused class stays unchanged. Read `subgraphName` where code read `name`.

Fix the reported cause and run the migration again, or migrate the class by hand.

Use [Subgraph classes](./08-SubgraphClasses.md) for typed entries, the SDL wrapper, and inheritance examples. A former config-function declaration also becomes a `BaseSubgraph<Ctx>` subclass. The subgraph generation command has no style flag. The document-model `--code-first` option stays.

### Fix authoring errors

`ph build` checks TypeScript before definition validation. These errors can appear before the coded migration diagnostic.

| Error                                                                                | Fix                                                                       |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| TS2416 on `name`, `typeDefs`, `resolvers`, `hasSubscriptions`, or `path`             | Old-style subgraph. Run `ph migrate`, review the conversion, and rebuild. |
| TS2540 when assigning `name`, `typeDefs`, `resolvers`, `hasSubscriptions`, or `path` | Old-style subgraph. Run `ph migrate`, review the conversion, and rebuild. |

### Reuse code

Move shared state and hooks into one abstract base without a name. Use plain schema fragments with public capability interfaces. Do not use mixin factories. Preserve a typed parent's entries with `...super.getSchema(schema)`. Call `schema.replaceParentSchema()` when replacing the parent schema intentionally. Typed entries and SDL cannot be mixed, including across inheritance.

A concrete literal-name parent cannot be renamed by a subclass (TS2417). Use an abstract base, or declare the extensible parent's name with `: string` and accept runtime-only name validation. A `SubgraphCheck` wrong-class assertion means `SchemaBuilder<X>` names the wrong instance type.

### Host and package compatibility

| Host     | Package                     | Result                                                                                                                         |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| New host | Published old-style package | Served through the legacy adapter. One development-only notice per class points to `ph migrate`. No production console notice. |
| New host | New class-based package     | Served through protocol version 1.                                                                                             |
| Old host | New class-based package     | Unsupported. Use matching CLI, package, and host API releases.                                                                 |

Compatibility for published packages does not permit old authoring code in developer tooling. Build, check, generate, publish, prepack, and Vetra reject it with migration guidance. Nameless classes are refused unless they are shared ancestors of exported concrete classes in the same entry.

SDL that declares a subscription root now gets WebSocket and SSE support even if the old package omitted its subscription flag. Existing mounts keep their paths.

## Migration checklist

- [ ] Point v5 clients at `/graphql/r` or the appropriate document-model subgraph.
- [ ] Use `idOrSlug`, `sourceIdOrSlug`, `targetIdOrSlug`, and `documentIdOrSlug` for v6 document arguments.
- [ ] Replace strand-based sync with `touchChannel` and `pollSyncEnvelopes`.
- [ ] Use `documentChanges` for real-time updates.
- [ ] Convert custom subgraphs to `BaseSubgraph` classes with static `getSchema`.
- [ ] Run `ph model check`, `ph build`, and resolver tests before publishing.
