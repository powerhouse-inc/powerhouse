# How to Run E2E Tests

## 🚀 Quick Start (2 Steps)

### Step 1: Start the Reactor (Terminal 1)

```bash
cd powerhouse/test/switchboard-e2e
node ../../packages/reactor-local/dist/src/cli.js
```

**Wait for**: `Reactor: http://localhost:4001/d/powerhouse`

### Step 2: Run Tests (Terminal 2)

```bash
cd powerhouse/test/switchboard-e2e

# Run all working tests
pnpm test:e2e:all

# Or run specific test suites (see below)
```

---

## 📋 Available Test Suites

### 1️⃣ Unit Tests (No Reactor Needed)

```bash
# Run once
pnpm test:unit

# Watch mode (re-runs on file changes)
pnpm test:unit:watch
```

**Tests**: 11 tests covering reactor setup and GraphQL configuration
**Status**: ✅ All passing

---

### 2️⃣ Reactor Core E2E Tests

```bash
# Headless (CI-style)
pnpm test:e2e

# With visible browser
pnpm test:e2e:headed

# Interactive UI
pnpm test:e2e:ui
```

**Tests**: 4 tests covering:
- ✅ GraphQL endpoint health
- ✅ Drive creation
- ✅ Drive listing
- ✅ System queries

**Status**: ✅ All passing

---

### 3️⃣ Relational DB Processor Tests

```bash
# Headless (CI-style)
pnpm test:e2e:processor

# With visible browser
pnpm test:e2e:processor:headed

# Interactive UI
pnpm test:e2e:ui
```

**Tests**: 10 tests total
- ✅ **4 Working**: Basic reactor health, drive creation, error handling, playground
- ⏭️ **6 Skipped**: TodoList operations (waiting for subgraph)

**Working Tests**:
1. ✅ Reactor starts with processor loaded
2. ✅ Create drive for testing
3. ✅ Query non-existent data returns empty/error
4. ✅ GraphQL Playground loads successfully

**Skipped Tests** (need TodoList subgraph loaded):
- ⏭️ Create TodoList document
- ⏭️ Add todo items
- ⏭️ Query indexed data
- ⏭️ Compare document state with indexed data
- ⏭️ Bulk operations performance
- ⏭️ Error recovery

---

### 4️⃣ All E2E Tests

```bash
# Run everything (reactor-core + processor tests)
pnpm test:e2e:all

# With visible browser
pnpm playwright test --headed

# Interactive UI (best for development)
pnpm test:e2e:ui
```

---

## 🎯 What to Run When

### During Development
```bash
# Watch unit tests while coding
pnpm test:unit:watch

# Then test E2E with UI
pnpm test:e2e:ui
```

### Before Committing
```bash
# Run all tests
pnpm test
```

### CI/CD Pipeline
```bash
# Unit tests (fast, no dependencies)
pnpm test:unit

# E2E tests (requires reactor)
pnpm test:e2e:all
```

---

## 🔧 Troubleshooting

### Reactor not responding

```bash
# Check if reactor is running
lsof -i :4001

# If not, start it:
cd powerhouse/test/switchboard-e2e
node ../../packages/reactor-local/dist/src/cli.js
```

### Port 4001 already in use

```bash
# Kill the process
lsof -ti:4001 | xargs kill -9

# Then restart reactor
```

### Tests timing out

1. Verify reactor is responding: `curl http://localhost:4001/graphql`
2. Check reactor logs for errors
3. Try increasing timeout in `playwright.config.ts`

### Skipped tests not running

The 6 skipped TodoList tests are intentionally disabled because they require:
1. TodoList subgraph to be loaded by the reactor
2. (Optional) Relational DB processor configured

To enable them:
1. Verify TodoList subgraph loads (check reactor logs)
2. Remove `test.skip` and change to `test` in the spec file
3. Ensure reactor has access to the `document-models/` and `subgraphs/` folders

---

## 📊 Test Output Examples

### ✅ Successful Run
```
Running 4 tests using 1 worker
[chromium] › tests/reactor-core.spec.ts:37:3 › Reactor Core › Reactor is running
✅ Reactor GraphQL endpoint is responding
[chromium] › tests/reactor-core.spec.ts:48:3 › Reactor Core › Can create a drive
✅ Created drive: test-drive-1768341605187 (ID: 014fc0b6-...)

4 passed (2.1s)
```

### ⏭️ With Skipped Tests
```
Running 10 tests using 1 worker
✅ 4 passed
⏭️ 6 skipped

Test run completed in 3.2s
```

---

## 📚 Related Documentation

- **QUICK-START.md** - 2-step quick start guide
- **README.md** - Project overview
- **COPIED-FROM-TODO-DEMO.md** - What code was copied and why
- **scenarios/** - Test scenarios in plain English
- **RUNNING-E2E-TESTS.md** - Detailed troubleshooting guide
