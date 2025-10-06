# Refactoring to `Reactor`: An Iterative Approach

This document outlines the plan to refactor the existing `document-drive` package into the new `Reactor` architecture. The core of this refactoring is a shift from a state-oriented storage model to a command-sourced architecture, accomplished iteratively using a facade to minimize risk and disruption.

All new development will take place in the `packages/reactor` directory, providing a clean separation from the existing `document-drive` codebase.

## Phase 1 (✅ Completed): Foundational `PHDocument` Refactoring

Before building any new `Reactor` components, we must first refactor the core data structure, `PHDocument`, within the existing `document-drive` package. This is a significant breaking change that must be handled in isolation.

1.  **Define `PHDocument` v2**:
    - Define the new `PHDocument` v2 structure as a set of types, including its distinct `state`, `mutations`, and `history` components, based on the planning documents.

2.  **Refactor `BaseDocumentDriveServer`**:
    - Modify the internal logic and public method signatures of the existing `BaseDocumentDriveServer` to natively produce and consume the new `PHDocument` v2 structure. The server itself will now be the source of truth for the new document format.

3.  **Update All Consumers**:
    - Systematically update all application code that currently consumes `BaseDocumentDriveServer` or interacts with the old `PHDocument` structure. This includes UI components, utilities, and tests. This is a breaking change across the codebase, and all affected code must be updated to be compatible with `PHDocument` v2.

## Phase 2 (✅ Completed): The `IReactor` Facade ([Strangler Fig](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig) Pattern)

With the `PHDocument` structure stabilized, we can now create the `IReactor` interface as a facade.

1.  **Define `IReactor`**:
    - In `packages/reactor`, define the `IReactor` interface based on the target architecture.
2.  **Implement the `Reactor` Facade**:
    - Create a `Reactor` class that implements `IReactor`.
    - Internally, this class will wrap the newly-refactored `BaseDocumentDriveServer`.
    - **Crucially**: No complex data translation is needed. The facade is now a simple pass-through for `PHDocument` objects, as the underlying server already speaks v2.

## Phase 2.5 (✅ Completed): Shift Facade Reads to Legacy Storage Directly

Before building the async write pipeline, decouple the facade's read-path from `BaseDocumentDriveServer` by calling existing legacy storage interfaces directly (no new abstractions).

1.  **Identify read interfaces**:
    - Depend on the legacy read contracts from `document-drive` (e.g., `IDocumentStorage`, `IDriveOperationStorage`, and any model/metadata readers used by `getDocumentModels`).
2.  **Wire legacy storages into the facade**:
    - Update the `Reactor` constructor to accept the necessary legacy storage dependencies.
    - Do not add new adapter interfaces or Reactor-specific wrappers in this phase.
3.  **Refactor `Reactor` facade reads**:
    - Rework `getDocumentModels`, `get`, `getBySlug`, `getOperations`, and all `find*` methods to use the injected legacy storage directly rather than `BaseDocumentDriveServer`.
    - Optionally keep a temporary fallback to the server while dependencies are plumbed, but the goal is to remove read-time server calls.
4.  **Limit server usage to mutations only (temporarily)**:
    - Until the write path is implemented, keep `BaseDocumentDriveServer` only where strictly necessary for create/mutate/delete behavior.
5.  **Update tests**:
    - Add unit tests for the read-path logic and adjust `Reactor` tests to use fakes/mocks of the legacy storage interfaces.

Outcome: The facade no longer depends on `BaseDocumentDriveServer` for reads, making Phase 3 simpler and reducing churn later when repointing to `IDocumentView`.

## Phase 3 (✅ Completed): Implement Core Write Path Components

This phase proceeds as before: building the new asynchronous pipeline for handling mutations.

1.  **Implement `IEventBus`**, **`IQueue`**, and **`IJobExecutorManager`**:
    - Within `packages/reactor`, define and implement these core components as planned.

## Phase 3.5 (✅ Completed): Introduce CREATE/UPDATE Action Flow

To enable proper command-sourced document creation, introduce a standardized action-based flow for document lifecycle operations.

