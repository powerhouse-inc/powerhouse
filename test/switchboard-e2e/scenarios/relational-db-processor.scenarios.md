# Relational Database Processor Test Scenarios

> Based on: [Relational DB Processor Tutorial](../../../apps/academy/docs/academy/02-MasteryTrack/04-WorkWithData/05-RelationalDbProcessor.md)

## Overview

A relational database processor listens to document changes and transforms that data into a traditional relational database format. These scenarios verify:
- Processor generation via CLI
- Database table creation via migrations
- Automatic indexing of document operations
- Data exposure through subgraph queries

---

## How Playwright Handles CLI Commands

Playwright is designed for browser automation, but E2E tests often need to run CLI commands as setup steps. Your team already does this using **Node.js `execSync`** in `global-setup.ts`:

```typescript
import { execSync } from "child_process";

// Run CLI command before tests start
execSync("ph generate --processor todo-indexer --processor-type relationalDb", {
  cwd: projectRoot,
  stdio: "inherit",  // Shows output in console
});
```

This runs **before** any Playwright browser tests execute.

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

### How This Works in the Test Suite

```typescript
// test/switchboard-e2e/global-setup.ts
import { execSync } from "child_process";
import path from "path";

function globalSetup() {
  const projectRoot = path.resolve(__dirname, "../../");
  
  console.log("🔧 Generating relational DB processor...");
  
  // Generate processor scaffolding
  execSync(
    "ph generate --processor todo-indexer --processor-type relationalDb --document-types powerhouse/todo-list",
    { cwd: projectRoot, stdio: "inherit" }
  );
  
  // Generate TypeScript types from migration
  execSync(
    "ph generate --migration-file processors/todo-indexer/migrations.ts",
    { cwd: projectRoot, stdio: "inherit" }
  );
  
  // Build to compile generated code
  execSync("pnpm build", { cwd: projectRoot, stdio: "inherit" });
  
  console.log("✅ Processor generated and built!");
}

export default globalSetup;
```

### Verification Checklist
- [ ] `processors/todo-indexer/index.ts` file exists
- [ ] `processors/todo-indexer/migrations.ts` file exists
- [ ] `processors/todo-indexer/schema.ts` file exists (after type generation)
- [ ] Build completes without TypeScript errors

### Files Expected After Generation
```
processors/
└── todo-indexer/
    ├── index.ts        # Processor class
    ├── migrations.ts   # Database schema (up/down)
    ├── factory.ts      # Processor factory
    └── schema.ts       # Generated TypeScript types
```

---

## Scenario 1: Processor Registration and Migration

**Feature:** Processor Auto-Registration  
**Priority:** High  
**User Story:** As a developer, I want my relational DB processor to automatically create database tables when the reactor starts, so that I don't need manual database setup.

### Prerequisites
- [ ] **Scenario 0 completed** (processor generated and built)
- [ ] Processor has valid migration file

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start the reactor with `ph reactor` | Reactor starts without errors |
| 2 | Observe console output | Processor initialization message appears |
| 3 | (If DB access available) Check database | Table `todo` exists with columns `task` and `status` |

### How Playwright Can Verify This

While Playwright can't directly check the console output, it **can** verify the reactor is healthy:

```typescript
test("Reactor starts with processor", async ({ request }) => {
  // The reactor is started by Playwright's webServer config
  // We can verify it's responding
  const response = await request.get("http://localhost:4001/graphql");
  expect(response.ok()).toBeTruthy();
});
```

For console output verification, you would check the **webServer output** in Playwright config or use a logging mechanism.

### Verification Checklist
- [ ] No migration errors in console
- [ ] Processor is listening for document changes
- [ ] Database schema matches migration definition
- [ ] GraphQL endpoint is accessible

### Expected Database Schema
```sql
CREATE TABLE todo (
  task VARCHAR(255) PRIMARY KEY,
  status BOOLEAN
);
```

---

## Scenario 2: Drive Creation via GraphQL

**Feature:** Drive Management  
**Priority:** High  
**User Story:** As a user, I want to create a new drive via GraphQL, so that I can organize my documents.

### Prerequisites
- [ ] Reactor is running at `http://localhost:4001`

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open GraphQL playground at `/graphql` | Playground loads |
| 2 | Execute drive creation mutation | Drive created successfully |
| 3 | Verify response contains drive ID | Valid UUID returned |

