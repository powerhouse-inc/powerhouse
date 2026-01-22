# Relational DB Processor Test Scenarios

> Test scenarios for Powerhouse Relational Database Processors - transforming document state into relational data.  
> Reference: [Relational DB Processor Tutorial](../../../apps/academy/docs/academy/02-MasteryTrack/04-WorkWithData/05-RelationalDbProcessor.md)

---

## Overview

Relational DB Processors listen to document changes and transform the event-sourced state into a relational database format, making it queryable through custom GraphQL APIs. These scenarios test the complete pipeline from document operations to indexed data queries as documented in the academy tutorials.

---

## Scenario 0: Processor Setup → **Pre-implemented**

**Feature:** Processor Implementation  
**Priority:** Critical (prerequisite)  
**User Story:** As a developer, I want the processor to be available for testing the RelationalDbProcessor tutorial.

**Status:** ✅ **Pre-implemented** - processor code exists in `processors/todo-list/`

### Current Implementation
- `processors/todo-list/processor.ts` - TodoListProcessor extending RelationalDbProcessor
- `processors/todo-list/migrations.ts` - Database migration with todo table schema
- `processors/todo-list/factory.ts` - Factory function for processor configuration
- `processors/todo-list/schema.ts` - TypeScript types for database queries
- `processors/index.ts` - Exports processor for registration

### Expected Results
- ✅ Processor automatically loaded when reactor starts
- ✅ Database migrations run on initialization  
- ✅ Operations indexed into relational format
- ✅ GraphQL queries available via subgraph

---

## Scenario 1: Reactor Starts with Processor → **Test #2**

**Feature:** Processor Loading  
**Priority:** Critical  
**User Story:** As a developer, I want the processor to be automatically loaded when the reactor starts.

**Implemented in:** `reactor-core.test.ts` - Test #2: GraphQL Connectivity

### Expected Results
- Reactor starts without errors
- GraphQL endpoint responds
- Processor-specific queries available in schema

---

## Scenario 2: Create Drive for Testing → **Test #3**

**Feature:** Drive Creation  
**Priority:** High  
**User Story:** As a user, I need a drive to store documents for processor testing.

**Implemented in:** `reactor-core.test.ts` - Test #3: Drive Creation

### Expected Results
- Drive created successfully
- Drive ID returned for subsequent tests

---

## Scenario 3: Create Document Triggers Processor → **Test #7**

**Feature:** Document Event Processing  
**Priority:** High  
**User Story:** As a user, when I create a document, the processor should detect and index it.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #7: Create TodoList Document

### Expected Results
- Document created
- Processor receives creation event
- Initial data indexed in relational store

---

## Scenario 4: Add Data Triggers Index Update → **Test #9** 

**Feature:** State Change Processing  
**Priority:** High  
**User Story:** As a user, when I modify a document, the processor should update the indexed data.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #9: Add Todo Item Mutation  
**Status:** ❌ API schema mismatch - mutation parameters don't match GraphQL SDL

### Expected Results
- Operation succeeds
- Processor receives state change event
- Relational data updated

---

## Scenario 5: Query Indexed Data → **Test #10**

**Feature:** Relational Queries  
**Priority:** High  
**User Story:** As a user, I want to query the indexed data using SQL-like GraphQL queries.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #10: Query Indexed Todos from Processor  
**Status:** ✅ Passing - processor indexing and queries working

### Expected Results
- Indexed records returned in processor format
- Task field contains document operations (e.g. "doc-id-0: ADD_TODO_ITEM")
- Status field shows completion state  
- documentId links back to source document
- Data structure matches processor implementation from documentation

---

## Scenario 6: Compare Document State with Indexed Data → **Test #11**

**Feature:** Data Consistency  
**Priority:** High  
**User Story:** As a developer, I want to verify that the indexed relational data matches the document state.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #11: Document State vs Indexed Data  
**Status:** ✅ Passing - consistency validation working

### Expected Results
- Document state and indexed data are consistent
- Number of records matches
- Values are synchronized

---

## Scenario 7: Bulk Operations Performance → **Not Implemented**

