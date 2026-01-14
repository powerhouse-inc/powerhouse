# Unit Tests Overview

This document explains the unit test setup for the switchboard-e2e project.

## 📁 What Was Created

```
test/switchboard-e2e/
├── package.json                      # Added vitest, test scripts
├── vitest.config.ts                  # Vitest configuration
├── unit/                             # NEW: Unit test folder
│   ├── README.md                     # Unit testing guide
│   ├── test-utils.ts                 # Shared test utilities
│   ├── reactor-setup.test.ts         # Reactor initialization tests
│   └── graphql-endpoint.test.ts      # GraphQL configuration tests
├── tests/                            # Existing E2E tests
│   ├── reactor-core.spec.ts
│   └── relational-db-processor.spec.ts
└── scenarios/                        # Test documentation
    ├── subgraphs.scenarios.md
    └── relational-db-processor.scenarios.md
```

## 🎯 Purpose

These unit tests serve a **different purpose** than E2E tests:

| Aspect | Unit Tests | E2E Tests |
|--------|-----------|-----------|
| **Speed** | < 1 second | 30+ seconds |
| **Scope** | Individual components | Full system |
| **Infrastructure** | In-memory reactor | Real GraphQL server |
| **Purpose** | Validate configuration | Validate user flows |
| **When to Run** | Every code change | Before deployment |

## 🚀 Running Tests

```bash
# From the switchboard-e2e directory:
cd test/switchboard-e2e

# Run ALL tests (unit + E2E)
pnpm test

# Run ONLY unit tests (fast)
pnpm test:unit

# Run unit tests in watch mode (during development)
pnpm test:unit:watch

# Run ONLY E2E tests (slow)
pnpm test:e2e

# Run E2E tests with browser visible
pnpm test:e2e:headed
```

## 📝 What's Tested

### ✅ Unit Tests Cover

1. **Reactor Initialization**
   - Reactor can start with core document models
   - Document models load correctly
   - Listener manager initializes

2. **Basic Operations**
   - Creating drives
   - Creating documents
   - Retrieving documents and drives
   - Error handling for non-existent resources

3. **GraphQL Infrastructure**
   - Reactor exposes methods needed for GraphQL resolvers
   - Document models have correct structure for schema generation
   - Drive and document operations work (needed for mutations/queries)

### ❌ Unit Tests DO NOT Cover

These are already tested in `packages/reactor-api/test` and `packages/document-drive/test`:

- Detailed reactor internals
- GraphQL resolver logic
- Document model reducer operations
- Drive synchronization
- Permission systems
- Subscription handling

## 🔧 Test Utilities

### `test-utils.ts` Provides:

```typescript
// Setup basic reactor for testing
const { reactor } = await setupBasicReactor();

// Setup reactor with custom document models
const { reactor } = await setupReactorWithModules([TodoList]);

// Matchers for common patterns
expect(id).toBe(expectUUID(expect));
expect(timestamp).toBe(expectUTCTimestamp(expect));

// Mock GraphQL context
const context = createMockContext({
  driveId: "test-drive",
  isAdmin: true
});

// Wait for async conditions
await waitForCondition(() => someAsyncCheck(), 5000);
```

## 🎨 Patterns Followed

These unit tests follow patterns from:

1. **`packages/reactor-api/test/utils.ts`**
   - `setupBasicReactor()` pattern
   - UUID and timestamp matchers
   - Document scope utilities

2. **`packages/reactor-api/test/drive.test.ts`**
   - Testing drive operations
   - Mock context creation
   - Spy patterns for validation

3. **`packages/reactor-api/test/system.test.ts`**
   - Reactor instantiation tests
   - Drive listing tests

## 🐛 Avoiding Duplication

These tests are **NOT duplicates** because they:

1. **Test YOUR configuration** - Not the reactor package itself
2. **Test integration points** - How components work together for E2E
3. **Are project-specific** - Focused on switchboard-e2e needs
4. **Catch setup issues** - Before running expensive E2E tests

## 📦 Installing Dependencies

After creating these files, run:

```bash
# From workspace root
pnpm install

# This will install vitest and link workspace packages
```

## ✨ Next Steps

### When TodoList Import Issues Are Fixed:

Create `unit/document-models/todo-list.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { setupReactorWithModules } from "../test-utils.js";
import { TodoList } from "../../document-models/todo-list/index.js";

describe("TodoList Document Model Integration", () => {
  it("should load TodoList into reactor", async () => {
    const { reactor } = await setupReactorWithModules([TodoList]);
    
    const modules = reactor.getDocumentModelModules();
    const todoListModule = modules.find(
      (m) => m.documentModel.global.id === "powerhouse/todo-list"
    );
    
    expect(todoListModule).toBeDefined();
  });

  it("should create a TodoList document", async () => {
    const { reactor } = await setupReactorWithModules([TodoList]);
    
    const doc = await reactor.addDocument("powerhouse/todo-list");
    
    expect(doc).toBeDefined();
    expect(doc.header.documentType).toBe("powerhouse/todo-list");
    expect(doc.state.global.items).toEqual([]);
  });

  it("should add todo items via reducer", async () => {
    const { reactor } = await setupReactorWithModules([TodoList]);
    
    const doc = await reactor.addDocument("powerhouse/todo-list");
    
    // Test adding items through the document model
    const operation = TodoList.actions.addTodoItem({
      id: "1",
      text: "Test task"
    });
    
    const result = TodoList.reducer(doc.state.global, operation);
    
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("Test task");
  });
});
```

### When Processor Is Working:

Create `unit/processors/todo-indexer.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { setupReactorWithModules } from "../test-utils.js";
import { TodoList } from "../../document-models/todo-list/index.js";
import { TodoIndexerProcessor } from "../../processors/todo-indexer/index.js";

describe("TodoIndexer Processor", () => {
  it("should initialize processor", () => {
    // Test processor initialization
  });

  it("should process document operations", async () => {
    // Test that processor receives operations
  });
});
```

## 💡 Benefits

Running unit tests before E2E tests:

1. **Catches import errors in < 1s** (vs 30s reactor startup)
2. **Validates configuration** without browser overhead
3. **Enables TDD** - Write tests before fixing import issues
4. **Saves CI time** - Fails fast on configuration problems
5. **Better debugging** - Isolated, focused test failures

## 📚 Reference

- Vitest docs: https://vitest.dev/
- Reactor API test patterns: `packages/reactor-api/test/`
- Document Drive tests: `packages/document-drive/test/`