### GraphQL Mutation
```graphql
mutation DriveCreation($name: String!) {
  addDrive(name: $name) {
    id
    slug
    name
  }
}
```

### Variables
```json
{
  "name": "tutorial"
}
```

### Expected Response
```json
{
  "data": {
    "addDrive": {
      "id": "<uuid>",
      "slug": "tutorial",
      "name": "tutorial"
    }
  }
}
```

### Verification Checklist
- [ ] Drive ID is valid UUID format
- [ ] Drive name matches input
- [ ] Drive is accessible for subsequent operations

### Test Data to Capture
- **Drive ID**: Save for use in subsequent scenarios

---

## Scenario 3: Todo Document Creation

**Feature:** Document Creation via GraphQL  
**Priority:** High  
**User Story:** As a user, I want to create a todo-list document via GraphQL, so that I can programmatically manage my documents.

### Prerequisites
- [ ] Reactor is running
- [ ] Drive exists (from Scenario 2)

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute document creation mutation | Document created |
| 2 | Verify response contains document ID | Valid UUID returned |
| 3 | Document ID is captured for next steps | ID stored |

### GraphQL Mutation
```graphql
mutation TodoDocument($driveId: String, $name: String!) {
  TodoList_createDocument(driveId: $driveId, name: $name)
}
```

### Variables
```json
{
  "driveId": "<drive-id-from-scenario-2>",
  "name": "tutorial"
}
```

### Expected Response
```json
{
  "data": {
    "TodoList_createDocument": "<document-uuid>"
  }
}
```

### Verification Checklist
- [ ] Document ID is valid UUID
- [ ] Document is associated with correct drive
- [ ] Document type is `powerhouse/todo-list`

### Test Data to Capture
- **Document ID**: Save for use in subsequent scenarios

---

## Scenario 4: Add Todo Items (Generate Operations)

**Feature:** Document Operations via GraphQL  
**Priority:** High  
**User Story:** As a user, I want to add items to my todo list via GraphQL, so that the processor can track these operations.

### Prerequisites
- [ ] Reactor is running
- [ ] Drive and document exist (from Scenarios 2 & 3)
- [ ] `todo-indexer` processor is active

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute add todo mutation (item 1) | Revision 1 returned |
| 2 | Execute add todo mutation (item 2) | Revision 2 returned |
| 3 | Execute add todo mutation (item 3) | Revision 3 returned |

### GraphQL Mutation
```graphql
mutation AddTodo(
  $driveId: String
  $docId: PHID
  $input: TodoList_AddTodoItemInput
) {
  TodoList_addTodoItem(driveId: $driveId, docId: $docId, input: $input)
}
```

### Variables (repeat with different text)
```json
{
  "driveId": "<drive-id>",
  "docId": "<document-id>",
  "input": {
    "text": "complete mutation"
  }
}
```

### Items to Add
1. `"complete mutation"`
2. `"add another todo"`
3. `"Now check the data"`

### Expected Response (for each)
```json
{
  "data": {
    "TodoList_addTodoItem": 1  // increments: 1, 2, 3
  }
}
```

### Verification Checklist
- [ ] Each mutation returns incrementing revision number
- [ ] No errors during operation execution
- [ ] Operations are being processed (check processor logs if available)

---

## Scenario 5: Query Processed Relational Data

**Feature:** Subgraph Query for Processed Data  
**Priority:** High  
**User Story:** As a user, I want to query the relational database via GraphQL, so that I can see indexed operation history.

### Prerequisites
- [ ] Scenarios 1-4 completed
- [ ] Processor has indexed the operations

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute todos query | Indexed records returned |
| 2 | Verify record count | 3 records (one per operation) |
| 3 | Verify record format | Contains document ID and operation type |

### GraphQL Query
```graphql
query {
  todos(driveId: "<drive-id>") {
    task
    status
  }
}
```

### Expected Response
```json
{
  "data": {
    "todos": [
      {
        "task": "<document-id>-0: ADD_TODO_ITEM",
        "status": true
      },
      {
        "task": "<document-id>-1: ADD_TODO_ITEM",
        "status": true
      },
      {
        "task": "<document-id>-2: ADD_TODO_ITEM",
        "status": true
      }
    ]
  }
}
```

### Verification Checklist
- [ ] Number of records matches number of operations
- [ ] Task field contains document ID and operation index
- [ ] Operation type (`ADD_TODO_ITEM`) is recorded
- [ ] Status field is populated

