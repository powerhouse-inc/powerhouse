# Subgraph Test Scenarios

> Based on: [Using Subgraphs Tutorial](../../../apps/academy/docs/academy/02-MasteryTrack/04-WorkWithData/03-UsingSubgraphs.md)

## Overview

A subgraph is a GraphQL-based modular data component that extends document model functionality. These scenarios verify that subgraphs work correctly for:
- Connecting to the Reactor
- Querying document data
- Real-time synchronization

---

## Scenario 1: Subgraph Registration

**Feature:** Subgraph Auto-Registration  
**Priority:** High  
**User Story:** As a developer, I want my custom subgraph to be automatically registered when the reactor starts, so that I can query it via GraphQL.

### Prerequisites
- [ ] Reactor is configured with a custom subgraph (e.g., `search-todos`)
- [ ] Subgraph has valid schema and resolvers

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start the reactor with `ph reactor` | Reactor starts without errors |
| 2 | Observe console output | Message: `> Registered /graphql/search-todos subgraph.` appears |
| 3 | Navigate to `http://localhost:4001/graphql` | GraphQL playground loads |
| 4 | View available queries in schema explorer | Custom query `searchTodos` is listed |

### Verification Checklist
- [ ] Subgraph endpoint responds at `/graphql/search-todos`
- [ ] Subgraph is included in the supergraph at `/graphql`
- [ ] Schema introspection shows the custom query

### Test Data Needed
- None (verifies infrastructure only)

---

## Scenario 2: Search Todos Query - Basic Functionality

**Feature:** Custom Subgraph Query  
**Priority:** High  
**User Story:** As a user, I want to search for todo items across documents, so that I can quickly find tasks containing specific text.

### Prerequisites
- [ ] Reactor is running with `search-todos` subgraph
- [ ] Drive named "powerhouse" exists
- [ ] At least one todo-list document exists with items

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open GraphQL playground at `http://localhost:4001/graphql` | Playground loads |
| 2 | Execute query (see below) | Query executes without errors |
| 3 | Verify response contains document IDs | Array of matching document IDs returned |

### GraphQL Query
```graphql
query {
  searchTodos(driveId: "powerhouse", searchTerm: "test")
}
```

### Expected Response Format
```json
{
  "data": {
    "searchTodos": ["<document-id-1>", "<document-id-2>"]
  }
}
```

### Verification Checklist
- [ ] Query returns array (even if empty)
- [ ] Returned IDs are valid document identifiers
- [ ] Only documents containing the search term are returned

### Test Data Needed
- Drive: `powerhouse`
- Document type: `powerhouse/todo-list`
- Sample todo items:
  - "Learn about subgraphs"
  - "Build a to-do list subgraph"
  - "Test the subgraph" ← should match "test"

---

## Scenario 3: Search Todos - No Results

**Feature:** Custom Subgraph Query (Empty Results)  
**Priority:** Medium  
**User Story:** As a user, I want to receive an empty array when no todos match my search, so that I know the search completed successfully.

### Prerequisites
- [ ] Reactor is running with `search-todos` subgraph
- [ ] Drive named "powerhouse" exists

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute search query with non-matching term | Query succeeds |
| 2 | Verify response | Empty array `[]` returned |

### GraphQL Query
```graphql
query {
  searchTodos(driveId: "powerhouse", searchTerm: "xyznonexistent123")
}
```

### Expected Response
```json
{
  "data": {
    "searchTodos": []
  }
}
```

### Verification Checklist
- [ ] No error is thrown
- [ ] Response is an empty array, not null

---

## Scenario 4: Real-Time Synchronization

**Feature:** Subgraph Data Sync  
**Priority:** High  
**User Story:** As a user, I want my subgraph queries to reflect the latest document changes, so that I always see up-to-date data.

### Prerequisites
- [ ] Reactor is running with `search-todos` subgraph
- [ ] Connect app is running at `http://localhost:3000`
- [ ] Drive named "powerhouse" exists with todo documents

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open GraphQL playground | Playground loads |
| 2 | Execute search query for "meeting" | Returns initial results (e.g., empty) |
| 3 | In Connect: Open a todo document | Document editor opens |
| 4 | Add new item: "Prepare for meeting" | Item is saved |
| 5 | Re-execute the same search query | Results now include the updated document |

### Verification Checklist
- [ ] New data appears without restarting reactor
- [ ] Latency between save and query availability < 5 seconds
- [ ] Deleted items are no longer returned

### Test Data Needed
- Existing todo document
- New item text: "Prepare for meeting"

---

## Scenario 5: Query Document State via Supergraph

**Feature:** Combined Supergraph Queries  
**Priority:** Medium  
**User Story:** As a developer, I want to query both document state and custom subgraph data in one request, so that I can build efficient UIs.

### Prerequisites
- [ ] Reactor is running
- [ ] Todo document exists with known ID

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute combined query (see below) | Both data sources respond |
| 2 | Verify document state data | Items array with text and checked status |
| 3 | Verify custom subgraph data | Document IDs matching search |

### GraphQL Query
```graphql
query GetTodoList($docId: PHID!, $driveId: PHID) {
  # Custom subgraph query
  searchTodos(driveId: "powerhouse", searchTerm: "Learn")
  
  # Document model query
  TodoList {
    getDocument(docId: $docId, driveId: $driveId) {
      id
      name
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

### Variables
```json
{
  "docId": "<document-id>",
  "driveId": "powerhouse"
}
```

### Verification Checklist
- [ ] Both `searchTodos` and `TodoList` return data
- [ ] No partial failures
- [ ] Response time < 3 seconds

---

## Scenario 6: Invalid Drive ID Error Handling

**Feature:** Error Handling  
**Priority:** Medium  
**User Story:** As a developer, I want clear error messages when I query a non-existent drive, so that I can debug issues quickly.

### Prerequisites
- [ ] Reactor is running

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute query with invalid drive ID | Query completes |
| 2 | Check response | Appropriate error or empty result |

### GraphQL Query
```graphql
query {
  searchTodos(driveId: "non-existent-drive", searchTerm: "test")
}
```

### Verification Checklist
- [ ] No server crash
- [ ] Response indicates drive not found (either error or empty array)
- [ ] Error message is user-friendly

---

## Implementation Notes for Developers

### Relevant Helper Functions
```typescript
// From @powerhousedao/e2e-utils
import { goToConnectDrive, createDocument } from "@powerhousedao/e2e-utils";
```

### API Endpoints to Test
| Endpoint | Purpose |
|----------|---------|
| `GET /graphql` | Supergraph playground |
| `POST /graphql` | Execute supergraph queries |
| `GET /graphql/search-todos` | Subgraph-specific endpoint |

### Test File Location
```
test/switchboard-e2e/tests/subgraphs.spec.ts
```

