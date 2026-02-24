# GraphQL Legacy Cleanup Plan

## Purpose

Remove all legacy `IDocumentDriveServer` dependencies from the GraphQL layer so it can operate entirely with the new reactor (`IReactorClient`). This cleanup is scoped specifically to GraphQL-related code - we are NOT addressing other legacy dependencies outside of the GraphQL subsystem.

## Background

The codebase currently has two parallel reactor systems:

- **Legacy**: `IDocumentDriveServer` from `document-drive` package
- **New**: `IReactorClient` from `@powerhousedao/reactor` package

The GraphQL layer was originally built on the legacy system but has been partially migrated. With `useNewDocumentModelSubgraph = true` (default in Switchboard), auto-generated document model subgraphs already use `reactorClient`. However, legacy code paths and dependencies remain.

## Goals

1. GraphQL layer operates entirely with `IReactorClient` (new reactor)
2. Remove `DriveSubgraph` class (replaced by auto-generated DocumentDrive subgraph)
3. Remove `DocumentModelSubgraphLegacy` class (deprecated, not used when flag is true)
4. Remove `useNewDocumentModelSubgraph` feature flag (always use new reactor)
5. Remove `reactor: IDocumentDriveServer` parameter from GraphQL components
6. Remove `driveServer` from GraphQL context

## Current State

### Feature Flag Status

| Location                       | Default Value      |
| ------------------------------ | ------------------ |
| `GraphQLManager` (reactor-api) | `false`            |
| Switchboard                    | `true` (overrides) |

Since Switchboard defaults to `true`, the new reactor path is already active in production. The legacy path exists only for backwards compatibility that is no longer needed.

## Findings

### 1. Dead Code (Can Be Removed)

#### `DriveSubgraph` class

- **File**: `packages/reactor-api/src/graphql/drive-subgraph.ts`
- **Status**: Replaced by auto-generated `DocumentDrive` subgraph
- **Usage**: Only in tests (`drive.test.ts`, `drive-subgraph-permissions.test.ts`, `drive-handlers.ts`)
- **Action**: Remove class and update/remove tests

#### `DocumentModelSubgraphLegacy` class

- **File**: `packages/reactor-api/src/graphql/document-model-subgraph.ts` (lines 567+)
- **Status**: Deprecated, only used when `useNewDocumentModelSubgraph = false`
- **Action**: Remove class after removing feature flag

### 2. Legacy Dependencies Still in Use

#### `GraphQLManager` Constructor

- **File**: `packages/reactor-api/src/graphql/graphql-manager.ts`
- **Line**: 155
- **Issue**: Takes `reactor: IDocumentDriveServer` as required parameter
- **Impact**: Forces creation of legacy reactor in Switchboard

#### `GraphQLManager.init()` - Document Model Query

- **File**: `packages/reactor-api/src/graphql/graphql-manager.ts`
- **Line**: 177
- **Code**: `const models = this.reactor.getDocumentModelModules();`
- **Action**: Use `reactorClient.getDocumentModelModules()` instead

#### `GraphQLManager` - Event Subscription

- **File**: `packages/reactor-api/src/graphql/graphql-manager.ts`
- **Line**: 249
- **Code**: `this.reactor.on("documentModelModules", ...)`
- **Action**: Use registry callback or reactorClient subscription

#### GraphQL Context - `driveServer` Field

- **File**: `packages/reactor-api/src/graphql/graphql-manager.ts`
- **Lines**: 447, 716
- **Code**: `driveServer: this.reactor`
- **Impact**: All resolvers receive legacy reactor in context
- **Action**: Remove from context, add `reactorClient` if needed

#### `IDocumentGraphql` Utility

- **File**: `packages/reactor-api/src/graphql/utils.ts`
- **Lines**: 108, 119
- **Code**:
  ```typescript
  const doc = await ctx.driveServer.getDocument(args.id);
  const modules = ctx.driveServer.getDocumentModelModules();
  ```
- **Action**: Update to use `reactorClient`

#### `createSchema()` Function

- **File**: `packages/reactor-api/src/utils/create-schema.ts`
- **Issue**: Takes `IDocumentDriveServer` as first parameter
- **Action**: Review if actually used, refactor or remove parameter

#### Subgraph Instance Creation