1.  **Define CREATE Action** (✅ Completed):
    - Introduce a `CREATE` action type that initializes a new document with its header and initial state.
    - The action should contain all necessary information to bootstrap a document (id, documentType, initial metadata, etc.).
2.  **Define UPDATE Action** (✅ Completed):
    - Introduce an `UPDATE` action type for modifying existing documents.
    - Together with `CREATE`, this forms the complete action-based document lifecycle.
3.  **Update Document Model Reducers** (✅ Completed):
    - Ensure document model reducers properly handle both `CREATE` and `UPDATE` actions.
    - `CREATE` actions should generate proper operations that can be stored and replayed.
4.  **Remove Legacy Creation Hacks** (✅ Complete):
    - ✅ Updated `KyselyOperationStore.reconstructHeader()` to handle ONLY `CREATE_DOCUMENT` and `UPGRADE_DOCUMENT` actions (store.ts:145-191)
    - ✅ Header information is now extracted from `CREATE_DOCUMENT` action's signing parameters (signature, publicKey, nonce, documentType, createdAtUtcIso)
    - ✅ Removed all legacy "CREATE_HEADER" and "UPDATE_HEADER" action type handling
    - Document headers are now fully reconstructed from real CREATE_DOCUMENT and UPGRADE_DOCUMENT operations

5.  **Architectural Fix: Move `getHeader()` from `IOperationStore` to `IDocumentView`** (✅ Complete):
    - **Problem Identified**: Headers contain cross-scope metadata (`revision` tracking for all scopes, `lastModifiedAtUtcIso` for latest change across all scopes)
    - **Current Issue**: `IOperationStore.getHeader()` is scope-specific and cannot properly reconstruct headers that aggregate information from multiple scopes
    - **Solution**:
        - ✅ Remove `getHeader()` from `IOperationStore` interface and implementations (interfaces.ts:28-63, store.ts:1-115)
        - ✅ Add `getHeader()` to `IDocumentView` interface and implementations (interfaces.ts:129-133, document-view.ts:197-273)
        - ✅ Add `getRevisions()` to `IOperationStore` to efficiently retrieve revision map and latest timestamp (interfaces.ts:71-86, store.ts:179-217)
        - ✅ Update `IDocumentView.getHeader()` to reconstruct header and document scopes by processing only header and document operations in chronological order, then using `getRevisions()` to update revisions with latest distinct operations across all scopes
        - ✅ Update all callsites - removed obsolete tests from kysely.test.ts since `IOperationStore` no longer has this method
    - **Rationale**: Headers are read model concerns that require cross-scope aggregation, which is precisely what `IDocumentView` is designed for
    - **Spec Changes**: Updated [IOperationStore.md](./Storage/IOperationStore.md) and [IDocumentView.md](./Storage/IDocumentView.md) to reflect this architectural change
    - **Implementation Details**:
        - `IOperationStore.getRevisions()` efficiently finds the latest operation for each scope in a **single query** using a subquery to match operations where index equals the max index for that scope, returning both the revision map and the latest timestamp
        - `KyselyDocumentView.getHeader()` queries ONLY "header" and "document" scope operations (for CREATE_DOCUMENT and UPGRADE_DOCUMENT actions)
        - Processes those operations in chronological order (by `timestampUtcMs`)
        - Calls `operationStore.getRevisions()` to get the revision map and latest timestamp from ALL scopes efficiently
        - Uses that information to populate the header's `revision` map and `lastModifiedAtUtcIso` field
        - This ensures header is always current with the latest operations across all scopes while only loading necessary operations

**Outcome**: Document creation now flows through the same action-based pipeline as mutations, enabling full event sourcing and eliminating the need for special-case document creation logic.

## Phase 4 (⚠️ In Progress): Connect Facade to Legacy Write Path

Instead of a "big bang" switch, we first validate the new job pipeline while still relying on the legacy storage system as the source of truth.

