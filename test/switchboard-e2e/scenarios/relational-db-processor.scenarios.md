# Relational DB Processor Test Scenarios

> Test scenarios for Powerhouse Relational Database Processors - transforming document state into relational data.  
> Reference: [Relational DB Processor Tutorial](../../../apps/academy/public/content/05-RelationalDbProcessor.md)

---

## Overview

Relational DB Processors listen to document changes and transform the event-sourced state into a relational database format, making it queryable through custom GraphQL APIs.

---

## Scenario 0: Generate Processor (Pre-requisite)

**Feature:** Processor Code Generation  
**Priority:** Critical (must run first)  
**User Story:** As a developer, I want the processor scaffolding to be generated automatically, so that subsequent tests have the required code in place.

### Implementation Note
> ⚠️ This is a **setup step**, not a browser test. It runs in `global-setup.ts` using Node.js, not Playwright.

### CLI Commands to Execute
```bash
# Step 1: Generate the processor
ph generate --processor todo-indexer --processor-type relationalDb --document-types powerhouse/todo-list

# Step 2: Generate database types from migration
ph generate --migration-file processors/todo-indexer/migrations.ts

# Step 3: Build the project (required for changes to take effect)
pnpm build
```

### Expected Results
- `processors/todo-indexer/` folder created
- Migration file for database schema
- Listener function for document events
- GraphQL schema for querying indexed data

---

## Scenario 1: Reactor Starts with Processor

**Feature:** Processor Loading  
**Priority:** Critical  
**User Story:** As a developer, I want the processor to be automatically loaded when the reactor starts.

### Test (Playwright - API)
```typescript
test("Reactor starts with processor loaded", async ({ request }) => {
  const response = await request.post(GRAPHQL_ENDPOINT, {
    headers: { "Content-Type": "application/json" },
    data: { query: "{ __typename }" },
  });
  expect(response.ok()).toBeTruthy();
});
```

### Expected Results
- Reactor starts without errors
- GraphQL endpoint responds
- Processor-specific queries available in schema

---

## Scenario 2: Create Drive for Testing

**Feature:** Drive Creation  
**Priority:** High  
**User Story:** As a user, I need a drive to store documents for processor testing.

### GraphQL Test
```graphql
mutation DriveCreation($name: String!) {
  addDrive(name: $name) {
    id
    slug
    name
  }
}
```

### Expected Results
- Drive created successfully
- Drive ID returned for subsequent tests

---

## Scenario 3: Create Document Triggers Processor

**Feature:** Document Event Processing  
**Priority:** High  
**User Story:** As a user, when I create a document, the processor should detect and index it.

### GraphQL Test
```graphql
mutation CreateDocument($driveId: String, $name: String!) {
  TodoList_createDocument(driveId: $driveId, name: $name)
}
```

### Expected Results
- Document created
- Processor receives creation event
- Initial data indexed in relational store

---

## Scenario 4: Add Data Triggers Index Update

**Feature:** State Change Processing  
**Priority:** High  
**User Story:** As a user, when I modify a document, the processor should update the indexed data.

### GraphQL Test
```graphql
mutation AddTodo($docId: PHID!, $input: AddTodoItemInput!) {
  TodoList_addTodoItem(docId: $docId, input: $input)
}
```

### Expected Results
- Operation succeeds
- Processor receives state change event
- Relational data updated

---

## Scenario 5: Query Indexed Data

**Feature:** Relational Queries  
**Priority:** High  
**User Story:** As a user, I want to query the indexed data using SQL-like GraphQL queries.

### GraphQL Test
```graphql
query GetTodos($driveId: ID!) {
  todos(driveId: $driveId) {
    task
    status
    documentId
  }
}
```

### Expected Results
- Indexed records returned
- Data matches document state
- Query is performant

---

## Scenario 6: Compare Document State with Indexed Data

**Feature:** Data Consistency  
**Priority:** High  
**User Story:** As a developer, I want to verify that the indexed relational data matches the document state.

### GraphQL Test
```graphql
query CompareData($docId: PHID!, $driveId: PHID) {
  # Get document state
  TodoList {
    getDocument(docId: $docId, driveId: $driveId) {
      state {
        items {
          id
          text
          checked
        }
      }
    }
  }
  
  # Get indexed data
  todos(driveId: $driveId) {
    task
    status
  }
}
```

### Expected Results
- Document state and indexed data are consistent
- Number of records matches
- Values are synchronized

---

## Scenario 7: Bulk Operations Performance

**Feature:** Performance Under Load  
**Priority:** Medium  
**User Story:** As a developer, I want the processor to handle multiple rapid operations efficiently.

### Test Steps
1. Create 100 todo items rapidly
2. Query indexed data
3. Verify all items indexed

### Expected Results
- All operations processed
- No data loss
- Reasonable response times

---

## Scenario 8: Error Recovery

**Feature:** Processor Resilience  
**Priority:** Medium  
**User Story:** As a developer, I want the processor to handle errors gracefully and continue processing.

### Test Cases
1. Invalid document type events (should be ignored)
2. Database connection issues (should retry)
3. Malformed data (should log error, not crash)

### Expected Results
- Processor continues running after errors
- Valid events still processed
- Errors logged appropriately

---

## Scenario 9: Query Non-existent Data

**Feature:** Empty Results Handling  
**Priority:** Low  
**User Story:** As a user, I want clear feedback when querying data that doesn't exist.

### GraphQL Test
```graphql
query GetTodos($driveId: ID!) {
  todos(driveId: $driveId) {
    task
    status
  }
}
```
With `driveId: "non-existent-drive"`

### Expected Results
- Empty array returned (not error)
- Or meaningful error message if appropriate

---

## Implementation Status

| Scenario | Status | Notes |
|----------|--------|-------|
| 0. Generate Processor | ⏭️ Skipped | Code pre-committed |
| 1. Reactor Starts | ✅ Passing | Basic health check works |
| 2. Create Drive | ✅ Passing | Drive creation works |
| 3. Create Document | ❌ Blocked | Subgraph not loading |
| 4. Add Data | ❌ Blocked | Depends on Scenario 3 |
| 5. Query Indexed Data | ❌ Blocked | Depends on Scenario 4 |
| 6. Compare Data | ❌ Blocked | Depends on Scenario 5 |
| 7. Bulk Performance | ❌ Blocked | Depends on Scenario 4 |
| 8. Error Recovery | ❌ Not Started | |
| 9. Query Non-existent | ✅ Passing | Returns empty/error |

---

## API vs UI Testing Note

These scenarios use **direct GraphQL API calls** via Playwright's `request` fixture, not browser UI automation. This is the recommended approach for:

- Faster test execution
- More reliable assertions
- Direct validation of backend behavior

For UI-based GraphQL playground testing, see the "GraphQL Playground" test in the spec file.