- **File**: `packages/reactor-api/src/graphql/graphql-manager.ts`
- **Lines**: 312, 375
- **Code**: `reactor: this.reactor` passed to all subgraph constructors
- **Action**: Remove after BaseSubgraph no longer requires it

### 3. Type Definitions to Update

#### `Context` Type

- **File**: `packages/reactor-api/src/types.ts` (likely)
- **Issue**: Has `driveServer: IDocumentDriveServer` field
- **Action**: Remove field, optionally add `reactorClient: IReactorClient`

#### `SubgraphArgs` Type

- **Issue**: Includes `reactor: IDocumentDriveServer`
- **Action**: Remove field after subgraphs are updated

#### `BaseSubgraph` Class

- **File**: `packages/reactor-api/src/graphql/base-subgraph.ts`
- **Issue**: Has `reactor: IDocumentDriveServer` property
- **Action**: Remove property

### 4. Feature Flag to Remove

#### `useNewDocumentModelSubgraph`

- **Files**:
  - `packages/reactor-api/src/graphql/graphql-manager.ts` (lines 115, 120, 305-307)
  - `packages/reactor-api/src/server.ts` (lines 104, 180, 203)
  - `apps/switchboard/src/server.ts` (lines 70-71, 319, 494-511)
  - `apps/switchboard/src/types.ts` (line 71)
- **Action**: Remove flag, always use `DocumentModelSubgraph` (new reactor)

## Migration Steps (Draft)

### Phase 1: Remove Dead Code

- [ ] Remove `DriveSubgraph` class (`drive-subgraph.ts`)
- [ ] Remove `sync/utils.ts` (only used by DriveSubgraph)
- [ ] Remove `sync/utils.ts` export from `index.ts`
- [ ] Remove `IDocumentGraphql` from `utils.ts` (dead code, only used by DriveSubgraph)
- [ ] Remove or update tests that use `DriveSubgraph`
- [ ] Remove `DocumentModelSubgraphLegacy` class
- [ ] Remove `useNewDocumentModelSubgraph` feature flag
- [ ] Remove export of `DriveSubgraph` from `graphql/index.ts`

### Phase 2: Update GraphQL Utilities

- [ ] Update `createSchema()` to not require `IDocumentDriveServer`
- [ ] Update `buildSubgraphSchemaModule()` to not require `IDocumentDriveServer`
- [ ] Update `getDocumentModelTypeDefs()` to accept a getter function instead of `IDocumentDriveServer`

### Phase 3: Update GraphQLManager

- [ ] Remove `reactor: IDocumentDriveServer` from constructor
- [ ] Update `init()` to use reactorClient for document model queries
- [ ] Update event subscription to use registry callback (already partially done)
- [ ] Remove `driveServer` from HTTP context creation (line 716)
- [ ] Remove `driveServer` from WebSocket context creation (line 447)

### Phase 4: Update Types and Base Classes

- [ ] Remove `reactor` from `SubgraphArgs` type
- [ ] Remove `reactor` property from `BaseSubgraph` class
- [ ] Remove `driveServer` from `Context` type
- [ ] Remove `reactor` from `ISubgraph` type
- [ ] Update any remaining type definitions

### Phase 5: Update Switchboard

- [ ] Remove feature flag configuration (`USE_NEW_DOCUMENT_MODEL_SUBGRAPH`)
- [ ] Remove `useNewDocumentModelSubgraph` from options
- [ ] Update GraphQLManager instantiation (no longer needs legacy reactor)
- [ ] Assess if legacy reactor is still needed for non-GraphQL purposes

## Files to Modify

### Summary by Package/App

| Package/App     | Files to Modify | Scope                                                     |
| --------------- | --------------- | --------------------------------------------------------- |
| **reactor-api** | 11 files        | Main cleanup work                                         |
| **switchboard** | 2 files         | Remove flag only; legacy reactor still needed for non-GQL |

### `packages/reactor-api/src/` (11 files)

