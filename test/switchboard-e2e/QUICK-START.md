# 🚀 Quick Start - Switchboard E2E Tests

## TL;DR - Start Testing in 2 Steps

### Step 1: Start the Reactor

Open a terminal and run:

```bash
cd powerhouse/test/switchboard-e2e
node ../../packages/reactor-local/dist/src/cli.js
```

**Wait for**: `Reactor: http://localhost:4001/d/powerhouse`

**Note**: We use the built CLI (`node dist/src/cli.js`) instead of `pnpm start` because `vite-node` is not installed in the workspace.

### Step 2: Run Tests (in a new terminal)

```bash
cd powerhouse/test/switchboard-e2e
pnpm test:e2e:headed
```

---

## 📊 What's Working

### ✅ Unit Tests (11 tests)
```bash
pnpm test:unit
```
- Reactor setup validation
- GraphQL endpoint configuration
- Document operations

### ✅ E2E Tests - Reactor Core (4 tests)
```bash
pnpm test:e2e
```
- GraphQL endpoint health
- Drive creation
- Drive listing  
- System queries

### 🚧 E2E Tests - TodoList Operations (blocked, needs manual reactor)
- Document creation
- Todo item operations
- Relational DB processor queries

---

## ⚠️ Common Issues

### ❌ "ph reactor" doesn't work

**Wrong**: `ph reactor` (tries to use global npm package)

**Wrong**: `pnpm start` in reactor-local (missing `vite-node` dependency)

**Right**: 
```bash
cd powerhouse/test/switchboard-e2e
node ../../packages/reactor-local/dist/src/cli.js
```

### ❌ Port 4001 already in use

```bash
# Find and kill the process
lsof -ti:4001 | xargs kill -9
```

### ❌ Tests timeout

Make sure the reactor is actually running and responding at `http://localhost:4001/graphql`

---

## 📁 What We Have

All code is **copied from the official todo-demo repository** (no code generation needed!):

- ✅ `document-models/todo-list/` - Complete TodoList document model
- ✅ `subgraphs/todo-list/` - TodoList GraphQL subgraph
- ✅ `processors/` - Processor factory (ready for DB processor)
- ✅ All imports fixed to work with local staging branch

See `COPIED-FROM-TODO-DEMO.md` for full details.

---

## 🎯 Next Steps

1. **Verify Setup**:
   - Start reactor → Visit http://localhost:4001/graphql
   - Should see GraphQL Playground

2. **Run Tests**:
   - Unit tests should all pass
   - E2E reactor-core tests should all pass

3. **Add Processor** (when ph-cli is fixed):
   ```bash
   ph generate --processor todo-indexer --processor-type relationalDb --document-types powerhouse/todo-list
   ```

---

## 📚 More Documentation

- **README.md** - Full project overview
- **COPIED-FROM-TODO-DEMO.md** - What was copied and why
- **RUNNING-E2E-TESTS.md** - Detailed test instructions
- **GETTING-STARTED-UNIT-TESTS.md** - Unit testing guide
- **scenarios/** - Test scenarios in plain English