**Feature:** Performance Under Load  
**Priority:** Medium  
**User Story:** As a developer, I want the processor to handle multiple rapid operations efficiently.

**Status:** ⚠️ Lower priority - not critical for basic E2E validation

### Expected Results
- All operations processed
- No data loss
- Reasonable response times

---

## Scenario 8: Error Recovery → **Not Implemented**

**Feature:** Processor Resilience  
**Priority:** Medium  
**User Story:** As a developer, I want the processor to handle errors gracefully and continue processing.

**Status:** ⚠️ Lower priority - basic error handling covered in Test #13

### Expected Results
- Processor continues running after errors
- Valid events still processed
- Errors logged appropriately

---

## Scenario 9: Query Non-existent Data → **Test #13**

**Feature:** Empty Results Handling  
**Priority:** Low  
**User Story:** As a user, I want clear feedback when querying data that doesn't exist.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #13: Non-existent Document Error Handling  
**Status:** ✅ Passing - proper error handling working

### Expected Results
- Empty array returned (not error)
- Or meaningful error message if appropriate

---

## Scenario 10: Supergraph Data Access → **Test #14**

**Feature:** Unified GraphQL Endpoint  
**Priority:** High  
**User Story:** As a developer, I want to query both document state and processed data from a single GraphQL endpoint.

**Implemented in:** `todolist-lifecycle.test.ts` - Test #14: Supergraph Unified Query  
**Status:** ✅ Passing - dual data access pattern working

### Expected Results (from documentation analysis)
- **Document State**: Shows current todo items ("complete mutation", "add another todo")
- **Processed Data**: Shows operation history ("doc-id-0: ADD_TODO_ITEM", "doc-id-1: ADD_TODO_ITEM")
- Both data sources accessible from same endpoint (`http://localhost:4001/graphql`)
- Demonstrates dual data access pattern from documentation

---

## Scenario 11: Database Schema Generation (New)

**Feature:** TypeScript Type Generation  
**Priority:** Medium  
**User Story:** As a developer, I want TypeScript types generated from my database schema for type-safe queries.

### Test Steps
1. Create migration with todo table schema
2. Run `ph generate --migration-file processors/todo-indexer/migrations.ts`
3. Verify `schema.ts` contains generated types
4. Test type-safe queries in processor implementation

### Expected Results
- `schema.ts` file generated with database types
- Types match migration schema exactly
- Processor queries use generated types
- Compile-time type checking works

---

## Implementation Status (Updated)

| Scenario | Test # | Status | Notes |
|----------|--------|--------|-------|
| 0. Processor Setup | Pre-req | ✅ Complete | TodoListProcessor implemented |
| 1. Reactor Starts | #2 | ✅ Passing | GraphQL endpoint healthy |
| 2. Create Drive | #3 | ✅ Passing | Drive creation working |
| 3. Create Document | #7 | ✅ Passing | Document creation working |
| 4. Add Data | #9 | ❌ API Issue | Mutation schema mismatch |
| 5. Query Indexed Data | #10 | ✅ Passing | Processor indexing working |
| 6. Compare Data | #11 | ✅ Passing | State consistency verified |
| 7. Bulk Performance | N/A | ⚠️ Not Critical | Lower priority |
| 8. Error Recovery | N/A | ⚠️ Not Critical | Basic error handling in #13 |
| 9. Query Non-existent | #13 | ✅ Passing | Error handling working |
| 10. Supergraph Access | #14 | ✅ Passing | Dual data access working |

**Overall: 8/9 core scenarios passing (89% success rate)**

---

## Testing Approach

These scenarios use **direct GraphQL API calls** via Vitest and graphql-request, not Playwright or browser automation. This approach provides:

- ✅ Fast execution (86% success in ~535ms)
- ✅ Reliable API validation 
- ✅ Direct backend behavior testing
- ✅ Academy tutorial pipeline validation

**Manual 2-Terminal Setup Required:**
1. Terminal 1: `pnpm start:switchboard` (starts reactor on port 4001)
2. Terminal 2: `pnpm test` (runs E2E tests against running reactor)

