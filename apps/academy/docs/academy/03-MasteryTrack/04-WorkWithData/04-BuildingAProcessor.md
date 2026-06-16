# Building a processor

Processors are components that receive document operations from the reactor and perform side effects. While specialized processor types like [relational database processors](/academy/MasteryTrack/WorkWithData/RelationalDbProcessor) exist, you can build a plain processor by implementing the `IProcessor` interface directly.

In this tutorial we will build a **logging processor** that prints a structured summary of every operation to the console.

## What is a processor?

A processor implements two methods:

- **`onOperations(operations)`** — called when document operations match the processor's filter
- **`onDisconnect()`** — called when the processor is disconnected (for cleanup)

The reactor calls your processor's `onOperations` method with a list of `OperationWithContext` items. Each item pairs an `Operation` (what happened) with an `OperationContext` (where it happened).

## Key types

```typescript
import type {
  IProcessor,
  ProcessorFilter,
  ProcessorRecord,
  ProcessorFactory,
  IProcessorHostModule,
} from "@powerhousedao/reactor-browser";
import type { OperationWithContext } from "document-model";
```

:::info Import paths
`@powerhousedao/reactor-browser` re-exports these types for convenience in browser environments. If you are working outside the browser (Node.js scripts, CLI tools, server-side code), import directly from `@powerhousedao/reactor`.
:::

### `OperationWithContext`

Each item your processor receives contains:

**`context`** — where the operation happened:

| Field            | Type      | Description                                                         |
| ---------------- | --------- | ------------------------------------------------------------------- |
| `documentId`     | `string`  | The document that was modified                                      |
| `documentType`   | `string`  | e.g. `"powerhouse/todo-list"`                                       |
| `scope`          | `string`  | The scope (e.g. `"global"`, `"local"`)                              |
| `branch`         | `string`  | The branch (e.g. `"main"`)                                          |
| `ordinal`        | `number`  | Global monotonically increasing ordinal for cross-document ordering |
| `resultingState` | `string?` | JSON string of the document state after the operation               |

**`operation`** — what happened:

| Field            | Type     | Description                                          |
| ---------------- | -------- | ---------------------------------------------------- |
| `action`         | `Action` | Contains `type` (e.g. `"ADD_TODO_ITEM"`) and `input` |
| `index`          | `number` | Position in the operation history                    |
| `timestampUtcMs` | `string` | When the operation was created                       |
| `hash`           | `string` | Hash of the resulting document state                 |

### `ProcessorFilter`

Determines which operations your processor receives. All fields are optional arrays — when provided, operations must match at least one value in each specified field. When a field is omitted, it matches everything.

```typescript
type ProcessorFilter = {
  documentType?: string[]; // e.g. ["powerhouse/todo-list"]
  scope?: string[]; // e.g. ["global"]
  branch?: string[]; // e.g. ["main"]
  documentId?: string[]; // e.g. ["*"] for all documents
};
```

## 1. Implement the processor

Create `processors/operation-logger/index.ts`:

```typescript
import type { IProcessor } from "@powerhousedao/reactor-browser";
import type { OperationWithContext } from "document-model";

export class OperationLoggerProcessor implements IProcessor {
  private driveId: string;

  constructor(driveId: string) {
    this.driveId = driveId;
    console.log(`[OperationLogger] Initialized for drive: ${driveId}`);
  }

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    for (const { operation, context } of operations) {
      console.log(
        `[OperationLogger] drive=${this.driveId}`,
        `doc=${context.documentId}`,
        `type=${context.documentType}`,
        `action=${operation.action.type}`,
        `index=${operation.index}`,
        `ordinal=${context.ordinal}`,
        `scope=${context.scope}`,
        `branch=${context.branch}`,
      );
    }
  }

  async onDisconnect(): Promise<void> {
    console.log(`[OperationLogger] Disconnected from drive: ${this.driveId}`);
  }
}
```

The processor is straightforward: it receives operations and logs a structured summary for each one. In a real-world scenario, you might send these to an external logging service, a webhook endpoint, or a monitoring system.

## 2. Write the processor factory

The factory is responsible for creating processor instances. The reactor calls your factory once per drive.

Create `processors/operation-logger/factory.ts`:

```typescript
import type {
  ProcessorRecord,
  ProcessorFilter,
  IProcessorHostModule,
} from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "document-model";
import { OperationLoggerProcessor } from "./index.js";

export const operationLoggerProcessorFactory =
  (module: IProcessorHostModule) =>
  async (driveHeader: PHDocumentHeader): Promise<ProcessorRecord[]> => {
    const filter: ProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      scope: ["global"],
      // Omit documentType to receive operations for ALL document types
    };

    const processor = new OperationLoggerProcessor(driveHeader.id);

    return [
      {
        processor,
        filter,
      },
    ];
  };
```

**How the factory pattern works:**

1. The outer function `(module: IProcessorHostModule) => ...` is called once at initialization. The `module` object provides access to shared resources like `analyticsStore`, `relationalDb`, and `config`.
2. The returned function `(driveHeader: PHDocumentHeader) => ProcessorRecord[]` is called once per drive. The `driveHeader` provides access to `driveHeader.id`, `driveHeader.name`, `driveHeader.documentType`, and other header fields.
3. Each factory can return multiple `ProcessorRecord` entries — useful when you want different filters for different aspects of processing (e.g., one processor per document type).

### Filter options explained

| Field          | Description                                                        |
| -------------- | ------------------------------------------------------------------ |
| `branch`       | Which branches to monitor — usually `["main"]` for production data |
| `documentId`   | Specific document IDs, or `["*"]` for all documents                |
| `scope`        | `["global"]` for shared state, `["local"]` for user-specific state |
| `documentType` | Document types to process — omit to match all types                |

### Starting position

By default, new processors catch up from the beginning — they replay all existing operations. You can change this by setting `startFrom` on the `ProcessorRecord`:

```typescript
return [
  {
    processor,
    filter,
    startFrom: "current", // Skip historical operations, only process new ones
  },
];
```

## 3. Register the factory

Your processor factory is automatically registered when it is included in your project's processor exports. After creating the files above, make sure they are exported from your `processors/index.ts`:

```typescript
export { operationLoggerProcessorFactory } from "./operation-logger/factory.js";
```

## 4. Test it

Start the reactor:

```bash
ph reactor
```

Create or modify documents in the drive. You should see log output like:

```
[OperationLogger] Initialized for drive: powerhouse
[OperationLogger] drive=powerhouse doc=abc123 type=powerhouse/todo-list action=ADD_TODO_ITEM index=0 ordinal=1 scope=global branch=main
[OperationLogger] drive=powerhouse doc=abc123 type=powerhouse/todo-list action=ADD_TODO_ITEM index=1 ordinal=2 scope=global branch=main
```

## Summary

You've built a plain processor from scratch. The key concepts are:

- **`IProcessor`** — the interface your processor implements (`onOperations`, `onDisconnect`)
- **`ProcessorFactory`** — a function that creates `ProcessorRecord[]` per drive
- **`ProcessorFilter`** — determines which operations your processor receives
- **`OperationWithContext`** — the data your processor receives, pairing operations with their document context

For processors that need a relational database, see the [Relational Database Processor](/academy/MasteryTrack/WorkWithData/RelationalDbProcessor) tutorial, which builds on these concepts with database migrations and type-safe queries.
