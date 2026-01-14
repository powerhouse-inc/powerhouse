# Switchboard E2E Unit Tests

This folder contains **unit tests** that validate the infrastructure and configuration used by the E2E tests.

## Philosophy

These unit tests serve a specific purpose in the switchboard-e2e project:

1. **Fast feedback** - Run in milliseconds without starting servers
2. **Infrastructure validation** - Verify reactor setup, document models load correctly
3. **E2E test support** - Catch configuration issues before running slow E2E tests
4. **Non-duplicate** - Don't repeat tests from `packages/reactor-api/test`

## What's Tested Here

### ✅ What We Test
- Reactor can initialize with required document models
- Document models have correct structure for GraphQL schema generation
- Basic document and drive operations work (infrastructure for E2E tests)
- Test utilities and helpers function correctly

### ❌ What We DON'T Test (Already Covered Elsewhere)
- Detailed reactor internals → `packages/reactor/test`
- GraphQL resolver logic → `packages/reactor-api/test`
- Document model operations → `packages/document-model/test`
- Drive synchronization → `packages/document-drive/test`

## Running Tests

```bash
# Run all unit tests
pnpm test

# Run in watch mode during development
pnpm test:watch

# Run only unit tests (not E2E)
pnpm test:unit

# Run E2E tests (separate)
pnpm test:e2e
```

## Test Structure

```
unit/
├── README.md                    # This file
├── test-utils.ts                # Shared test utilities
├── reactor-setup.test.ts        # Reactor initialization tests
├── graphql-endpoint.test.ts     # GraphQL configuration tests
└── document-models/             # Tests for custom document models
    └── todo-list.test.ts        # (Add when TodoList is fixed)
```

## When TodoList Document Model Is Fixed

Once the import issues with the TodoList document model are resolved, create:

```typescript
// unit/document-models/todo-list.test.ts
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
  });
});
```

## Writing New Tests

Follow these guidelines when adding tests:

1. **Check for duplication** - Search `packages/*/test` first
2. **Keep them fast** - Unit tests should run in < 1s each
3. **Use test utilities** - Import helpers from `test-utils.ts`
4. **Focus on integration points** - Test how components work together for E2E
5. **Document purpose** - Add comments explaining WHY, not just WHAT

## Benefits for E2E Testing

Running these unit tests before E2E tests helps:

1. **Catch import errors** immediately (before 30s reactor startup)
2. **Validate configuration** without browser automation overhead
3. **Debug faster** with focused, isolated tests
4. **Save CI time** by failing fast on configuration issues