1.  **Update `Reactor` Facade Mutations** (⚠️ Partially Complete):
    - ✅ The `mutate()` method packages actions as `Job`s and enqueues them into `IQueue` (reactor.ts:370-404)
    - ❌ The `create()` method still calls `BaseDocumentDriveServer.addDocument()` directly and returns synchronous job completion (reactor.ts:295-325)
    - ❌ The `deleteDocument()` method still calls `BaseDocumentDriveServer.deleteDocument()` directly and returns synchronous job completion (reactor.ts:330-365)
    - **TODO**: Refactor `create()` and `deleteDocument()` to use the queue pipeline
2.  **Executor Writes to Legacy Storage** (✅ Complete):
    - ✅ `SimpleJobExecutor` takes `IDocumentOperationStorage` as a constructor dependency (simple-job-executor.ts:15-18)
    - ✅ After processing a job, it writes the resulting `Operation`s to legacy storage via `operationStorage.addDocumentOperations()` (simple-job-executor.ts:66-70)
    - **Goal**: This validates the entire `Facade -> Queue -> Executor` pipeline is working correctly before introducing any new storage.

## Phase 5: Introduce `IOperationStore` with Dual-Writing

With the job pipeline validated, we now introduce the new `IOperationStore` and populate it in parallel.

1.  **Implement `IOperationStore`**:
    - Define and implement the `IOperationStore` in `packages/reactor`.
2.  **Enable Dual-Writing**:
    - Modify the `IJobExecutor` to write to **both** the legacy `IDriveOperationStorage` and the new `IOperationStore`.
    - **Goal**: This safely populates the new store. We can add validation logic to compare the data in both stores to ensure consistency and correctness of the new implementation.

## Phase 6: Implement and Validate `IDocumentView`

With the `IOperationStore` being populated, we can now build and validate the new read model without making it live.

1.  **Implement `IDocumentView`**:
    - Define and implement the `IDocumentView` interface, which subscribes to the `IEventBus` and builds its state from `IOperationStore`.
2.  **Validate Read Path**:
    - **Goal**: We can now run comparison tests. For any given document, we can query its state via both the legacy system and the new `IDocumentView` and assert the results are identical, proving the correctness of our new read path.

## Phase 7: Promote `IOperationStore` to Source of Truth

This is the official switchover, where the new system becomes the authoritative source of truth.

1.  **Disable Dual-Write**:
    - Modify the `IJobExecutor` to write **only** to the new `IOperationStore`. The write to the legacy storage is removed.
2.  **Implement and Integrate Legacy Adapters**:
    - Create `OperationStoreLegacyAdapter`: This class will implement the legacy `IDriveOperationStorage` interface, backed by the new `IOperationStore`.
    - Create `DocumentStorageLegacyAdapter`: This class will implement the legacy `IDocumentStorage` interface, backed by the new `IDocumentView`.
    - Inject both new adapters into the existing `SynchronizationManager` to satisfy all its storage dependencies. This keeps the legacy listener and sync systems fully functional, now reading from the new `Reactor` components.

## Phase 8: Isolate the Reactor Facade

With legacy systems supported by the adapter, we can fully decouple the primary `Reactor` interface.

1.  **Repoint Facade Reads to `IDocumentView`**:
    - Update the `Reactor` facade's read methods to call `IDocumentView` directly instead of legacy storage.
    - Remove any remaining `BaseDocumentDriveServer` usage in the facade.

## Phase 9 & 10: Implement and Migrate New Managers

With a stable `Reactor` core, we can now incrementally replace the legacy managers.

1.  **Implement `IReactorSubscriptionManager`** and migrate clients from the old listener system.
2.  **Implement `ISynchronizationManager`** and migrate peers from the old sync system.

## Phase 11: Deprecate Legacy Systems

Once all clients and peers have been migrated, we can remove the old systems and the adapter.

1.  **Remove Adapter** and legacy `listener-manager.ts` and `sync-manager.ts`.

## Phase 12: Final Cleanup

The final phase is to clean up the legacy codebase.

1.  **Deprecate `document-drive`**:
    - Formally remove unused parts of the `document-drive` package.
