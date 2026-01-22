# Subgraph Test Scenarios

> Test scenarios for Powerhouse Subgraphs - extending document models with custom GraphQL APIs.  
> Reference: [Using Subgraphs Tutorial](../../../apps/academy/docs/academy/02-MasteryTrack/04-WorkWithData/03-UsingSubgraphs.md)

---

## Overview

Subgraphs allow you to extend document models with custom GraphQL resolvers. These scenarios test the complete subgraph lifecycle: generation, loading, queries, and mutations as documented in the academy tutorials. Subgraphs can connect to external APIs, databases, relational data stores, and analytics stores.

---

## Scenario 1: Subgraph Setup → **Pre-implemented**

**Feature:** Subgraph Implementation  
**Priority:** Critical (prerequisite)  
**User Story:** As a developer, I want the subgraph to be available for testing the UsingSubgraphs tutorial.

**Status:** ✅ **Pre-implemented** - subgraph code exists in `subgraphs/todo-list/`

### Current Implementation
- `subgraphs/todo-list/schema.ts` - GraphQL type definitions for TodoList and processor queries
- `subgraphs/todo-list/resolvers.ts` - Resolver functions accessing reactor documents and processor database
- `subgraphs/todo-list/index.ts` - Subgraph module export
- `subgraphs/index.ts` - Exports subgraph for registration

### Expected Results
- ✅ Subgraph automatically loaded when reactor starts
- ✅ TodoList document operations available via GraphQL
- ✅ Processor database queries accessible via `todos(driveId)`
- ✅ Supergraph federation working at single endpoint

---

## Scenario 2: Subgraph Loads in Reactor → **Test #2** 

**Feature:** Subgraph Registration  
**Priority:** Critical  
**User Story:** As a developer, I want my subgraph to be automatically loaded when the reactor starts.

**Implemented in:** `reactor-core.test.ts` - Test #2: GraphQL Connectivity  
**Status:** ✅ Passing - subgraphs loading and schema available

### Expected Results
- Reactor starts without errors
- Subgraph types appear in GraphQL schema
- Custom queries/mutations are available

### GraphQL Test (supergraph endpoint)
```graphql
query IntrospectSubgraph {
  __schema {
    queryType {
      fields {
        name
        description
      }
    }
  }
}
```

### Expected Fields (from documentation)
- `searchTodos` - Custom search functionality
- `TodoList` - Document model queries
- Standard reactor fields (drives, documents, etc.)

---

## Scenario 3: Query Document via Subgraph → **Test #8**

**Feature:** Custom Document Queries  
**Priority:** High  
**User Story:** As a user, I want to query my documents through custom GraphQL queries that return properly formatted data.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #8: Document Query by ID  
**Status:** ✅ Passing - document queries via subgraph working

### Expected Results
- Document data returned in expected format
- State includes all items
- Revision number is accurate

---

## Scenario 4: Create Document via Subgraph Mutation → **Test #7**

**Feature:** Document Creation Mutations  
**Priority:** High  
**User Story:** As a user, I want to create documents through GraphQL mutations.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #7: Create TodoList Document  
**Status:** ✅ Passing - document creation via subgraph working

### Expected Results
- New document ID returned
- Document appears in drive
- Document has correct type

---

## Scenario 5: Execute Operations via Subgraph → **Test #9**

**Feature:** Document Operations  
**Priority:** High  
**User Story:** As a user, I want to modify documents through GraphQL mutations that map to document model operations.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #9: Add Todo Item Mutation  
**Status:** ❌ API schema mismatch - mutation parameters don't match GraphQL SDL

### Expected Results
- Operation succeeds
- Document state is updated
- Revision increments

---

## Scenario 6: Subgraph Error Handling → **Test #13**

**Feature:** Error Responses  
**Priority:** Medium  
**User Story:** As a user, I want to receive clear error messages when operations fail.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #13: Non-existent Document Error Handling  
**Status:** ✅ Passing - proper error handling working

### Expected Results
- GraphQL errors with meaningful messages
- Error codes for programmatic handling
- No server crashes

---

## Scenario 7: Search Functionality → **Test #14**

**Feature:** Custom Search Queries  
**Priority:** High  
**User Story:** As a user, I want to search for todo items across documents using custom GraphQL queries.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #14: Search Todos Functionality  
**Status:** ✅ Passing - search across TodoList documents working

### Expected Results
- Returns array of document IDs containing the search term
- Searches through todo item text fields
- Filters by drive ID correctly
- Performance is acceptable for multiple documents

---

## Scenario 8: Real-time Synchronization → **Covered by Test #11**

**Feature:** Live Data Updates  
**Priority:** High  
**User Story:** As a user, I want subgraph queries to reflect document changes immediately.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #11: Document State vs Indexed Data  
**Status:** ✅ Covered - test verifies document changes are immediately reflected in queries

### Expected Results
- Subgraph data updates immediately after document operations
- No delay between document changes and query results
- Event processing pipeline works correctly
- Demonstrates real-time synchronization from documentation

---

## Scenario 9: Supergraph Federation → **Test #14**

**Feature:** Unified GraphQL Gateway  
**Priority:** Medium  
**User Story:** As a developer, I want to access multiple subgraphs from a single endpoint.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #14: Supergraph Unified Query  
**Status:** ✅ Passing - supergraph federation working

### Expected Results (from documentation)
- Single endpoint (`http://localhost:4001/graphql`) serves all subgraphs
- Subgraphs remain independent but accessible together
- Gateway routes queries to appropriate subgraphs
- Demonstrates supergraph architecture from tutorial

---

## Implementation Status (Updated)

| Scenario | Test # | Status | Notes |
|----------|--------|--------|-------|
| 1. Subgraph Setup | Pre-req | ✅ Complete | TodoList subgraph implemented |
| 2. Subgraph Loads | #2 | ✅ Passing | GraphQL schema with subgraph types |
| 3. Query Document | #8 | ✅ Passing | Document queries via subgraph |
| 4. Create Document | #7 | ✅ Passing | Document creation via subgraph |
| 5. Execute Operations | #9 | ❌ API Issue | Mutation schema mismatch |
| 6. Error Handling | #13 | ✅ Passing | Non-existent document errors |
| 7. Search Functionality | #14 | ✅ Passing | Search across documents working |
| 8. Real-time Sync | #11 | ✅ Passing | State consistency verified |
| 9. Supergraph Federation | #15 | ✅ Passing | Unified endpoint working |

**Overall: 8/9 core scenarios passing (89% success rate)**

---

## Testing Approach

These scenarios use **direct GraphQL API calls** via Vitest and graphql-request for comprehensive subgraph validation. This approach provides:

- ✅ Fast execution and reliable assertions
- ✅ Subgraph query and mutation testing
- ✅ Document model integration validation  
- ✅ Academy tutorial UsingSubgraphs pipeline verification

**Manual 2-Terminal Setup Required:**
1. Terminal 1: `pnpm start:switchboard` (loads subgraphs at startup)
2. Terminal 2: `pnpm test` (validates subgraph functionality)



