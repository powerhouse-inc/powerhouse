# Switchboard E2E Tests

End-to-end tests for Powerhouse Switchboard features including subgraphs, processors, and the reactor GraphQL API.

## Quick Start

```bash
# Install dependencies (from workspace root)
pnpm install

# Run tests with visible browser
pnpm test:headed

# Run tests in background
pnpm test

# Open test UI
pnpm test:ui
```

## Quick Start with AI

Want to write tests with AI assistance? See [GETTING-STARTED-WITH-AI.md](./GETTING-STARTED-WITH-AI.md) for how to use Playwright MCP with an AI agent.

---

## Purpose

This test suite validates:

1. **Reactor Core** - GraphQL endpoint, drive operations, system queries
2. **Subgraphs** - Custom GraphQL APIs extending document models  
3. **Processors** - Relational DB processors that index document state

---

## Structure

```
switchboard-e2e/
├── README.md                           # This file
├── GETTING-STARTED-WITH-AI.md         # Guide for AI-assisted testing
├── package.json                        # Dependencies & scripts
├── tsconfig.json                       # TypeScript config
├── playwright.config.ts                # Playwright configuration
├── powerhouse.config.json              # Powerhouse project config
├── powerhouse.manifest.json            # Generated manifest
├── todo.phdm.zip                       # Document model definition
│
├── scenarios/                          # Test scenario documentation
│   ├── subgraphs.scenarios.md         # Subgraph test scenarios
│   └── relational-db-processor.scenarios.md  # Processor test scenarios
│
├── document-models/                    # Generated document model code
│   └── todo-list/                     # TodoList document model
│       ├── module.ts                  # Module export
│       ├── gen/                       # Generated types & reducers
│       └── src/                       # Custom reducers & tests
│
├── subgraphs/                          # Generated subgraph code
│   └── todo-list/                     # TodoList subgraph
│       ├── schema.ts                  # GraphQL schema
│       └── resolvers.ts               # Query/mutation resolvers
│
├── processors/                         # Processor code (placeholder)
│   └── index.ts
│
├── editors/                            # Editor code (placeholder)
│   └── index.ts
│
└── tests/                              # Playwright test files
    ├── reactor-core.spec.ts           # ✅ Working - basic reactor tests
    └── relational-db-processor.spec.ts # ⚠️ Partially blocked - processor tests
```

---

## Current Test Status

### ✅ Working Tests (Reactor Core)
- Reactor health check - GraphQL endpoint responds
- Create drive - Drive creation via mutation
- List drives - Query existing drives
- System query - System subgraph accessible

### ❌ Blocked Tests (Document Model)
- Create TodoList document
- Add todo items
- Query document state

**Blocking Issue:** The generated code from `todo-demo` uses imports from `document-model/core` which doesn't exist in the current staging branch. Functions like `defaultBaseState`, `createBaseState` need to be updated.

---

## How Scenarios Work

The `scenarios/` folder contains plain-English test scenarios following the Given → When → Then pattern. These serve as:

1. **Documentation** - What the tests should verify
2. **AI Prompts** - Feed to AI agents to generate test code
3. **Acceptance Criteria** - What "done" looks like

### Example Workflow

1. Read a scenario from `scenarios/*.scenarios.md`
2. Use AI (with Playwright MCP) to implement the test
3. Add the test to `tests/*.spec.ts`
4. Run and verify

---

## Testing Approach

### API Testing (Primary)
Most tests use direct GraphQL calls via Playwright's `request` fixture:

```typescript
test("Create a drive", async ({ request }) => {
  const result = await graphql(request, `
    mutation DriveCreation($name: String!) {
      addDrive(name: $name) { id name }
    }
  `, { name: "test-drive" });
  
  expect(result.errors).toBeUndefined();
  expect(result.data.addDrive.id).toBeTruthy();
});
```

### UI Testing (Secondary)
For testing GraphQL Playground or browser-based interactions:

```typescript
test("Playground loads", async ({ page }) => {
  await page.goto("http://localhost:4001/graphql");
  // ... UI assertions
});
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm test` | Run all tests (headless) |
| `pnpm test:headed` | Run with visible browser |
| `pnpm test:ui` | Open Playwright Test UI |
| `pnpm report` | Show last test report |
| `pnpm reactor` | Start the reactor manually |

---

## Configuration

### Playwright (`playwright.config.ts`)
- Starts reactor via `webServer` before tests
- Uses Chromium browser
- Traces and screenshots on failure

### Powerhouse (`powerhouse.config.json`)
- Points to local `document-models/`, `subgraphs/`, etc.
- Used by reactor to load extensions

---

## Troubleshooting

### "Cannot find module 'document-model/core'"
The generated code uses old import paths. Change:
```typescript
// ❌ Old (doesn't work)
import { createAction } from "document-model/core";

// ✅ New (works)
import { createAction } from "document-model";
```

### Reactor won't start
1. Check if port 4001 is already in use
2. Try `pnpm reactor` manually to see errors
3. Rebuild: `cd clis/ph-cli && pnpm build`

### Tests timeout
Increase timeout in `playwright.config.ts` or check reactor logs for errors.

