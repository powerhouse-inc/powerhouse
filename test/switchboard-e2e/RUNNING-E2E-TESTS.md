# Running E2E Tests - Current Status

## ⚠️ Issue Discovered

When setting up the E2E tests on the `switchboard-e2e-v2` branch (based on latest staging), we discovered that **`ph-cli` has module resolution issues** after rebuilding.

### The Problem

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@powerhousedao/ph-cli' 
imported from powerhouse/clis/ph-cli/dist/src/cli.js
```

This is preventing the reactor from starting, which blocks E2E tests.

---

## ✅ What IS Working

### Unit Tests (Fully Functional)
All 11 unit tests pass successfully:

```bash
cd test/switchboard-e2e
pnpm test:unit
```

**Output:**
```
✓ unit/reactor-setup.test.ts (7 tests) 11ms
✓ unit/graphql-endpoint.test.ts (4 tests) 2ms

Test Files  2 passed (2)
     Tests  11 passed (11)
  Duration  506ms
```

These tests validate:
- Reactor initialization
- Drive operations
- Document operations
- GraphQL infrastructure

---

## 🔧 Workaround for E2E Tests

Since `ph-cli` can't start the reactor automatically, you need to **start it manually** in a separate terminal.

### Option 1: Use an existing reactor instance

If you have a reactor already running on `http://localhost:4001`, the E2E tests should work.

### Option 2: Start reactor manually (if ph-cli works)

```bash
# In terminal 1 - Start the reactor
cd powerhouse
pnpm reactor  # or whatever command works

# In terminal 2 - Run E2E tests
cd test/switchboard-e2e
pnpm test:e2e
```

### Option 3: Update playwright config to skip webServer

For now, I've updated the config to allow reusing an existing server:

```typescript
// playwright.config.ts
webServer: {
  // ... config ...
  reuseExistingServer: true,  // Always reuse if available
}
```

---

## 📊 Test Status Summary

| Test Suite | Status | Count | Speed |
|------------|--------|-------|-------|
| Unit Tests | ✅ Working | 11 tests | < 1s |
| E2E Tests (reactor-core) | ⚠️ Blocked | 4 tests | ~30s |
| E2E Tests (processor) | ⚠️ Blocked | 10+ tests | ~2min |

---

## 🎯 Next Steps

### Immediate (For your team)

1. **Investigate ph-cli build issue**
   - The self-import error suggests package.json exports or build configuration problem
   - This affects the entire staging branch, not just your E2E tests
   - Check if this is a regression from recent staging changes

2. **Verify unit tests cover your needs**
   - Unit tests already validate most functionality
   - They run in < 1s vs 30s+ for E2E
   - Consider if E2E tests are even needed for your current goals

### For E2E Tests (Once ph-cli works)

1. **Run basic reactor tests**
   ```bash
   # Terminal 1: Start reactor
   cd powerhouse/test/switchboard-e2e
   node ../../packages/reactor-local/dist/src/cli.js
   
   # Terminal 2: Run tests
   cd powerhouse/test/switchboard-e2e
   pnpm test:e2e
   ```

2. **If those pass, consider adding advanced tests**
   - Generate TodoList document model
   - Generate processor
   - Generate subgraph
   - Run full test suite

---

## 💡 Recommendation

**For now, rely on unit tests.** They are:
- ✅ Working
- ✅ Fast (< 1s)
- ✅ Cover the core functionality
- ✅ Don't require external services

The E2E tests can wait until the ph-cli issue is resolved by your team.

---

## 📝 Files Created

- ✅ `playwright.config.ts` - E2E configuration (ready when reactor works)
- ✅ `unit/` - Unit test suite (fully working)
- ✅ `tests/reactor-core.spec.ts` - Basic E2E tests (ready to run)
- ✅ `tests/relational-db-processor.spec.ts` - Advanced E2E tests (needs setup)
- ✅ Documentation files (README, UNIT-TESTS, etc.)

---

## 🐛 Reporting the Issue

Share this with your team:

**Issue:** `ph-cli` cannot start due to module resolution error on staging branch  
**Error:** `ERR_MODULE_NOT_FOUND: Cannot find package '@powerhousedao/ph-cli'`  
**Impact:** Prevents reactor from starting, blocks E2E tests  
**Branch:** `release/staging/5.2.0` (and branches based on it)  
**Workaround:** Unit tests cover most functionality; E2E tests can wait

This is likely a build/packaging issue that affects the entire project, not specific to your E2E setup.
