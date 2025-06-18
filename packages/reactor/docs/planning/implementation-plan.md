# Refactoring to `Reactor`: An Iterative Approach

This document outlines the plan to refactor the existing `document-drive` package into the new `Reactor` architecture. The core of this refactoring is a shift from a state-oriented storage model to an event-sourced architecture, accomplished iteratively using a facade to minimize risk and disruption.

All new development will take place in the `packages/reactor` directory, providing a clean separation from the existing `document-drive` codebase.

## Phase 1: Foundational `PHDocument` Refactoring

Before building any new `Reactor` components, we must first refactor the core data structure, `PHDocument`, within the existing `document-drive` package. This is a significant breaking change that must be handled in isolation.

1.  **Define `PHDocument` v2**:
    *   Define the new `PHDocument` v2 structure as a set of types, including its distinct `state`, `mutations`, and `history` components, based on the planning documents.

2.  **Refactor `BaseDocumentDriveServer`**:
    *   Modify the internal logic and public method signatures of the existing `BaseDocumentDriveServer` to natively produce and consume the new `PHDocument` v2 structure. The server itself will now be the source of truth for the new document format.

3.  **Update All Consumers**:
    *   Systematically update all application code that currently consumes `BaseDocumentDriveServer` or interacts with the old `PHDocument` structure. This includes UI components, utilities, and tests. This is a breaking change across the codebase, and all affected code must be updated to be compatible with `PHDocument` v2.

## Phase 2: The `IReactor` Facade ([Strangler Fig](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig) Pattern)

With the `PHDocument` structure stabilized, we can now create the `IReactor` interface as a facade.

1.  **Define `IReactor`**:
    *   In `packages/reactor`, define the `IReactor` interface based on the target architecture.
2.  **Implement the `Reactor` Facade**:
    *   Create a `Reactor` class that implements `IReactor`.
    *   Internally, this class will wrap the newly-refactored `BaseDocumentDriveServer`.
    *   **Crucially**: No complex data translation is needed. The facade is now a simple pass-through for `PHDocument` objects, as the underlying server already speaks v2.

## Phase 3: Implement Core Write Path Components

This phase proceeds as before: building the new asynchronous pipeline for handling mutations.

1.  **Implement `IEventBus`**, **`IQueue`**, and **`IJobExecutorManager`**:
    *   Within `packages/reactor`, define and implement these core components as planned.

## Phase 4: Connect Facade to Legacy Write Path

Instead of a "big bang" switch, we first validate the new job pipeline while still relying on the legacy storage system as the source of truth.

1.  **Update `Reactor` Facade Mutations**:
    *   Modify the facade's mutation methods to package requests as `Job`s and `enqueue` them into the new `IQueue`.
2.  **Executor Writes to Legacy Storage**:
    *   Configure the `IJobExecutor` to take the legacy `IDriveOperationStorage` as a dependency. After processing a job, it will write the resulting `Operation`s back to the existing legacy database.
    *   **Goal**: This validates the entire `Facade -> Queue -> Executor` pipeline is working correctly before introducing any new storage.

## Phase 5: Introduce `IOperationStore` with Dual-Writing

With the job pipeline validated, we now introduce the new `IOperationStore` and populate it in parallel.

1.  **Implement `IOperationStore`**:
    *   Define and implement the `IOperationStore` in `packages/reactor`.
2.  **Enable Dual-Writing**:
    *   Modify the `IJobExecutor` to write to **both** the legacy `IDriveOperationStorage` and the new `IOperationStore`.
    *   **Goal**: This safely populates the new store. We can add validation logic to compare the data in both stores to ensure consistency and correctness of the new implementation.

## Phase 6: Implement and Validate `IDocumentView`

With the `IOperationStore` being populated, we can now build and validate the new read model without making it live.

1.  **Implement `IDocumentView`**:
    *   Define and implement the `IDocumentView` interface, which subscribes to the `IEventBus` and builds its state from `IOperationStore`.
2.  **Validate Read Path**:
    *   **Goal**: We can now run comparison tests. For any given document, we can query its state via both the legacy system and the new `IDocumentView` and assert the results are identical, proving the correctness of our new read path.

## Phase 7: Promote `IOperationStore` to Source of Truth

This is the official switchover, where the new system becomes the authoritative source of truth.

1.  **Disable Dual-Write**:
    *   Modify the `IJobExecutor` to write **only** to the new `IOperationStore`. The write to the legacy storage is removed.
2.  **Implement and Integrate Legacy Adapters**:
    *   Create `OperationStoreLegacyAdapter`: This class will implement the legacy `IDriveOperationStorage` interface, backed by the new `IOperationStore`.
    *   Create `DocumentStorageLegacyAdapter`: This class will implement the legacy `IDocumentStorage` interface, backed by the new `IDocumentView`.
    *   Inject both new adapters into the existing `SynchronizationManager` to satisfy all its storage dependencies. This keeps the legacy listener and sync systems fully functional, now reading from the new `Reactor` components.

## Phase 8: Isolate the Reactor Facade

With legacy systems supported by the adapter, we can fully decouple the primary `Reactor` interface.

1.  **Shift Facade Reads**:
    *   Update the `Reactor` facade's read methods to source data from `IDocumentView`.
    *   Remove the internal instance of `BaseDocumentDriveServer` from the facade.

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
    *   Formally remove unused parts of the `document-drive` package. 