---

## Scenario 6: Compare Document State vs Relational Data

**Feature:** Dual Data Source Comparison  
**Priority:** Medium  
**User Story:** As a developer, I want to query both document state and processed data together, so that I can verify data consistency.

### Prerequisites
- [ ] Scenarios 1-5 completed

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute combined query | Both data sources respond |
| 2 | Compare item counts | Document has 3 items, processor has 3 records |
| 3 | Verify data consistency | Item text in document matches operation count |

### GraphQL Query
```graphql
query GetTodoList($docId: PHID!, $driveId: PHID) {
  # Processed relational data
  todos(driveId: $driveId) {
    task
    status
  }
  
  # Original document state
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

### Variables
```json
{
  "driveId": "<drive-id>",
  "docId": "<document-id>"
}
```

### Expected Response Structure
```json
{
  "data": {
    "todos": [
      { "task": "...-0: ADD_TODO_ITEM", "status": true },
      { "task": "...-1: ADD_TODO_ITEM", "status": true },
      { "task": "...-2: ADD_TODO_ITEM", "status": true }
    ],
    "TodoList": {
      "getDocument": {
        "id": "<document-id>",
        "name": "tutorial",
        "revision": 3,
        "state": {
          "items": [
            { "text": "complete mutation", "checked": false },
            { "text": "add another todo", "checked": false },
            { "text": "Now check the data", "checked": false }
          ]
        }
      }
    }
  }
}
```

### Verification Checklist
- [ ] `todos` array length equals `items` array length
- [ ] Document revision matches number of operations
- [ ] No data loss between document and relational store

---

## Scenario 7: Processor Handles Multiple Documents

**Feature:** Multi-Document Processing  
**Priority:** Medium  
**User Story:** As a user, I want the processor to track operations across multiple documents, so that I have complete audit history.

### Prerequisites
- [ ] Reactor is running with processor
- [ ] Drive exists

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create Document A | Document A ID returned |
| 2 | Add 2 items to Document A | 2 operations recorded |
| 3 | Create Document B | Document B ID returned |
| 4 | Add 3 items to Document B | 3 operations recorded |
| 5 | Query all todos for drive | 5 total records returned |

### Verification Checklist
- [ ] Records from both documents are present
- [ ] Records are distinguishable by document ID prefix
- [ ] No cross-contamination between documents

---

## Scenario 8: Processor Namespace Isolation

**Feature:** Drive-Specific Data Isolation  
**Priority:** Medium  
**User Story:** As a developer, I want each drive's data to be isolated, so that queries for one drive don't return data from another.

### Prerequisites
- [ ] Two drives exist: "drive-a" and "drive-b"
- [ ] Each drive has at least one todo document with items

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Query todos for "drive-a" | Only drive-a records returned |
| 2 | Query todos for "drive-b" | Only drive-b records returned |
| 3 | Verify no overlap | Document IDs are drive-specific |

### Verification Checklist
- [ ] Queries are properly scoped to drive
- [ ] No data leakage between drives
- [ ] Processor namespacing works correctly

---

## Scenario 9: Error Recovery - Duplicate Operations

**Feature:** Idempotent Operation Handling  
**Priority:** Low  
**User Story:** As a developer, I want the processor to handle replayed operations gracefully, so that data integrity is maintained.

### Prerequisites
- [ ] Processor uses `onConflict` handling in inserts

### Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add a todo item | Record created |
| 2 | (Simulate) Replay the same operation | No duplicate record |
| 3 | Query todos | Only one record for that operation |

### Verification Checklist
- [ ] No duplicate entries in database
- [ ] No errors thrown on conflict
- [ ] Data remains consistent

---

## Implementation Notes for Developers

### Test Flow Dependency
```
Scenario 0 (Generate) → Scenario 1 (Registration) → Scenario 2 (Drive) → Scenario 3 (Document) → Scenario 4 (Items) → Scenario 5-6 (Queries)
       ↓                        ↓
   global-setup.ts          Playwright tests start here
   (Node.js CLI)            (Browser/HTTP automation)
