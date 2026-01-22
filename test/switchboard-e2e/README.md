# Switchboard E2E Tests

End-to-end tests for Powerhouse Switchboard features including subgraphs, processors, and the reactor GraphQL API.

## Quick Start

### 1. One-time setup: Build ph-cli
```bash
cd clis/ph-cli
pnpm build
cd ../../test/switchboard-e2e
```

### 2. Start Switchboard (Terminal 1)
```bash
pnpm vetra:switchboard
```
This runs `ph-cli vetra --disable-connect` and starts the reactor on port 4001.

### 3. Run tests (Terminal 2)
```bash
pnpm test
```

**How it works:**
- ✅ `pnpm vetra:switchboard` starts the reactor with your local processors/subgraphs
- ✅ Tests connect to `http://localhost:4001/graphql` 
- ✅ Global setup just waits for the service to be ready
- ✅ No automatic startup/shutdown - you control the service

> **Note:** This approach gives you full control and matches how the reference tests work.

## Purpose

This test suite validates:

1. **Reactor Core** - GraphQL endpoint, drive operations, system queries
2. **Subgraphs** - Custom GraphQL APIs extending document models  
3. **Processors** - Real-time indexing of document state into queryable data

---

## Architecture

### No Mocks, Real GraphQL

These tests use **real GraphQL queries** against a **real reactor instance**. No mocking, no fake data - just pure integration testing.

```typescript
// Create a GraphQL client
const client = createTestClient();

// Execute real queries
const result = await client.request(`
  query GetTodos($driveId: ID!) {
    todos(driveId: $driveId) {
      text
      checked
    }
  }
`, { driveId });
```

### Real Processors

The `processors/todo-list/` folder contains a real processor implementation that:
- Listens to document operations
- Indexes data into queryable format (in-memory for testing)
- Provides GraphQL queries to access indexed data

### Real Subgraphs

The `subgraphs/todo-list/` folder contains a real subgraph implementation that:
- Defines custom GraphQL schema
- Implements resolvers for document operations
- Extends the reactor's GraphQL API

---

## Structure

```
switchboard-e2e/
├── README.md                           # This file
├── package.json                        # Dependencies & scripts
├── tsconfig.json                       # TypeScript config
├── vitest.config.ts                    # Vitest configuration
├── powerhouse.config.json              # Powerhouse project config
│
├── tests/                              # Test files (Vitest)
│   ├── reactor-core.test.ts           # ✅ Reactor core functionality
│   ├── processor.test.ts              # ✅ Processor indexing & queries
│   └── helpers/
│       └── graphql-client.ts          # GraphQL client helper
│
├── document-models/                    # Document model implementations
│   └── todo-list/                     # TodoList document model
│       ├── module.ts
│       ├── gen/                       # Generated types & reducers
│       └── src/                       # Custom reducers
│
├── subgraphs/                          # Subgraph implementations
│   └── todo-list/                     # TodoList subgraph
│       ├── schema.ts                  # GraphQL schema
│       └── resolvers.ts               # Query/mutation resolvers
│
└── processors/                         # Processor implementations
    └── todo-list/                     # TodoList processor
        ├── processor.ts               # Real processor logic
        └── schema.ts                  # GraphQL schema for queries
```

---

## Testing Approach

### Real GraphQL Queries

All tests use the `graphql-request` library to execute real GraphQL queries:

```typescript
import { createTestClient } from "./helpers/graphql-client.js";

const client = createTestClient();

test("Create a drive", async () => {
  const result = await client.request(`
    mutation DriveCreation($name: String!) {
      addDrive(name: $name) { id name }
    }
  `, { name: "test-drive" });
  
  expect(result.addDrive.id).toBeTruthy();
});
```

### No Playwright

We removed Playwright because:
- We don't need UI testing (it's an API)
- Vitest is faster and simpler for API testing
- GraphQL queries are more direct than HTTP requests

### Sequential Testing

Tests run sequentially to maintain state:
- Create a drive first
- Create documents in that drive
- Query the indexed data
- Verify consistency

---

## Test Coverage

### Reactor Core (`tests/reactor-core.test.ts`)
✅ GraphQL endpoint health check
✅ Drive creation
✅ Drive listing
✅ System subgraph queries

### Processor (`tests/processor.test.ts`)
✅ Document creation triggers indexing
✅ Adding todos updates index
✅ Query indexed todos
✅ Query indexed document metadata
✅ Document state matches indexed data
✅ Update operations trigger reindex
✅ Delete operations remove from index
✅ Error handling for non-existent data

---

## Configuration

