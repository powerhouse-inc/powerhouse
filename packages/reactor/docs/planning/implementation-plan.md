# Refactoring to `Reactor`: An Iterative Approach

This document outlines the plan to refactor the existing `document-drive` package into the new `Reactor` architecture. The core of this refactoring is a shift from a state-oriented storage model to an event-sourced architecture, accomplished iteratively using a facade to minimize risk and disruption.

All new development will take place in the `packages/reactor` directory, providing a clean separation from the existing `document-drive` codebase.

## Phase 1: The `IReactor` Facade ([Strangler Fig](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig) Pattern)

The first phase is to create a new `IReactor` interface that will serve as a facade over the existing `BaseDocumentDriveServer`. This allows new code to be written against the target architecture from day one, while we gradually strangle the old implementation.

1.  **Define `IReactor` and `PHDocument` v2**:
    *   In `packages/reactor`, define the `IReactor` interface based on the target architecture outlined in the planning documents.
    *   Define the new `PHDocument` v2 structure, including its `state`, `mutations`, and `history` components.

2.  **Implement the `Reactor` Facade**:
    *   Create a `Reactor` class that implements `IReactor`.
    *   Internally, this class will instantiate and hold a private reference to the `BaseDocumentDriveServer` from `document-drive`.
    *   Implement the `IReactor` methods by delegating calls to the underlying `BaseDocumentDriveServer`. This will involve:
        *   Translating incoming arguments to fit the old server's methods.
        *   Transforming the results from the old server into the new `PHDocument` v2 format before returning them.

## Phase 2: Implement Core Write Path Components

Instead of immediately writing to a new store, we first build the new asynchronous pipeline for handling mutations.

1.  **Implement `IEventBus`**:
    *   Within `packages/reactor`, define and implement the `IEventBus` interface as an in-memory pub/sub system.

2.  **Implement `IQueue`**:
    *   Define and implement the `IQueue` interface, along with its durable companion, `IQueueJournal`. This component will manage job dependencies and states.

3.  **Implement `IJobExecutorManager`**:
    *   Define and implement the `IJobExecutorManager` and `IJobExecutor` interfaces. This component will be responsible for pulling jobs from the queue, handling execution logic (like retries and validation), and eventually writing operations.

## Phase 3: Transition Write Path & Implement Read Model

With the core pipeline components defined, we now make the new `Reactor` write path the authoritative source for all changes.

1.  **Update Facade and Executor**:
    *   Modify the `Reactor` facade's mutation methods to `enqueue` jobs into the `IQueue`.
    *   The `IJobExecutor` will be configured to write the resulting `Operation`s **only** to the new `IOperationStore`. This store is now the single source of truth for operations.

2.  **Implement `IDocumentView`**:
    *   Define and implement the `IDocumentView` interface.
    *   It will subscribe to the `IEventBus` to learn about new operations from the `IJobExecutor` and will build its cached document states by reading from `IOperationStore`.

## Phase 4: Create Legacy System Adapter

This is the key step to keep the existing listener and sync systems running. We create an adapter that makes the new storage system "look" like the old one.

1.  **Implement Storage Adapter**:
    *   Create a new class, `OperationStoreLegacyAdapter`, that implements the legacy `IDriveOperationStorage` interface from `document-drive`.
    *   This adapter will be backed by the new `IOperationStore` and `IDocumentView`. When a method is called on the adapter, it will fetch the necessary data from the new components and translate it into the format expected by the old interface.

2.  **Integrate Adapter**:
    *   Modify the initialization of the existing `SynchronizationManager` (from `sync-manager.ts`) to use the new `OperationStoreLegacyAdapter` as its storage backend.
    *   Since the existing `ListenerManager` depends on `SynchronizationManager`, both legacy systems will now transparently read their data from the new `Reactor` storage system, allowing them to function without modification.

## Phase 5: Isolate the Reactor Facade

With the legacy systems supported by the adapter, we can now fully decouple the primary `Reactor` interface.

1.  **Shift Facade Reads**:
    *   Update the `Reactor` facade's read methods to source their data from the new `IDocumentView`.
    *   Remove the internal instance of `BaseDocumentDriveServer` from the facade. The `IReactor` interface is now fully served by the new-world components.

## Phase 6: Implement and Migrate to New Subscription Manager

Now we can begin to incrementally replace the legacy `listener-manager.ts`.

1.  **Implement `IReactorSubscriptionManager`**:
    *   Build the new subscription manager as planned, using `IEventBus` for updates.
2.  **Migrate Clients**:
    *   Gradually migrate application clients from the old listener system to the new `IReactorSubscriptionManager`. Both systems can run in parallel, as the old one is kept alive by the adapter.

## Phase 7: Implement and Migrate to New Synchronization Manager

Similarly, we can now replace the legacy `sync-manager.ts`.

1.  **Implement `ISynchronizationManager`**:
    *   Build the new `ISynchronizationManager` and `IChannel` abstractions as planned.
2.  **Migrate Peers**:
    *   Gradually migrate synchronization connections and peers to use the new, more robust synchronization system.

## Phase 8: Deprecate Legacy Managers

Once all clients and peers have been migrated, we can remove the old systems and the adapter.

1.  **Remove Adapter**:
    *   With no components left using it, the `OperationStoreLegacyAdapter` can be deleted.
2.  **Remove Legacy Managers**:
    *   The `listener-manager.ts` and `sync-manager.ts` files, and their related dependencies in `document-drive`, can now be safely removed.

## Phase 9: Final Data Migration and Cleanup

The final phase is to migrate any remaining historical data and clean up the legacy codebase.

1.  **One-Time Data Migration**:
    *   Develop a script to migrate all data from the old `document-drive` storage system into the new `IOperationStore`. This script will handle documents and history created before the `Reactor` facade was introduced.

2.  **Deprecate `document-drive`**:
    *   Begin the process of formally deprecating any remaining parts of the `document-drive` package.
    *   Ultimately, the `document-drive` package can be removed or significantly reduced in scope. 