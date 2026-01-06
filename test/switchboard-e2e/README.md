# Switchboard E2E Test Scenarios

This folder contains end-to-end test scenarios for Powerhouse Switchboard features, specifically:

- **Subgraphs** - Custom GraphQL endpoints that extend document model functionality
- **Relational Database Processors** - Components that sync document data to SQL databases

## 🚀 Quick Start: Writing Tests with AI

**New to testing?** You can use AI assistance to write Playwright tests from your scenario documentation!

👉 **[Read the AI-Assisted Testing Guide](./GETTING-STARTED-WITH-AI.md)**

### TL;DR - Three Ways to Write Tests

| Method | Best For | Technical Skill |
|--------|----------|-----------------|
| **Playwright MCP + Claude** | Interactive test creation | Low |
| **Scenario → Test Conversion** | Batch test generation | Low |
| **Playwright Codegen** | Recording UI interactions | Low |

## Purpose

These scenarios document the expected user journeys and behaviors based on the [Powerhouse Academy tutorials](../../apps/academy/docs/academy/02-MasteryTrack/04-WorkWithData/). They serve as:

1. **Requirements documentation** for developers implementing tests
2. **Acceptance criteria** for feature completion
3. **Regression test coverage** for critical user flows
4. **Input for AI-assisted test generation** ← New!

## Structure

```
switchboard-e2e/                             # ← This is a mini Powerhouse PROJECT
├── README.md                                # This file
├── GETTING-STARTED-WITH-AI.md              # Guide for AI-assisted test writing
├── package.json                             # Dependencies & npm scripts
├── tsconfig.json                            # TypeScript configuration
├── powerhouse.config.json                   # Powerhouse project configuration
├── playwright.config.ts                     # Playwright test configuration
├── global-setup.ts                          # Pre-test setup (generates code)
├── global-teardown.ts                       # Post-test cleanup
├── todo.phdm.zip                            # Document model definition
│
├── document-models/                         # Generated: TodoList document model
│   └── index.ts
├── editors/                                 # Generated: Document editors
│   └── index.ts
├── processors/                              # Generated: todo-indexer processor
│   └── index.ts
├── subgraphs/                               # Generated: todo subgraph
│   └── index.ts
│
├── scenarios/                               # Test scenario documentation
│   ├── subgraphs.scenarios.md              # Subgraph test scenarios
│   └── relational-db-processor.scenarios.md # DB processor test scenarios
│
└── tests/                                   # Playwright test implementations
    └── relational-db-processor.spec.ts     # Generated tests for DB processor
```

## How to Use These Scenarios

### For Product Managers
- Review scenarios to ensure they cover critical user journeys
- Add new scenarios when new features are planned
- Use as acceptance criteria during feature review

### For Developers
- Implement Playwright tests based on scenario descriptions
- Each scenario maps to one or more `test()` blocks
- Use the helper functions from `@powerhousedao/e2e-utils`

## Related Documentation

- [Using Subgraphs Tutorial](../../apps/academy/docs/academy/02-MasteryTrack/04-WorkWithData/03-UsingSubgraphs.md)
- [Relational DB Processor Tutorial](../../apps/academy/docs/academy/02-MasteryTrack/04-WorkWithData/05-RelationalDbProcessor.md)
- [Analytics Processor Tutorial](../../apps/academy/docs/academy/02-MasteryTrack/04-WorkWithData/04-analytics-processor.md)

## Running Tests

### Prerequisites

1. Install dependencies (from workspace root):
   ```bash
   pnpm install
   ```

2. Install Playwright browsers:
   ```bash
   cd test/switchboard-e2e
   pnpm exec playwright install chromium
   ```

### Run Tests

```bash
cd test/switchboard-e2e
pnpm test              # Run all tests
pnpm test:headed       # Run with visible browser
pnpm test:ui           # Run with Playwright UI
pnpm test:debug        # Run in debug mode
pnpm report            # View test report
```