### Vitest (`vitest.config.ts`)
- Runs tests sequentially (single fork)
- 60 second timeout for integration tests
- Includes tests from `tests/`, `processors/`, `subgraphs/`, etc.

### Powerhouse (`powerhouse.config.json`)
- Points to local `document-models/`, `subgraphs/`, `processors/`
- Used by reactor to load extensions
- Reactor runs on port 4001

---

## Running Tests

### One-Time Setup

Build `ph-cli` (required only once):

```bash
cd clis/ph-cli
pnpm build
```

### Run Tests

```bash
cd test/switchboard-e2e

# Run all tests (automatically starts & stops Switchboard)
pnpm test

# Run in watch mode
pnpm test:watch

# Open Vitest UI
pnpm test:ui
```

**No need to manually start Switchboard!** The test suite handles everything automatically via `global-setup.ts`.

---

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm start:switchboard` | Start reactor (Terminal 1) - `ph-cli vetra --disable-connect` |
| `pnpm test` | Run all tests (Terminal 2) - expects reactor running |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:ui` | Open Vitest UI |
| `pnpm test:full` | Shows complete workflow instructions |
| `pnpm generate` | Generate code from document models, processors, subgraphs |

---

## How It Works

### 1. Processor Indexing

When a document changes, the processor's `process()` method is called:

```typescript
async process(documentId: string, driveId: string, document: TodoListDocument) {
  // Index the document state
  const state = document.state.global;
  
  // Store todos in queryable format
  for (const item of state.items) {
    todosStore.set(item.id, {
      id: item.id,
      text: item.text,
      checked: item.checked,
      documentId,
      driveId,
    });
  }
}
```

### 2. GraphQL Queries

The processor provides GraphQL resolvers:

```typescript
getResolvers() {
  return {
    Query: {
      todos: (_, { driveId }) => {
        return Array.from(todosStore.values())
          .filter(todo => todo.driveId === driveId);
      }
    }
  };
}
```

### 3. Test Validation

Tests verify the processor works:

```typescript
// Add a todo via subgraph mutation
await client.request(`
  mutation AddTodo($docId: PHID!, $input: TodoList_AddTodoItemInput!) {
    TodoList_addTodoItem(docId: $docId, input: $input)
  }
`, { docId, input: { text: "Write tests" } });

// Query indexed data via processor
const result = await client.request(`
  query GetTodos($driveId: ID!) {
    todos(driveId: $driveId) { text }
  }
`, { driveId });

// Verify it was indexed
expect(result.todos).toContainEqual({ text: "Write tests" });
```

---

## Troubleshooting

### Error: `ph-cli is not built`

Build ph-cli:
```bash
cd clis/ph-cli && pnpm build
```

### Port 4001 already in use

Kill the existing process:
```bash
lsof -ti:4001 | xargs kill -9
```

### Tests timeout

1. Increase timeout in `vitest.config.ts`
2. Check Switchboard logs for errors
3. Manually verify: `curl http://localhost:4001/graphql`

### Import errors

Make sure you're using the correct import paths:
```typescript
// ✅ Correct
import { createAction } from "document-model";

// ❌ Wrong
import { createAction } from "document-model/core";
```

---

## Key Differences from Before

### What Changed

1. **Removed Playwright** - No longer needed for API testing
2. **Added graphql-request** - Real GraphQL client
3. **Real processor** - Actual indexing logic, not mocked
4. **Vitest for all tests** - Unified test runner
5. **Sequential testing** - Maintains state across tests

### Why It's Better

- **Faster**: Vitest is lighter than Playwright
- **Simpler**: Direct GraphQL queries instead of HTTP requests
- **More realistic**: Real processor logic, not mocks
- **Better DX**: Watch mode, UI, better error messages
- **Easier debugging**: No browser automation complexity

---

## Next Steps

Want to add more tests?

1. **Add test to `tests/processor.test.ts`**
2. **Use real GraphQL queries**
3. **Verify behavior through the API**

Example:

```typescript
test("Bulk operations work", async () => {
  // Create 100 todos
  for (let i = 0; i < 100; i++) {
    await client.request(`
      mutation AddTodo($docId: PHID!, $input: TodoList_AddTodoItemInput!) {
        TodoList_addTodoItem(docId: $docId, input: $input)
      }
    `, { 
      docId, 
      input: { text: `Todo ${i}` } 
    });
  }
  
  // Query all todos
  const result = await client.request(`
    query GetTodos($driveId: ID!) {
      todos(driveId: $driveId) { id }
    }
  `, { driveId });
  
  expect(result.todos.length).toBe(100);
});
```