| File                                 | Action | What                                                              |
| ------------------------------------ | ------ | ----------------------------------------------------------------- |
| `graphql/drive-subgraph.ts`          | DELETE | Dead code - replaced by auto-generated subgraph                   |
| `sync/utils.ts`                      | DELETE | Dead code - only used by `DriveSubgraph`                          |
| `graphql/document-model-subgraph.ts` | MODIFY | Remove `DocumentModelSubgraphLegacy` class (~200 lines)           |
| `graphql/graphql-manager.ts`         | MODIFY | Remove `reactor` param, `driveServer` from context, legacy events |
| `graphql/base-subgraph.ts`           | MODIFY | Remove `reactor` property                                         |
| `graphql/utils.ts`                   | MODIFY | Remove `IDocumentGraphql` (dead code)                             |
| `graphql/index.ts`                   | MODIFY | Remove `DriveSubgraph` export                                     |
| `graphql/types.ts`                   | MODIFY | Remove `driveServer` from Context, `reactor` from SubgraphArgs    |
| `utils/create-schema.ts`             | MODIFY | Update function signatures to not require `IDocumentDriveServer`  |
| `server.ts`                          | MODIFY | Remove feature flag types/options                                 |
| `index.ts`                           | MODIFY | Remove `sync/utils.ts` export                                     |

### `packages/reactor-api/test/` (3 files)

| File                                 | Action |
| ------------------------------------ | ------ |
| `drive.test.ts`                      | DELETE |
| `drive-subgraph-permissions.test.ts` | DELETE |
| `drive-handlers.ts`                  | DELETE |

### `apps/switchboard/src/` (2 files to modify, 2 to keep)

| File        | Action | What                                                             |
| ----------- | ------ | ---------------------------------------------------------------- |
| `server.ts` | MODIFY | Remove `USE_NEW_DOCUMENT_MODEL_SUBGRAPH` flag and related code   |
| `types.ts`  | MODIFY | Remove `useNewDocumentModelSubgraph` option                      |
| `utils.ts`  | KEEP   | Uses `IDocumentDriveServer` for `addRemoteDrive()` - NOT GraphQL |

## Files NOT Being Modified (Out of Scope)

The following files use `IDocumentDriveServer` but are **intentionally NOT part of this cleanup** because they are outside the GraphQL scope:

### `apps/switchboard/src/utils.ts`

- Contains: `addDefaultDrive()`, `addRemoteDrive()`
- Uses: `driveServer.addRemoteDrive()`, `driveServer.eventEmitter.emit("driveAdded")`
- **Why keeping**: These are sync/drive management utilities, not GraphQL. The legacy reactor is still needed for remote drive functionality.

### `apps/switchboard/src/server.ts` (partial)

- Uses: `driveServer.initialize()`, `driveServer.getDocumentModelModules()`, `driveServer.setDocumentModelModules()`
- **Why keeping**: Hot reload and initialization still use the legacy reactor. Only the feature flag code is being removed.

## Expected Outcome

### After This Cleanup, GraphQL Will:

- Use only `IReactorClient` (new reactor)
- Have no `driveServer` in context
- Have no `useNewDocumentModelSubgraph` flag (always uses new path)
- Have no `DriveSubgraph` or `DocumentModelSubgraphLegacy` classes

### Switchboard Will Still (Temporarily):

> **Note**: This is technical debt to be addressed in the next phase. See "Future Work" section below.

- Create the legacy reactor for non-GraphQL purposes
- Use `IDocumentDriveServer` for:
  - `addRemoteDrive()` functionality
  - Hot reload via `setDocumentModelModules()`
  - Processor management
  - `driveAdded` event emission

### Future Work (Not in This Cleanup):

The ultimate goal is for Switchboard to use **only the new reactor** (`IReactorClient`) and remove all legacy support. After this cleanup, Switchboard will still:

- Create the legacy reactor for non-GraphQL purposes
- Use `IDocumentDriveServer` for:
  - `addRemoteDrive()` functionality
  - Hot reload via `setDocumentModelModules()`
  - Processor management
  - `driveAdded` event emission

#### Findings: `legacyReactor` Feature Flag

Switchboard has another feature flag `REACTOR_STORAGE_V2` that controls the `legacyReactor` option:

```typescript
// apps/switchboard/src/server.ts
const REACTOR_STORAGE_V2 = "REACTOR_STORAGE_V2";
const REACTOR_STORAGE_V2_DEFAULT = true; // line 65

// storageV2=true means use new reactor (NOT legacy)
const legacyReactor = !options.reactorOptions?.storageV2; // line 297
```

| Flag                 | Default | Effect                                     |
| -------------------- | ------- | ------------------------------------------ |
| `REACTOR_STORAGE_V2` | `true`  | `legacyReactor = false` → uses new reactor |

When `legacyReactor = true`:

- Uses `ProcessorManagerLegacy` from document-drive (line 505-507)
- Package loaders use legacy factory patterns

