# Getting Started with Unit Tests

## ✅ What Was Created

I've set up a complete unit testing infrastructure for your switchboard-e2e project:

### Files Created:
1. **`unit/test-utils.ts`** - Shared utilities for all unit tests
2. **`unit/reactor-setup.test.ts`** - Tests for reactor initialization
3. **`unit/graphql-endpoint.test.ts`** - Tests for GraphQL configuration
4. **`unit/README.md`** - Documentation for unit tests
5. **`vitest.config.ts`** - Vitest configuration
6. **`package.json`** - Updated with test scripts and dependencies
7. **`tsconfig.json`** - TypeScript configuration
8. **`UNIT-TESTS.md`** - Comprehensive guide
9. **`GETTING-STARTED-UNIT-TESTS.md`** - This file

## 🚀 Next Steps

### 1. Install Dependencies

Run this from the workspace root:

```bash
pnpm install
```

This will:
- Install `vitest` for unit testing
- Link workspace packages (`document-drive`, `document-model`, `@powerhousedao/reactor`)

### 2. Run Unit Tests

```bash
cd test/switchboard-e2e

# Run all unit tests
pnpm test:unit

# Run in watch mode (for development)
pnpm test:unit:watch

# Run both unit AND E2E tests
pnpm test
```

### 3. Verify Everything Works

Expected output:

```
✓ unit/reactor-setup.test.ts (6 tests)
  ✓ Switchboard Reactor Setup
    ✓ should initialize reactor with core document models
    ✓ should be able to create a drive
    ✓ should be able to list drives
    ✓ should initialize listener manager
  ✓ Switchboard Reactor Document Operations
    ✓ should be able to add a document model document
    ✓ should be able to retrieve a document by id

✓ unit/graphql-endpoint.test.ts (4 tests)
  ✓ GraphQL Endpoint Configuration
    ✓ should have a valid reactor instance for GraphQL
    ✓ should expose document models for GraphQL schema generation
    ✓ should support drive operations needed for GraphQL mutations
    ✓ should support document operations needed for GraphQL mutations

Test Files  2 passed (2)
     Tests  10 passed (10)
      Time  < 1s
```

## 💡 How This Helps

### Before (Problems):
- Import errors only discovered after 30s reactor startup
- Hard to debug configuration issues
- Slow feedback cycle

### After (Solutions):
```
pnpm test:unit → Catches import errors in < 1s ✅
                → Validates reactor config quickly ✅
                → Enables TDD workflow ✅
```

## 📚 What Gets Tested

### ✅ Unit Tests (What We Test):
- Reactor initializes with required document models
- Drive creation/retrieval works
- Document creation/retrieval works
- GraphQL infrastructure methods exist
- Configuration is valid

### ❌ Unit Tests (What We DON'T Test):
These are already tested in `packages/reactor-api/test`:
- Reactor internals (sync, cache, storage)
- GraphQL resolver logic
- Permission systems
- Subscription handling

## 🎯 Test-Driven Development Workflow

1. **Write a failing unit test** for what you need:
   ```typescript
   it("should load TodoList document model", async () => {
     const { reactor } = await setupReactorWithModules([TodoList]);
     const modules = reactor.getDocumentModelModules();
     const todoListModule = modules.find(
       (m) => m.documentModel.global.id === "powerhouse/todo-list"
     );
     expect(todoListModule).toBeDefined();
   });
   ```

2. **Run the test** - It fails with clear error:
   ```
   ✗ Cannot find module 'document-model/core'
   ```

3. **Fix the code** - Update imports in `document-models/todo-list/module.ts`

4. **Re-run test** - Now it passes in < 1s ✅

5. **Run E2E tests** - Validates end-to-end flow

## 🔍 Using Test Utilities

### Setup a Basic Reactor

```typescript
import { setupBasicReactor } from "./test-utils.js";

test("my test", async () => {
  const { reactor } = await setupBasicReactor();
  // ... test reactor
});
```

### Setup Reactor with Custom Models

```typescript
import { setupReactorWithModules } from "./test-utils.js";
import { TodoList } from "../document-models/todo-list/index.js";

test("my test", async () => {
  const { reactor } = await setupReactorWithModules([TodoList]);
  // ... test with TodoList loaded
});
```

### Use Matchers

```typescript
import { expectUUID, expectUTCTimestamp } from "./test-utils.js";

test("creates document with UUID", async () => {
  const doc = await reactor.addDocument("powerhouse/document-model");
  expect(doc.header.id).toBe(expectUUID(expect));
  expect(doc.header.createdAtUtcIso).toBe(expectUTCTimestamp(expect));
});
```

## 🐛 Troubleshooting

### "Cannot find module 'vitest'"
Run `pnpm install` from the workspace root.

### "Cannot find module 'document-drive'"
The workspace packages need to be built first:
```bash
cd powerhouse
pnpm build
```

### Tests fail with import errors
This is expected! The TodoList document model has import issues. The unit tests will help you find and fix them faster than E2E tests would.

### "EADDRINUSE: address already in use"
Unit tests don't start a server, so this shouldn't happen. If it does, you might be running E2E tests instead. Use `pnpm test:unit` specifically.

## 📖 Further Reading

- **`unit/README.md`** - Detailed unit test documentation
- **`UNIT-TESTS.md`** - Overview of testing strategy
- **`scenarios/*.scenarios.md`** - Test scenarios to implement
- **Vitest docs** - https://vitest.dev/

## 🎉 Benefits You'll See

1. **Faster development** - Get feedback in seconds, not minutes
2. **Better debugging** - Focused test failures point to exact issues
3. **Confidence** - Know your config works before running E2E
4. **TDD enabled** - Write tests first, then implement
5. **CI/CD friendly** - Fast unit tests run on every commit

## 💬 Questions?

Check the following files:
- `unit/README.md` - Unit test specific docs
- `UNIT-TESTS.md` - Testing strategy overview
- `README.md` - Main project README

Or ask your team devs - the test patterns follow the same structure as `packages/reactor-api/test`.
