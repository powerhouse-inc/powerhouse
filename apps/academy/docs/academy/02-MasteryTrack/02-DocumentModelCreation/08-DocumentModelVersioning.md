# Document Model Versioning

:::tip
This chapter covers **advanced document model versioning**—a system for evolving document schemas and operations while maintaining backward compatibility with existing documents. This is essential when your document models need to change over time in production environments.
:::

## Why Versioning?

Document models in Powerhouse are **event-sourced**. Once a document is created with a certain schema (v1), and operations are applied to it, you can't simply change the schema without breaking existing documents. Versioning solves this problem by allowing you to:

- **Add new fields** to the state schema
- **Add new operations** to the document model
- **Modify reducer logic** for new documents
- **Automatically upgrade** old documents to new versions when needed

:::info **Definition: What is Document Model Versioning?**
Document Model Versioning is a system that allows multiple versions of the same document model to coexist. Each version has its own schema, operations, and reducers. Documents created with older versions continue to work with their original reducers, while new documents use the latest version. Upgrade manifests define how to migrate documents between versions.
:::

---

## How Versioning Works

### The Problem It Solves

Consider a simple Todo document model:

**Version 1 State:**
```graphql
type TodoState {
  todos: [Todo!]!
}
```

Now you want to add a `title` field to track the list's name:

**Version 2 State:**
```graphql
type TodoState {
  title: String
  todos: [Todo!]!
}
```

Without versioning, existing v1 documents would break because they don't have a `title` field. With versioning:
- V1 documents continue to work with the v1 reducer
- New documents are created with v2
- V1 documents can be **upgraded** to v2 when needed

### Key Components

Document model versioning consists of four key components:

| Component | Purpose |
|-----------|---------|
| **Version Folders** | Separate `v1/`, `v2/` directories containing version-specific code |
| **DocumentModelModule** | Each version exports a module with explicit `version` number |
| **Upgrade Manifest** | Declares supported versions and upgrade paths |
| **Upgrade Reducer** | Transforms document state from one version to another |

---

## Folder Structure

When versioning is enabled, the document model generator creates a versioned folder structure:

```
document-models/
└── todo/
    ├── v1/                          # Version 1
    │   ├── gen/                     # Auto-generated code (DO NOT EDIT)
    │   │   ├── reducer.ts
    │   │   ├── creators.ts
    │   │   ├── schema/types.ts      # V1 TypeScript types
    │   │   └── ...
    │   ├── src/
    │   │   └── reducers/            # Your v1 reducer implementations
    │   │       └── todo-operations.ts
    │   └── module.ts                # Exports DocumentModelModule with version: 1
    │
    ├── v2/                          # Version 2
    │   ├── gen/
    │   │   └── schema/types.ts      # V2 TypeScript types (includes 'title')
    │   ├── src/
    │   │   └── reducers/
    │   └── module.ts                # Exports DocumentModelModule with version: 2
    │
    ├── upgrades/                    # Migration logic
    │   ├── versions.ts              # Supported versions list
    │   ├── v2.ts                    # Upgrade reducer: v1 → v2
    │   └── upgrade-manifest.ts      # Ties everything together
    │
    └── document-models.ts           # Exports all versions + manifests
```

---

## Core Type Definitions

Understanding the underlying types helps you implement versioning correctly:

### UpgradeTransition

Defines a single version upgrade:

```typescript
type UpgradeTransition = {
  toVersion: number;
  upgradeReducer: UpgradeReducer<any, any>;
  description?: string;
};
```

### UpgradeManifest

Declares all supported versions and their upgrade paths:

```typescript
type UpgradeManifest<TVersions extends readonly number[]> = {
  documentType: string;
  latestVersion: number;
  supportedVersions: TVersions;
  upgrades: {
    // Keys are "v2", "v3", etc. (never "v1" - nothing to upgrade from)
    [V in Exclude<TupleMember<TVersions>, 1> as `v${V}`]: UpgradeTransition;
  };
};
```

---

## Implementation Guide

### Step 1: Enable Versioning in Code Generation

When using the Powerhouse CLI, enable versioning with the `--use-versioning` flag:

```bash
ph generate TodoList.phd --use-versioning
```

Or when using Vetra Studio, versioning support is configured in your project settings.

### Step 2: Version Configuration Files

**versions.ts** - Declare supported versions:

```typescript
// upgrades/versions.ts
export const supportedVersions = [1, 2] as const;
export const latestVersion = supportedVersions[1];  // 2
```

### Step 3: Document Model Module

Each version exports a `DocumentModelModule` with an explicit version number:

```typescript
// v1/module.ts
import type { DocumentModelModule } from "document-model";
import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import { actions, documentModel, reducer, utils } from "./gen/index.js";

export const Todo: DocumentModelModule<TodoPHState> = {
  version: 1,           // Explicit version number
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
```

```typescript
// v2/module.ts
export const Todo: DocumentModelModule<TodoPHState> = {
  version: 2,           // Different version
  reducer,
  actions,
  utils,
  documentModel: createState(defaultBaseState(), documentModel),
};
```

### Step 4: Upgrade Reducer

The upgrade reducer transforms a document from one version to the next:

```typescript
// upgrades/v2.ts
import type { Action, PHDocument, UpgradeTransition } from "document-model";
import type { TodoPHState as StateV1 } from "../v1";
import type { TodoPHState as StateV2 } from "../v2";

function upgradeReducer(
  document: PHDocument<StateV1>,
  action: Action,
): PHDocument<StateV2> {
  return {
    ...document,
    state: {
      ...document.state,
      global: {
        ...document.state.global,
        title: "",              // Initialize the new field
      },
    },
    initialState: {
      ...document.initialState,
      global: {
        ...document.initialState.global,
        title: "",              // Also in initial state
      },
    },
  };
}

export const v2: UpgradeTransition = {
  toVersion: 2,
  upgradeReducer,
  description: "Add title field to global state",
};
```