When `legacyReactor = false` (default):

- Uses new reactor patterns for processors
- Package loaders use new factory patterns

**Files using `legacyReactor` flag:**

- `packages/reactor-api/src/server.ts` (lines 109, 437, 490, 505, 587, 600, 730, 746, 820, 838)
- `packages/reactor-api/src/packages/vite-loader.ts` (lines 23, 33, 132, 154)
- `packages/reactor-api/src/packages/import-loader.ts` (lines 20, 23, 73, 87)
- `packages/reactor-api/src/packages/types.ts` (lines 58, 64)
- `apps/switchboard/src/server.ts` (lines 297, 299, 301, 320, 415)

**Next steps to fully remove legacy reactor:**

- [ ] Remove `REACTOR_STORAGE_V2` feature flag (always use new reactor)
- [ ] Remove `legacyReactor` option from all package loaders
- [ ] Remove `ProcessorManagerLegacy` usage
- [ ] Migrate `addRemoteDrive()` to use new reactor/sync manager
- [ ] Migrate `addDefaultDrive()` to not emit legacy `driveAdded` event
- [ ] Migrate hot reload (`setDocumentModelModules()`) to use registry
- [ ] Migrate processor management to new reactor patterns
- [ ] Remove legacy reactor creation from Switchboard entirely
- [ ] Remove `IDocumentDriveServer` dependency from Switchboard

## Open Questions (Resolved)

### 1. Is `IDocumentGraphql` used by any external code or custom subgraphs?

**Answer: No.**

- `IDocumentGraphql` is defined in `packages/reactor-api/src/graphql/utils.ts` (line 100)
- It is exported via `utils.js` -> `graphql/index.ts` -> `reactor-api/index.ts`
- **Only used by `DriveSubgraph`** (lines 53, 283 in `drive-subgraph.ts`)

Since `DriveSubgraph` is dead code (replaced by auto-generated subgraph), `IDocumentGraphql` is also effectively **dead code**. The new `DocumentModelSubgraph` and `ReactorSubgraph` classes use their own resolvers from `graphql/reactor/resolvers.ts` which use `reactorClient` directly.

**Action**: Remove `IDocumentGraphql` entirely instead of updating it.

### 2. Are there any other packages that depend on `ctx.driveServer`?

**Answer: No.**

The only usages of `ctx.driveServer` in the entire monorepo are:

- `packages/reactor-api/src/graphql/utils.ts` (lines 108, 119)

Both are inside `IDocumentGraphql`, which is only used by `DriveSubgraph` (dead code).

No apps or other packages use `ctx.driveServer`.

**Action**: Safe to remove `driveServer` from Context type.

### 3. Should `reactorClient` be added to GraphQL context for resolver use?

**Answer: No, it's not necessary.**

The new architecture passes `reactorClient` via the subgraph class instance (`this.reactorClient`), not via context:

- `DocumentModelSubgraph` uses `this.reactorClient` directly
- `ReactorSubgraph` uses `this.reactorClient` directly
- All new resolvers in `graphql/reactor/resolvers.ts` take `reactorClient` as a function parameter

The pattern is: subgraph classes hold `reactorClient` as an instance property and pass it to resolver functions. This is cleaner than putting it in context.

**Action**: Do NOT add `reactorClient` to Context. Keep current pattern.

### 4. What is the impact on existing deployments?

**Answer: Minimal impact.**

1. **Switchboard already uses `useNewDocumentModelSubgraph = true`** - The new reactor path is already active in production
2. **`DriveSubgraph` is already replaced** - Auto-generated DocumentDrive subgraph handles drive operations
3. **No external code uses `ctx.driveServer`** - Only internal dead code depends on it
4. **`IDocumentGraphql` is dead code** - Only used by `DriveSubgraph`

The cleanup is essentially removing dead code paths that are already unused in production.

**Risks to monitor**:

- Custom subgraphs that extend `BaseSubgraph` and rely on `this.reactor` (need to audit external packages if any)
- Tests that mock `IDocumentDriveServer` (need to update)

## References

- Tech Debt Doc: `docs/tech-debt/legacy-driveserver-dependencies.md`
- Architecture Doc: `graphql-reactor-architecture.md`
- Dynamic Subgraph Doc: `dynamic-subgraph-generation.md`

---

**Status**: Planning
**Last Updated**: 2026-02-23
