# Refactoring Testing Strategy

This document outlines the testing strategy for each phase of the `document-drive` to `Reactor` refactoring plan. The goal is to ensure each step is verifiable and maintains system consistency.

## Phase 1: The `IReactor` Facade

-   **Goal**: Validate that the facade is a behaviorally identical, drop-in replacement for the old entry point.
-   **Challenge**: `BaseDocumentDriveServer` is difficult to mock, and a comprehensive integration test suite does not exist.
-   **Revised Strategy**:
    1.  **Create Characterization Tests**: Before implementing the facade, we will create a new, targeted test suite. This suite will instantiate a real `BaseDocumentDriveServer` using an in-memory storage implementation. It will test the critical public API of the server (e.g., creating documents, applying operations, retrieving state). This suite establishes the "golden standard" for behavior.
    2.  **Implement the Facade**: Create the `IReactor` facade which wraps the `BaseDocumentDriveServer`.
    3.  **Run Tests Against the Facade**: Adapt the characterization test suite to run against the new `IReactor` facade. The underlying setup will be the same: the facade will wrap a real `BaseDocumentDriveServer` with in-memory storage. The tests will verify that performing actions through the facade produces the exact same results and side effects as interacting with the `BaseDocumentDriveServer` directly. Success here proves the facade is a transparent, behaviorally-identical wrapper.

## Phase 2: Core Write Path Components

-   **Goal**: Verify the correctness of the new, isolated `IQueue`, `IEventBus`, and `IJobExecutorManager` components.
-   **Unit Tests**:
    -   `IEventBus`: Test pub/sub functionality, async handlers, and subscription management.
    -   `IQueue`: Mock the `IQueueJournal`. Test job enqueueing, dependency graph logic (cycle detection), state transitions, and startup recovery from the journal.
    -   `IJobExecutorManager`: Mock the `IQueue`. Verify it pulls jobs on `JOB_AVAILABLE` events and respects concurrency settings.

## Phase 3: Transition Write Path & Implement Read Model

-   **Goal**: Ensure the new write path correctly persists operations and that the new read model (`IDocumentView`) accurately reflects this state.
-   **Unit Tests**:
    -   `IDocumentView`: Mock `IEventBus` and `IOperationStore`. Emit a mock "operation added" event and assert that the view correctly fetches data and builds the document state.
-   **Integration Tests**:
    -   Test the full write path: Call a mutation on the `Reactor` facade and assert that the correct operation is persisted in `IOperationStore`.
    -   Test write-then-read: After the write path test succeeds, query the `IDocumentView` and assert that the document state reflects the change.

## Phase 4: Create Legacy System Adapter

-   **Goal**: Prove that the adapter makes the new storage system perfectly emulate the old one.
-   **Unit Tests**:
    -   Mock `IOperationStore` and `IDocumentView`.
    -   For each method in the legacy `IDriveOperationStorage` interface, test that the `OperationStoreLegacyAdapter` calls the correct methods on the new components and correctly transforms the data to the legacy format.
-   **Characterization Tests**:
    -   This is the most critical test. Take the entire existing test suite for `document-drive`'s `sync-manager.ts` and `listener-manager.ts`.
    -   Run this suite without modification, but inject the new `OperationStoreLegacyAdapter` as the storage implementation.
    -   **Success Criterion**: 100% of these legacy tests must pass. This validates that the new backend is a fully compliant replacement.

## Phase 5: Isolate the Reactor Facade

-   **Goal**: Validate that the `IReactor` facade is now fully powered by the new-world components and is consistent.
-   **End-to-End Tests**:
    -   Perform an action (write) and a query (read) through the `IReactor` facade.
    -   Assert that the state read back is correct. This tests the full loop of `Facade -> Queue -> Executor -> Store -> View -> Facade`.
-   **Comparison Tests**:
    -   For a given document, query for its state via both the `Reactor` facade (hitting `IDocumentView`) and the legacy `ListenerManager` (hitting the adapter).
    -   Assert that the results are identical.

## Phase 6 & 7: Migrate Subscriptions and Sync

-   **Goal**: Ensure the new `IReactorSubscriptionManager` and `ISynchronizationManager` work correctly and can run in parallel with their legacy counterparts.
-   **Integration Tests**:
    -   **Subscriptions**: Connect a test client to the new `IReactorSubscriptionManager`. Perform a mutation and assert that the client receives the correct, filtered update. Run this alongside a client connected to the old `ListenerManager` and assert both receive equivalent notifications.
    -   **Synchronization**: Set up two `Reactor` instances using the new `ISynchronizationManager`. Make a change on one instance and assert that it is correctly propagated to the second instance's `IOperationStore` and reflected in its `IDocumentView`.

## Phase 8 & 9: Deprecation and Final Migration

-   **Goal**: Ensure the system remains correct after removing legacy code and migrating historical data.
-   **Regression Testing**:
    -   After deleting the legacy managers and the adapter (`Phase 8`), run the *entire* application test suite. All tests must pass.
-   **Migration Script Testing**:
    -   The one-time data migration script must be tested against a realistic, production-like data snapshot.
    -   Write validation tools to compare a migrated document in the new `IOperationStore` against its original form in the legacy database, asserting data integrity and correctness.
-   **Final Regression Test**:
    -   After the data migration and final removal of `document-drive` code, run the full test suite one last time. 