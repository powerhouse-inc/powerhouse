# Subgraph Test Scenarios

> Test scenarios for Powerhouse Subgraphs - extending document models with custom GraphQL APIs.  
> Reference: [Using Subgraphs Tutorial](../../../apps/academy/public/content/03-UsingSubgraphs.md)

---

## Overview

Subgraphs allow you to extend document models with custom GraphQL resolvers. These scenarios test the complete subgraph lifecycle: generation, loading, queries, and mutations.

---

## Scenario 1: Generate Subgraph Scaffolding

**Feature:** Subgraph Code Generation  
**Priority:** Critical  
**User Story:** As a developer, I want to generate subgraph scaffolding for my document model so that I can extend it with custom GraphQL functionality.

### Pre-conditions
- Document model exists (e.g., `powerhouse/todo-list`)
- ph-cli is available

### Steps (CLI - runs in global-setup.ts)
```bash
ph generate --subgraph todo-list --document-types powerhouse/todo-list
```

### Expected Results
- `subgraphs/todo-list/` folder created
- `schema.ts` with GraphQL type definitions
- `resolvers.ts` with resolver functions
- `index.ts` exporting the subgraph module

---

## Scenario 2: Subgraph Loads in Reactor

**Feature:** Subgraph Registration  
**Priority:** Critical  
**User Story:** As a developer, I want my subgraph to be automatically loaded when the reactor starts.

### Pre-conditions
- Subgraph code is generated
- `subgraphs/index.ts` exports the subgraph

### Test Steps
1. Start reactor (`pnpm reactor`)
2. Query GraphQL schema introspection

### Expected Results
- Reactor starts without errors
- Subgraph types appear in GraphQL schema
- Custom queries/mutations are available

### GraphQL Test
```graphql
query {
  __schema {
    types {
      name
    }
  }
}
```

---

## Scenario 3: Query Document via Subgraph

**Feature:** Custom Document Queries  
**Priority:** High  
**User Story:** As a user, I want to query my documents through custom GraphQL queries that return properly formatted data.

### Pre-conditions
- Subgraph is loaded
- At least one document exists

### GraphQL Test
```graphql
query GetTodoList($docId: PHID!, $driveId: PHID) {
  TodoList {
    getDocument(docId: $docId, driveId: $driveId) {
      id
      name
      revision
      state {
        items {
          id
          text
          checked
        }
      }
    }
  }
}
```

### Expected Results
- Document data returned in expected format
- State includes all items
- Revision number is accurate

---

## Scenario 4: Create Document via Subgraph Mutation

**Feature:** Document Creation Mutations  
**Priority:** High  
**User Story:** As a user, I want to create documents through GraphQL mutations.

### GraphQL Test
```graphql
mutation CreateTodoList($driveId: String, $name: String!) {
  TodoList_createDocument(driveId: $driveId, name: $name)
}
```

### Expected Results
- New document ID returned
- Document appears in drive
- Document has correct type

---

## Scenario 5: Execute Operations via Subgraph

**Feature:** Document Operations  
**Priority:** High  
**User Story:** As a user, I want to modify documents through GraphQL mutations that map to document model operations.

### GraphQL Test
```graphql
mutation AddTodo($docId: PHID!, $input: TodoList_AddTodoItemInput!) {
  TodoList_addTodoItem(docId: $docId, input: $input)
}
```

### Expected Results
- Operation succeeds
- Document state is updated
- Revision increments

---

## Scenario 6: Subgraph Error Handling

**Feature:** Error Responses  
**Priority:** Medium  
**User Story:** As a user, I want to receive clear error messages when operations fail.

### Test Cases
1. Query non-existent document
2. Invalid operation input
3. Unauthorized access (if auth enabled)

### Expected Results
- GraphQL errors with meaningful messages
- Error codes for programmatic handling
- No server crashes

---

## Implementation Status

| Scenario | Status | Notes |
|----------|--------|-------|
| 1. Generate Subgraph | ⏭️ Skipped | Code pre-committed from todo-demo |
| 2. Subgraph Loads | ❌ Blocked | Import errors with document-model/core |
| 3. Query Document | ❌ Blocked | Depends on Scenario 2 |
| 4. Create Document | ❌ Blocked | Depends on Scenario 2 |
| 5. Execute Operations | ❌ Blocked | Depends on Scenario 2 |
| 6. Error Handling | ❌ Blocked | Depends on Scenario 2 |

### Blocking Issue
The generated code from `todo-demo` uses imports from `document-model/core` which doesn't exist in the current staging branch. Functions like `defaultBaseState`, `createBaseState`, and `createAction` need to be imported from `document-model` directly.

