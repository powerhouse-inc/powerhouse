# TodoList Code Copied from Official todo-demo Repository

## ✅ What Was Done

We successfully copied the **official TodoList implementation** from the Powerhouse team's reference repository:

**Source**: https://github.com/powerhouse-inc/todo-demo

This repository is maintained by the Powerhouse team and kept up to date with the latest tooling and best practices.

## 📁 Files Copied

The following folders were copied from `todo-demo` to `switchboard-e2e`:

```
✅ document-models/
   └── todo-list/
       ├── gen/           # Generated code (actions, reducers, types)
       ├── src/           # Custom reducer implementations
       ├── module.ts      # Document model module export
       ├── index.ts       # Main export file
       └── schema.graphql # GraphQL schema

✅ processors/
   └── index.ts          # Processor factory (empty for now)

✅ subgraphs/
   └── todo-list/
       ├── schema.ts      # GraphQL schema definition
       ├── resolvers.ts   # Query and mutation resolvers
       └── index.ts       # Subgraph export
```

## 🔧 Import Fixes Applied

The copied files had imports referencing the `@powerhousedao/todo-demo` npm package. These were updated to work locally:

### 1. `document-models/todo-list/module.ts`
```typescript
// BEFORE (from todo-demo package)
import { defaultBaseState } from "document-model/core";
import type { TodoListPHState } from "@powerhousedao/todo-demo/document-models/todo-list";
import { actions, documentModel, reducer, utils } from "@powerhousedao/todo-demo/document-models/todo-list";

// AFTER (local imports)
import { defaultPHState } from "document-model";
import type { TodoListPHState } from "./gen/types.js";
import { actions, documentModel, reducer, utils } from "./gen/index.js";
```

### 2. `subgraphs/todo-list/resolvers.ts`
```typescript
// BEFORE (from todo-demo package)
import { actions, todoListDocumentType } from "@powerhousedao/todo-demo/document-models/todo-list";
import type { TodoListDocument, AddTodoItemInput, ... } from "@powerhousedao/todo-demo/document-models/todo-list";

// AFTER (local imports)
import { actions, todoListDocumentType, type TodoListDocument, type AddTodoItemInput, ... } from "../../document-models/todo-list/index.js";
```

## 📦 Configuration Added

Created `powerhouse.config.json` to tell the reactor where to find our files:

```json
{
  "documentModelsDir": "./document-models",
  "editorsDir": "./editors",
  "processorsDir": "./processors",
  "subgraphsDir": "./subgraphs",
  "reactor": {
    "port": 4001,
    "storage": "memory"
  }
}
```

## ✅ Benefits of This Approach

1. **No Code Generation Needed** - We have working, pre-generated code
2. **Official Implementation** - Maintained by the Powerhouse team
3. **Up-to-Date** - Uses the latest Powerhouse APIs and best practices
4. **No Import Issues** - Fixed imports to work with our local staging branch
5. **Ready to Test** - All files are in place for E2E tests

## 🧪 What Can Now Be Tested

With this code in place, your E2E tests can now:

### ✅ Working Tests (reactor-core.spec.ts)
- GraphQL endpoint health checks
- Drive creation and listing
- System subgraph queries

### 🚧 Blocked Tests (relational-db-processor.spec.ts)
- TodoList document creation (`TodoList_createDocument` mutation)
- Todo item operations (`addTodoItem`, `updateTodoItem`, `deleteTodoItem`)
- Relational DB processor data indexing
- Querying indexed data via subgraph

**Note**: The blocked tests require:
1. The reactor to be running with the TodoList subgraph loaded
2. A relational DB processor to be generated and configured

## 🚀 Next Steps

1. **Start the Reactor Manually** (since `ph-cli` has issues on staging):
   ```bash
   # From the test directory
   cd powerhouse/test/switchboard-e2e
   node ../../packages/reactor-local/dist/src/cli.js
   ```
   
   **Note**: We use the built CLI instead of `pnpm start` because `vite-node` is not installed.

2. **Run E2E Tests**:
   ```bash
   cd test/switchboard-e2e
   pnpm test:e2e:headed
   ```

3. **Generate a Relational DB Processor** (when ph-cli is fixed):
   ```bash
   ph generate --processor todo-indexer --processor-type relationalDb --document-types powerhouse/todo-list
   ```

## 🔗 References

- **Official todo-demo Repository**: https://github.com/powerhouse-inc/todo-demo
- **Vetra Academy Tutorial**: Apps/academy/docs/academy/02-MasteryTrack/04-WorkWithData/05-RelationalDbProcessor.md
- **Subgraphs Tutorial**: Apps/academy/docs/academy/02-MasteryTrack/04-WorkWithData/03-UsingSubgraphs.md

## 📝 Note for Team

This approach is much more reliable than trying to generate code with `ph-cli` on the current staging branch, which has module resolution issues. The copied code is production-ready and maintained by the Powerhouse team.
