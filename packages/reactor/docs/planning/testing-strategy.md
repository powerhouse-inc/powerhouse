# Refactoring Testing Strategy

This document outlines the testing strategy for each phase of the `document-drive` to `Reactor` refactoring plan. The goal is to ensure each step is verifiable and maintains system consistency.

## Phase 1: Foundational `PHDocument` Refactoring

-   **Goal**: Ensure `BaseDocumentDriveServer` correctly implements `PHDocument` v2 and that all consumers are updated without regressions.
-   **Strategy**:
    1.  **Create Characterization Tests**: Before any refactoring, create a new test suite against the *current* `BaseDocumentDriveServer` using in-memory storage. This suite will test critical user journeys (creating documents, applying operations, reading state) and assert on the results using the *old* `PHDocument` v1 structure. This establishes a behavioral baseline.
    2.  **Refactor and Update Tests**: Perform the refactoring of `BaseDocumentDriveServer` and all its consumers to use `PHDocument` v2. As part of this, update the characterization test suite to work with and assert against the new v2 structure.
    3.  **Validate**: Run the updated test suite against the refactored server. All tests must pass. Success proves that the core behavior of the system is unchanged, even though the data contract has been updated.

## Phase 2: The `IReactor` Facade

-   **Goal**: Validate that the facade is a behaviorally identical, drop-in replacement for the newly refactored `BaseDocumentDriveServer`.
-   **Strategy**:
    -   **Run Characterization Tests**: The test suite created in Phase 1 for the refactored `BaseDocumentDriveServer` can be run directly against the new `IReactor` facade. Since the facade now wraps a server that already speaks `PHDocument` v2, the tests should pass with minimal changes, proving the facade is a correct and simple wrapper.

## Phase 3: Core Write Path Components

-   **Goal**: Verify the correctness of the new, isolated `IQueue`, `IEventBus`, and `IJobExecutorManager` components.
-   **Strategy**:
    -   **Unit Tests**: Test each component in isolation, mocking its immediate dependencies (e.g., test `IQueue` by mocking `IQueueJournal`).

## Phase 4: Connect Facade to Legacy Write Path

-   **Goal**: Verify the new job pipeline (`Facade -> Queue -> Executor`) works correctly by using the legacy storage as its output.
-   **Strategy**:
    -   **Integration Test**: Write a test that calls a mutation method on the `Reactor` facade. Assert that the correct operations are written to the legacy `IDriveOperationStorage` by mocking or inspecting the storage layer. This confirms the new pipeline correctly processes and delegates writes.

## Phase 5: Introduce `IOperationStore` with Dual-Writing

-   **Goal**: Ensure the `IOperationStore` is being populated correctly and is consistent with the legacy store.
-   **Strategy**:
    -   **Consistency Check**: After a write, fetch the newly written operations from both the legacy `IDriveOperationStorage` and the new `IOperationStore`. Assert that the operations are identical. This test can run continuously in the background during this phase to guarantee consistency.

## Phase 6: Implement and Validate `IDocumentView`

-   **Goal**: Prove that the `IDocumentView` correctly builds state from `IOperationStore` and matches the legacy system.
-   **Strategy**:
    -   **Comparison Test**: After any write action, fetch the full document state from both the legacy `BaseDocumentDriveServer` and the new `IDocumentView`. Assert that the resulting state objects are deeply equal. This confirms the new read model is a valid replacement.

## Phase 7-12: Switchover, Migration, and Cleanup

-   **Goal**: Ensure the system remains correct as the new store becomes the source of truth and legacy code is removed.
-   **Strategy**:
    -   **Legacy Characterization Tests**: The critical test for Phase 7 is to run the entire existing test suite for `sync-manager.ts` and `listener-manager.ts`. We will inject *both* the `OperationStoreLegacyAdapter` and the `DocumentStorageLegacyAdapter` to satisfy the manager's dependencies. Success proves the adapters are compliant replacements.
    -   **Parallel Validation**: As the new `IReactorSubscriptionManager` and `ISynchronizationManager` are built (`Phase 9 & 10`), run them in parallel with the legacy systems. Write comparison tests to assert that for a given action, both the old and new managers produce equivalent results or notifications.
    -   **Full Regression**: After each major deprecation step (`Phase 11` and `Phase 12`), run the *entire* application test suite (both old and new tests) to ensure no regressions have been introduced.
    -   **Migration Script Testing**: The data migration script (`Phase 12`) must be tested against a realistic, production-like data snapshot to ensure data integrity. 