```

### Understanding CLI vs Playwright

| What | Tool | When it runs |
|------|------|--------------|
| `ph generate` commands | Node.js `execSync` | `global-setup.ts` (before tests) |
| `pnpm build` | Node.js `execSync` | `global-setup.ts` (before tests) |
| `ph reactor` | Playwright `webServer` | Automatically started before tests |
| GraphQL queries | Playwright `request` | During test execution |
| UI interactions | Playwright `page` | During test execution |

### Playwright Config for Reactor

```typescript
// playwright.config.ts
export default defineConfig({
  globalSetup: "./global-setup.ts",  // Runs CLI commands first
  globalTeardown: "./global-teardown.ts",
  
  webServer: [
    {
      command: "ph reactor",           // Starts reactor before tests
      url: "http://localhost:4001/graphql",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

### Key GraphQL Endpoints
| Endpoint | Purpose |
|----------|---------|
| `POST /graphql` | Execute mutations and queries |
| `GET /graphql` | GraphQL playground |

### Processor Filter Configuration
```typescript
filter: {
  branch: ["main"],
  documentId: ["*"],
  documentType: ["powerhouse/todo-list"],
  scope: ["global"],
}
```

### Test File Locations
```
test/switchboard-e2e/
├── global-setup.ts                              # CLI commands (generate, build)
├── global-teardown.ts                           # Cleanup after tests
├── playwright.config.ts                         # Playwright configuration
└── tests/
    └── relational-db-processor.spec.ts          # Playwright tests
```

### Two Ways to Test GraphQL

| Approach | Use Case | Playwright Feature |
|----------|----------|-------------------|
| **API Testing** | Business logic, data validation | `request` fixture |
| **UI Testing** | Playground functionality | `page` fixture |

**Recommendation**: Use API testing for most scenarios (faster, more reliable). Use UI testing only when specifically testing the GraphQL Playground interface.

### Example: API Testing (Recommended)

```typescript
// tests/relational-db-processor.spec.ts
import { test, expect } from "@playwright/test";

const GRAPHQL_ENDPOINT = "http://localhost:4001/graphql";

// Helper function for GraphQL requests
async function graphql(request: any, query: string, variables = {}) {
  const response = await request.post(GRAPHQL_ENDPOINT, {
    headers: { "Content-Type": "application/json" },
    data: { query, variables },
  });
  return response.json();
}

// Scenario 1: Verify reactor is running (processor loaded)
test("reactor starts with processor", async ({ request }) => {
  const response = await request.get(GRAPHQL_ENDPOINT);
  expect(response.ok()).toBeTruthy();
});

// Scenario 2: Create drive
test("create drive via GraphQL", async ({ request }) => {
  const result = await graphql(request, `
    mutation CreateDrive($name: String!) {
      addDrive(name: $name) {
        id
        name
      }
    }
  `, { name: "test-drive" });
  
  expect(result.errors).toBeUndefined();
  expect(result.data.addDrive.name).toBe("test-drive");
});

// Scenario 3: Create todo document
test("create todo document", async ({ request }) => {
  const result = await graphql(request, `
    mutation CreateDoc($driveId: String, $name: String!) {
      TodoList_createDocument(driveId: $driveId, name: $name)
    }
  `, { driveId: "test-drive", name: "My Todos" });
  
  expect(result.errors).toBeUndefined();
  expect(result.data.TodoList_createDocument).toBeTruthy();
});

// Scenario 5: Query processed data
test("query indexed todos", async ({ request }) => {
  const result = await graphql(request, `
    query GetTodos($driveId: String!) {
      todos(driveId: $driveId) {
        task
        status
      }
    }
  `, { driveId: "test-drive" });
  
  expect(result.errors).toBeUndefined();
  expect(result.data.todos).toBeInstanceOf(Array);
});
```

### Example: UI Testing (GraphQL Playground)

Use this when you specifically want to test the Playground UI works:

```typescript
test("GraphQL Playground loads and is functional", async ({ page }) => {
  // Navigate to playground
  await page.goto("http://localhost:4001/graphql");
  await page.waitForLoadState("networkidle");
  
  // Verify playground loaded (check for common elements)
  const hasPlayground = await page.locator("body").evaluate((body) => {
    const text = body.textContent?.toLowerCase() || "";
    return text.includes("query") || text.includes("graphql");
  });
  
  expect(hasPlayground).toBeTruthy();
});
```

### Database Verification (if needed)
For scenarios requiring direct DB verification, consider:
- Adding a test-only GraphQL query to inspect raw DB state
- Using Prisma client in test setup for direct DB access
- Checking processor logs for migration success messages

