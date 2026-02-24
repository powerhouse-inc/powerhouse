# Phase 2: Remove driveServer Dependency from Subgraph Generation

## Overview

This document describes the plan to decouple GraphQL subgraph generation from the legacy `IDocumentDriveServer` (`driveServer`). After this change, the `GraphQLManager` will exclusively use `IReactorClient` (backed by the new reactor's `IDocumentModelRegistry`) as the source of truth for document models when generating and regenerating subgraphs.

**Prerequisites:** Phase 1 (GraphQL Legacy Cleanup) should be completed first.

**Next Phase:** After this task, the next phase will remove `driveServer` entirely from the codebase.

---

## Context

### The Two-Copy Problem

Currently, document models are stored in two places:

1. **Legacy `driveServer`** (`IDocumentDriveServer` from `document-drive` package)
   - Has `setDocumentModelModules()` and `getDocumentModelModules()` methods
   - Emits `"documentModelModules"` event when modules change
   - This is the OLD way

2. **New Reactor** (`IDocumentModelRegistry` from `@powerhousedao/reactor` package)
   - Has `registerModules()` and `getAllModules()` methods
   - Accessible via `IReactorClient.getDocumentModelModules()`
   - This is the NEW way and should be the **source of truth**

### Current Flow (Legacy)

When document models are dynamically loaded at runtime (e.g., via GraphQL `installPackage` mutation):

```
PackageManagementService.installPackage()
    |
    v
setOnModelsChanged callback fires
    |
    v
driveServer.setDocumentModelModules(models)  <-- Updates legacy storage
    |
    v
driveServer emits "documentModelModules" event
    |
    v
GraphQLManager.init() listener receives event
    |
    v
GraphQLManager.#setupDocumentModelSubgraphs()
```

**Problem:** The GraphQL subgraph generation depends entirely on the legacy `driveServer` for both:

1. Getting initial document models (`this.reactor.getDocumentModelModules()`)
2. Receiving updates when models change (`this.reactor.on("documentModelModules", ...)`)

---

## Goal

Make `GraphQLManager` use **only** `IReactorClient` for document model access:

```
PackageManagementService.installPackage()
    |
    v
setOnModelsChanged callback fires
    |
    v
registry.registerModules(models)  <-- Updates new reactor registry
    |
    v
graphqlManager.regenerateDocumentModelSubgraphs()  <-- Direct call
    |
    v
Uses reactorClient.getDocumentModelModules()  <-- Reads from new reactor
```

---

## Detailed Changes

### 1. Modify `GraphQLManager` Class

**File:** `packages/reactor-api/src/graphql/graphql-manager.ts`

#### 1.1 Change `init()` to Use `reactorClient` for Initial Load

**Current code (lines 181-192):**

```typescript
async init(coreSubgraphs: SubgraphClass[]) {
  this.logger.debug(`Initializing Subgraph Manager...`);

  // check if Document Drive model is available
  const models = this.reactor.getDocumentModelModules();  // <-- LEGACY
  const driveModel = models.find(
    (it) => it.documentModel.global.name === "DocumentDrive",
  );
  if (!driveModel) {
    throw new Error("DocumentDrive model required");
  }
  // ...
}
```

**New code:**

```typescript
async init(coreSubgraphs: SubgraphClass[]) {
  this.logger.debug(`Initializing Subgraph Manager...`);

  // check if Document Drive model is available
  const modulesResult = await this.reactorClient.getDocumentModelModules();  // <-- NEW
  const models = modulesResult.data;
  const driveModel = models.find(
    (it) => it.documentModel.global.name === "DocumentDrive",
  );
  if (!driveModel) {
    throw new Error("DocumentDrive model required");
  }
  // ...
}
```

**Note:** `getDocumentModelModules()` returns `Promise<PagedResults<DocumentModelModule>>`, so we need to access `.data` property and handle the async nature.

#### 1.2 Update Initial Subgraph Setup to Use Fetched Models

**Current code (lines 234-239):**

```typescript
if (this.featureFlags.enableDocumentModelSubgraphs) {
  await this.#setupDocumentModelSubgraphs(
    "graphql",
    this.reactor.getDocumentModelModules(), // <-- LEGACY: called again
  );
}
```

**New code:**

```typescript
if (this.featureFlags.enableDocumentModelSubgraphs) {
  await this.#setupDocumentModelSubgraphs(
    "graphql",
    models, // <-- Use already-fetched models from above
  );
}
```

#### 1.3 Remove Legacy Event Listener

**Remove this entire block (lines 241-251):**

```typescript
this.reactor.on("documentModelModules", (documentModels) => {
  if (this.featureFlags.enableDocumentModelSubgraphs) {
    this.#setupDocumentModelSubgraphs("graphql", documentModels)
      .then(() => this.updateRouter())
      .catch((error: unknown) => this.logger.error("@error", error));
  } else {
    this.updateRouter().catch((error: unknown) =>
      this.logger.error("@error", error),
    );
  }
});
```

#### 1.4 Add New Public Method for Dynamic Regeneration

**Add this new method to the class:**

```typescript
/**
 * Regenerate document model subgraphs when models are dynamically loaded.
 * Fetches the current modules from the reactor client (source of truth)
 * and regenerates all document model subgraphs.
 *
 * Call this after registering new document models with the reactor's registry.
 */
async regenerateDocumentModelSubgraphs(): Promise<void> {
  if (!this.featureFlags.enableDocumentModelSubgraphs) {
    return;
  }

  try {
    const modulesResult = await this.reactorClient.getDocumentModelModules();
    const models = modulesResult.data;

    await this.#setupDocumentModelSubgraphs("graphql", models);
    await this.updateRouter();

    this.logger.info(
      "Regenerated document model subgraphs with @count models",
      models.length,
    );
  } catch (error) {
    this.logger.error("Failed to regenerate document model subgraphs", error);
    throw error;
  }
}
```

---

### 2. Update Switchboard Server

**File:** `apps/switchboard/src/server.ts`

#### 2.1 Update `setOnModelsChanged` Callback

The callback needs to:

1. Register models with the new reactor's registry
2. Call `graphqlManager.regenerateDocumentModelSubgraphs()`

**Current code (approximately lines 363-375):**

```typescript
// Wire hot reload callback - merge dynamically loaded models with base models
packageManagementService.setOnModelsChanged((dynamicModels) => {
  const current = driveServer.getDocumentModelModules();
  // Get IDs of dynamically loaded models
  const dynamicIds = new Set(
    dynamicModels.map((m) => m.documentModel.global.id),
  );
  // Keep base models that aren't being replaced by dynamic ones
  const baseModels = current.filter(
    (m) => !dynamicIds.has(m.documentModel.global.id),
  );
  driveServer.setDocumentModelModules([...baseModels, ...dynamicModels]);
});
```

**Problem:** This callback is set up BEFORE `initializeAndStartAPI()` is called, so we don't have access to `graphqlManager` yet.

**Solution:** Move the callback setup to AFTER API initialization, or restructure to pass the callback through.

#### 2.2 Restructure Callback Setup

**Option A: Set callback after API initialization**

The `initializeAndStartAPI()` function returns `API & { driveServer, client, syncManager }`. We need it to also return `graphqlManager` so we can set up the callback after.

**New code flow:**

```typescript
// Initialize API
const {
  app: expressApp,
  graphqlManager, // <-- Need to expose this
  driveServer,
  client,
  syncManager,
} = await initializeAndStartAPI(/* ... */);

// Now wire the hot reload callback
packageManagementService.setOnModelsChanged(async (dynamicModels) => {
  // Register with new reactor's registry
  // Note: The registry is internal to the reactor, accessed via reactorClient
  // The HttpPackageLoader already registered the models when loading them
  // But we need to ensure they're in the registry

  // For now, we can get the registry from the reactorClientModule if exposed
  // OR we can just call regenerateDocumentModelSubgraphs which will fetch from registry

  await graphqlManager.regenerateDocumentModelSubgraphs();
});
```

**However**, there's a gap: the `HttpPackageLoader` loads models but doesn't automatically register them in the new reactor's registry. Let me trace this flow.

---

### 3. Ensure Models Are Registered in New Reactor Registry

**File:** `packages/reactor-api/src/services/package-management.service.ts`

The `PackageManagementService.installPackage()` method loads modules via `httpLoader.loadDocumentModels()` but only stores them in its local cache. It doesn't register them with the reactor's registry.

**Current code (lines 106-124):**

```typescript
// Load document models from the registry
const models = await this.httpLoader.loadDocumentModels(name);

// Extract document type IDs
const documentTypes = models.map((m) => m.documentModel.global.id);

// Create package info
const packageInfo: InstalledPackageInfo = {
  /* ... */
};

// Store the package info
await this.storage.set(name, packageInfo);

// Cache the loaded modules
this.loadedModulesCache.set(name, models);

// Trigger hot reload
this.triggerModelsChanged();
```

**We need to register these models with the reactor's registry.**

#### 3.1 Add Registry to PackageManagementService

**Option A: Pass registry to service constructor**

```typescript
export interface PackageManagementServiceOptions {
  storage?: IPackageStorage;
  defaultRegistryUrl?: string;
  httpLoader?: HttpPackageLoader;
  documentModelRegistry?: IDocumentModelRegistry; // <-- NEW
}
```

Then in `installPackage()`:

```typescript
// Register with reactor's registry
if (this.documentModelRegistry) {
  this.documentModelRegistry.registerModules(...models);
}
```

**Option B: Pass registry via callback**

The `setOnModelsChanged` callback could be enhanced to receive the registry and do the registration there. But this mixes concerns.

**Recommendation: Option A** - Pass the registry to the service so it can register models directly.

---

### 4. Update `initializeAndStartAPI` Return Type

**File:** `packages/reactor-api/src/server.ts`

The function should return `graphqlManager` so callers can wire up callbacks.

**Current return type (lines 780-785):**

```typescript
): Promise<
  API & {
    driveServer: IDocumentDriveServer;
    client: IReactorClient;
    syncManager: ISyncManager;
  }
>
```

**New return type:**

```typescript
): Promise<
  API & {
    driveServer: IDocumentDriveServer;
    client: IReactorClient;
    syncManager: ISyncManager;
    graphqlManager: GraphQLManager;  // <-- ADD THIS
  }
>
```

**Note:** `graphqlManager` is already returned inside the `API` type. Check the `API` type definition:

**File:** `packages/reactor-api/src/types.ts`

```typescript
export type API = {
  app: Express;
  graphqlManager: GraphQLManager;
  processorManager: IProcessorManagerLegacy;
  packages: PackageManager;
};
```

So `graphqlManager` is already accessible. The switchboard just needs to use it.

---

### 5. Access Registry from ReactorClientModule

**The registry is already accessible** - no changes needed to the reactor package.

**File:** `packages/reactor/src/core/types.ts`

The `ReactorClientModule` type (lines 439-449) includes:

```typescript
export interface ReactorClientModule {
  client: ReactorClient;
  reactor: IReactor;
  eventBus: IEventBus;
  documentIndexer: IDocumentIndexer;
  documentView: IDocumentView;
  signer: ISigner;
  subscriptionManager: IReactorSubscriptionManager;
  jobAwaiter: IJobAwaiter;
  reactorModule: ReactorModule | undefined; // <-- Contains the registry
}
```

And `ReactorModule` (lines 411-432) includes:

```typescript
export interface ReactorModule {
  eventBus: IEventBus;
  documentModelRegistry: IDocumentModelRegistry; // <-- The registry we need
  // ... other fields
}
```

**How to access the registry in switchboard:**

```typescript
// In apps/switchboard/src/server.ts, after building the module:
const module = await clientBuilder.buildModule();

// Access the registry:
const registry = module.reactorModule?.documentModelRegistry;
if (!registry) {
  throw new Error(
    "DocumentModelRegistry not available from ReactorClientModule",
  );
}

// Pass to PackageManagementService:
const packageManagementService = new PackageManagementService({
  defaultRegistryUrl: registryUrl,
  httpLoader,
  documentModelRegistry: registry, // <-- NEW
});
```

**Note:** The `reactorModule` is only available when using `ReactorClientBuilder.withReactorBuilder()`. The switchboard uses this pattern (line 278), so the registry will be available.

---

## Complete File Changes Summary

### Files to MODIFY:

| File                                                              | Changes                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/reactor-api/src/graphql/graphql-manager.ts`             | 1. Change `init()` to use `reactorClient.getDocumentModelModules()` instead of `this.reactor.getDocumentModelModules()`<br>2. Remove `this.reactor.on("documentModelModules", ...)` listener<br>3. Add `regenerateDocumentModelSubgraphs()` public method |
| `packages/reactor-api/src/services/package-management.service.ts` | 1. Add `documentModelRegistry` option to constructor<br>2. Register modules with registry in `installPackage()`                                                                                                                                           |
| `apps/switchboard/src/server.ts`                                  | 1. Pass registry to `PackageManagementService`<br>2. Update `setOnModelsChanged` callback to call `graphqlManager.regenerateDocumentModelSubgraphs()`                                                                                                     |

### NO changes needed to reactor package

The `IDocumentModelRegistry` is already accessible via `ReactorClientModule.reactorModule.documentModelRegistry`. See Section 5 for details.

---

## Detailed Implementation Steps

### Step 1: Modify GraphQLManager

**File:** `packages/reactor-api/src/graphql/graphql-manager.ts`

1. Make `init()` async-aware for the `reactorClient.getDocumentModelModules()` call
2. Store fetched models in a variable and reuse for subgraph setup
3. Remove the `this.reactor.on("documentModelModules", ...)` event listener (lines 241-251)
4. Add the new `regenerateDocumentModelSubgraphs()` method

### Step 2: Modify PackageManagementService

**File:** `packages/reactor-api/src/services/package-management.service.ts`

1. Add `documentModelRegistry?: IDocumentModelRegistry` to `PackageManagementServiceOptions`
2. Store registry reference in class
3. In `installPackage()`, after loading models, call `this.documentModelRegistry?.registerModules(...models)`
4. In `uninstallPackage()`, call `this.documentModelRegistry?.unregisterModules(...documentTypes)` if registry supports it

### Step 3: Update Switchboard

**File:** `apps/switchboard/src/server.ts`

1. After creating `ReactorClientModule`, get reference to the registry
2. Pass registry to `PackageManagementService` constructor
3. After `initializeAndStartAPI()` returns, update the `setOnModelsChanged` callback:

```typescript
packageManagementService.setOnModelsChanged(async (dynamicModels) => {
  // Models are already registered in registry by PackageManagementService.installPackage()
  // Just trigger subgraph regeneration
  await api.graphqlManager.regenerateDocumentModelSubgraphs();
});
```

**Note:** If the callback was already set before API init, we need to either:

- Unset and reset it after API init
- Use a mutable reference pattern
- Restructure the initialization order

### Step 4: Registry Access (Already Verified)

The `IDocumentModelRegistry` is accessible via `ReactorClientModule.reactorModule.documentModelRegistry`. No additional changes needed to the reactor package. See Section 5 for the complete access pattern.

---

## Verification

### Step 1: Build

```bash
cd packages/reactor-api && pnpm build
cd apps/switchboard && pnpm build
```

### Step 2: Run Tests

```bash
cd packages/reactor-api && pnpm test
cd apps/switchboard && pnpm test
```

### Step 3: Manual Testing

1. Start switchboard
2. Install a package via GraphQL mutation:
   ```graphql
   mutation {
     installPackage(name: "@powerhousedao/some-package") {
       package {
         name
       }
       documentModelsLoaded
     }
   }
   ```
3. Verify the new document model subgraph is available
4. Verify the subgraph uses the new reactor for operations

### Step 4: Full Monorepo Build

```bash
pnpm build-all
```

---

## Risk Assessment

**Low Risk:**

- `IReactorClient.getDocumentModelModules()` is an existing, tested API
- The `regenerateDocumentModelSubgraphs()` method reuses existing `#setupDocumentModelSubgraphs()` logic

**Medium Risk:**

- Initialization order changes in switchboard (callback setup must happen after API init)

**Rollback Strategy:**

- All changes are in a feature branch
- Can revert if issues are discovered

---

## Dependencies

This task depends on:

- Phase 1 completion (removal of `DriveSubgraph`, `DocumentModelSubgraphLegacy`, etc.)

This task blocks:

- Complete removal of `driveServer` from the codebase

---

## Required Imports

### In `packages/reactor-api/src/services/package-management.service.ts`:

```typescript
import type { IDocumentModelRegistry } from "@powerhousedao/reactor";
```

### In `apps/switchboard/src/server.ts`:

The `IDocumentModelRegistry` type is already available from `@powerhousedao/reactor` if needed for type annotations, but since TypeScript can infer the type from `module.reactorModule?.documentModelRegistry`, explicit import may not be necessary.

---

## Notes for Implementation

1. The `GraphQLManager.init()` method will become async-heavier. Ensure all callers handle this properly.

2. The `IReactorClient.getDocumentModelModules()` method returns `PagedResults<DocumentModelModule>`. The type is defined in `packages/reactor/src/shared/types.ts`:

   ```typescript
   export type PagedResults<T> = {
     data: T[];
     cursor?: string; // Present if more pages available
   };
   ```

   For now, assume all modules fit in one page (no pagination needed). If pagination is needed later, implement a helper to fetch all pages.

3. **Uninstall flow:** When `uninstallPackage()` is called, the `IDocumentModelRegistry` interface provides `unregisterModules(...documentTypes: string[]): boolean`. Use this to remove uninstalled models from the registry. The subgraph regeneration will then reflect the removal.

4. The `PackageManagementService` callback pattern may need adjustment. Consider whether a more event-driven approach (like the reactor's `IEventBus`) would be cleaner in the future.

5. After this change, the only remaining uses of `driveServer` should be:
   - Actual document operations (which will be migrated in the next phase)
   - Any legacy code paths not yet migrated