### Step 5: Upgrade Manifest

Tie everything together in the manifest:

```typescript
// upgrades/upgrade-manifest.ts
import type { UpgradeManifest } from "document-model";
import { latestVersion, supportedVersions } from "./versions.js";
import { v2 } from "./v2.js";

export const upgradeManifest: UpgradeManifest<typeof supportedVersions> = {
  documentType: "my-org/todo",
  latestVersion,
  supportedVersions,
  upgrades: { v2 },
};
```

### Step 6: Export All Versions

```typescript
// document-models.ts
import type { DocumentModelModule, UpgradeManifest } from "document-model";
import { upgradeManifest as todoUpgradeManifest } from "./todo/upgrades/upgrade-manifest.js";
import { Todo as TodoV1 } from "./todo/v1/module.js";
import { Todo as TodoV2 } from "./todo/v2/module.js";

export const documentModels: DocumentModelModule<any>[] = [TodoV1, TodoV2];
export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [
  todoUpgradeManifest,
];
```

---

## Integration with Connect and Switchboard

### How Connect Loads Versioned Documents

Connect automatically loads all document model versions and upgrade manifests from your Vetra packages:

```typescript
// Simplified view of Connect's reactor setup
const documentModelModules = vetraPackages
  .flatMap((pkg) => pkg.modules.documentModelModules);

const upgradeManifests = vetraPackages
  .flatMap((pkg) => pkg.upgradeManifests);

const reactor = await createBrowserReactor(
  documentModelModules,
  upgradeManifests,
  renown,
);
```

### Creating Documents at Specific Versions

By default, new documents are created at the **latest version**. You can optionally specify a version:

```typescript
// Create at latest version (default)
const doc = await client.createEmpty("my-org/todo");
// doc.state.document.version === 2 (latest)

// Create at specific version
const v1Doc = await client.createEmpty("my-org/todo", {
  documentModelVersion: 1,
});
// v1Doc.state.document.version === 1
```

### Querying Documents

Documents can be queried regardless of version:

```typescript
// Find all todo documents (both v1 and v2)
const result = await client.find({ type: "my-org/todo" });
```

---

## Use Cases

### 1. Adding a New Field

**Scenario:** Your Todo document needs a `title` field.

**Solution:**
1. Create v2 with the new field in the state schema
2. Implement upgrade reducer that sets `title: ""`
3. New documents get v2; existing v1 documents can be upgraded

### 2. Adding New Operations

**Scenario:** V1 has `ADD_TODO`, `REMOVE_TODO`. V2 adds `EDIT_TITLE`.

**How it works:**
- V2 module includes the new operation
- V1 documents don't have access to `EDIT_TITLE` until upgraded
- The upgrade manifest handles the migration

### 3. Changing Reducer Behavior

**Scenario:** V2 items should include an `addedAt` timestamp.

```typescript
// V1 reducer - no timestamp
function v1StateReducer(state, action) {
  if (action.type === "ADD_ITEM") {
    return {
      ...state,
      global: {
        items: [...state.global.items, {
          id: action.input.id,
          name: action.input.name
        }],
      },
    };
  }
}

// V2 reducer - adds timestamp field
function v2StateReducer(state, action) {
  if (action.type === "ADD_ITEM") {
    return {
      ...state,
      global: {
        items: [...state.global.items, {
          id: action.input.id,
          name: action.input.name,
          addedAt: action.input.addedAt,  // New field from input
        }],
      },
    };
  }
}
```

---

## Best Practices

### Upgrade Reducer Guidelines

1. **Always handle both `state` and `initialState`** - Both need to be migrated
2. **Provide sensible defaults** for new fields
3. **Never lose data** - Transform existing data, don't delete it
4. **Keep upgrade reducers pure** - No side effects or async operations

### Version Compatibility

- **Don't remove operations** from newer versions unless absolutely necessary
- **Don't change existing operation input schemas** - add new operations instead
- **Document breaking changes** in the upgrade transition description

### Testing Upgrades

Test your upgrade reducers thoroughly:

```typescript
it("should upgrade v1 document to v2", () => {
  const v1Doc = createV1Document();
  v1Doc.state.global.todos = [{ id: "1", title: "Test", completed: false }];

  const v2Doc = upgradeReducer(v1Doc, {} as Action);

  expect(v2Doc.state.global.title).toBe("");  // New field initialized
  expect(v2Doc.state.global.todos).toEqual(v1Doc.state.global.todos);  // Data preserved
});
```

---

## Summary

| Concept | Description |
|---------|-------------|
| **Version Folders** | `v1/`, `v2/` directories with version-specific code |
| **DocumentModelModule** | Exports with explicit `version` field |
| **UpgradeTransition** | Defines how to migrate from one version to the next |
| **UpgradeManifest** | Declares all versions and upgrade paths for a document type |
| **Backward Compatibility** | Old documents work with their original reducers |
| **Automatic Upgrades** | Reactor handles version detection and migration |

Document model versioning enables your applications to evolve safely while preserving the integrity of existing data. By following these patterns, you can confidently add new features, modify schemas, and improve your document models over time.

---

## Related Documentation

- [Use the Document Model Generator](/academy/MasteryTrack/DocumentModelCreation/UseTheDocumentModelGenerator)
- [Implement Document Reducers](/academy/MasteryTrack/DocumentModelCreation/ImplementDocumentReducers)
- [Powerhouse CLI Reference](/academy/APIReferences/PowerhouseCLI)
