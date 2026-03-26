# Processor Migration Guide (v6 Reactor)

:::tip
This guide covers the **breaking changes** to the processor interface introduced in the v6 Reactor. If you have existing processors built on the legacy strand-based API, **this migration is required**.
:::

## Overview

The v6 Reactor replaced the strand-based processor model with a flat operation-based model:

- **Old**: Processors received `InternalTransmitterUpdate[]` strands via `onStrands()`, grouped by document
- **New**: Processors receive a flat `OperationWithContext[]` list via `onOperations()`, with per-operation context

This change simplifies the processor interface, improves cross-document ordering via the `ordinal` field, and unifies all processor types under a single `IProcessor` interface.

## Import path changes

| Legacy import                                                            | v6 import                                                                                |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `import { InternalTransmitterUpdate, IProcessor } from "document-drive"` | `import type { IProcessor, OperationWithContext } from "@powerhousedao/reactor-browser"` |
| `import type { ReactorContext } from "document-drive"`                   | Removed — no longer needed                                                               |
| `import type { OperationWithContext } from "@powerhousedao/reactor"`     | Same (server-side alternative to reactor-browser)                                        |

:::info Import paths
`@powerhousedao/reactor-browser` re-exports all reactor types for convenience in browser environments (editors, drive-apps). If you are working outside the browser (Node.js, CLI tools, server-side code), import directly from `@powerhousedao/reactor` or `@powerhousedao/shared`.
:::

## Interface changes

### Legacy: IProcessor with onStrands

```typescript
// Legacy processor interface
import type { InternalTransmitterUpdate, IProcessor } from "document-drive";

export class MyProcessor implements IProcessor {
  // Received grouped strands — one per (driveId, documentId, scope, branch)
  async onStrands(strands: InternalTransmitterUpdate[]): Promise<void> {
    for (const strand of strands) {
      const { driveId, documentId, scope, branch } = strand;
      for (const operation of strand.operations) {
        // operation.type, operation.input, operation.index, ...
      }
    }
  }

  // Also required but often unused
  onOperations(operations: any[]): Promise<void> {
    return Promise.resolve();
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }
}
```

### v6: IProcessor with onOperations

```typescript
// v6 processor interface
import type { IProcessor } from "@powerhousedao/reactor-browser";
import type { OperationWithContext } from "document-model";

export class MyProcessor implements IProcessor {
  // Receives a flat list of operations with full context
  async onOperations(operations: OperationWithContext[]): Promise<void> {
    for (const { operation, context } of operations) {
      // context: documentId, documentType, scope, branch, ordinal, resultingState
      // operation: action (type, input), index, timestampUtcMs, hash
    }
  }

  async onDisconnect(): Promise<void> {
    // cleanup
  }
}
```

### Key differences

| Aspect                  | Legacy                                      | v6                                                |
| ----------------------- | ------------------------------------------- | ------------------------------------------------- |
| Entry method            | `onStrands(strands)`                        | `onOperations(operations)`                        |
| Data shape              | Grouped by document (`strand.operations[]`) | Flat list (`OperationWithContext[]`)              |
| Document context        | `strand.driveId`, `strand.documentId`       | `context.documentId`, `context.documentType`      |
| Operation access        | `operation.type`, `operation.input`         | `operation.action.type`, `operation.action.input` |
| Cross-document ordering | Not available                               | `context.ordinal` (global monotonic counter)      |
| Document state          | Not provided                                | `context.resultingState` (JSON string, optional)  |
| Drive ID                | `strand.driveId`                            | Available via factory's `driveHeader.id`          |

## Factory changes

### Legacy factory

```typescript
// Legacy processor factory
import type { InternalTransmitterUpdate } from "document-drive";

export const myProcessorFactory =
  (analyticsStore: IAnalyticsStore) =>
  (driveId: string): ProcessorRecord[] => {
    return [
      {
        processor: new MyProcessor(analyticsStore),
        filter: {
          branch: ["main"],
          documentId: ["*"],
          scope: ["*"],
          documentType: ["*"],
        },
      },
    ];
  };
```

### v6 factory

```typescript
// v6 processor factory
import type {
  ProcessorRecord,
  IProcessorHostModule,
} from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "document-model";
import type { ProcessorApp } from "@powerhousedao/common";
import { MyProcessor } from "./index.js";

export const myProcessorFactory =
  (module: IProcessorHostModule) =>
  (
    driveHeader: PHDocumentHeader,
    processorApp?: ProcessorApp,
  ): ProcessorRecord[] => {
    return [
      {
        processor: new MyProcessor(module.analyticsStore),
        filter: {
          branch: ["main"],
          documentId: ["*"],
          scope: ["*"],
          documentType: ["*"],
        },
      },
    ];
  };
```

### Factory differences

| Aspect             | Legacy                                      | v6                                                                                          |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Outer parameter    | Direct dependencies (e.g. `analyticsStore`) | `IProcessorHostModule` (bundles `analyticsStore`, `relationalDb`, `processorApp`, `config`) |
| Inner parameter    | `driveId: string`                           | `driveHeader: PHDocumentHeader` (full header with `id`, `name`, `documentType`, etc.)       |
| Optional parameter | None                                        | `processorApp?: ProcessorApp`                                                               |

## Migrating an analytics processor

### Legacy analytics processor

```typescript
// Legacy
import type {
  AnalyticsSeriesInput,
  IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import { AnalyticsPath } from "@powerhousedao/analytics-engine-core";
import type { InternalTransmitterUpdate, IProcessor } from "document-drive";

export class MyAnalyticsProcessor implements IProcessor {
  private readonly inputs: AnalyticsSeriesInput[] = [];

  constructor(private readonly analyticsStore: IAnalyticsStore) {}

  onOperations(): Promise<void> {
    return Promise.resolve();
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }

  async onStrands(strands: InternalTransmitterUpdate[]): Promise<void> {
    for (const strand of strands) {
      if (strand.operations.length === 0) continue;

      const source = AnalyticsPath.fromString(
        `/MyAnalytics/${strand.driveId}/${strand.documentId}/${strand.branch}/${strand.scope}`,
      );

      if (strand.operations[0].index === 0) {
        await this.clearSource(source);
      }

      for (const operation of strand.operations) {
        this.inputs.push({
          source,
          metric: "MyMetric",
          start: DateTime.fromISO(operation.timestamp),
          value: 1,
          dimensions: {
            /* ... */
          },
        });
      }
    }

    if (this.inputs.length > 0) {
      await this.analyticsStore.addSeriesValues(this.inputs);
      this.inputs.length = 0;
    }
  }

  private async clearSource(source: AnalyticsPath) {
    try {
      await this.analyticsStore.clearSeriesBySource(source, true);
    } catch (e) {
      console.error(e);
    }
  }
}
```

### v6 analytics processor

```typescript
// v6
import type {
  AnalyticsSeriesInput,
  IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import { AnalyticsPath } from "@powerhousedao/analytics-engine-core";
import type {
  OperationWithContext,
  IProcessor,
} from "@powerhousedao/reactor-browser";
import { DateTime } from "luxon";

export class MyAnalyticsProcessor implements IProcessor {
  constructor(private readonly analyticsStore: IAnalyticsStore) {}

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    if (operations.length === 0) return;

    const CHUNK_SIZE = 50;
    const buffer: AnalyticsSeriesInput[] = [];

    for (const { operation, context } of operations) {
      const { documentId, branch, scope } = context;

      const source = AnalyticsPath.fromString(
        `ph/my-analytics/${documentId}/${branch}/${scope}`,
      );

      buffer.push({
        source,
        metric: "MyMetric",
        start: DateTime.fromISO(operation.action.timestampUtcMs),
        value: 1,
        dimensions: {
          /* ... */
        },
      });

      while (buffer.length >= CHUNK_SIZE) {
        const batch = buffer.splice(0, CHUNK_SIZE);
        await this.analyticsStore.addSeriesValues(batch);
      }
    }

    if (buffer.length > 0) {
      await this.analyticsStore.addSeriesValues(buffer);
    }
  }

  async onDisconnect(): Promise<void> {}
}
```

### What changed

- `onStrands()` is removed entirely — all logic moves to `onOperations()`
- **`clearSource` is no longer needed.** The v6 processor manager guarantees each operation is delivered exactly once — there is no replay. You can remove all `clearSource` / `clearSeriesBySource` logic and the `index === 0` guard.
- Strand fields like `strand.driveId`, `strand.documentId` become `context.documentId`, `context.documentType`, etc.
- `operation.type` becomes `operation.action.type`
- `operation.input` becomes `operation.action.input`
- `operation.timestamp` becomes `operation.action.timestampUtcMs`
- Chunked batch insert is now the recommended pattern (see example above)

## Migrating a relational database processor

### Legacy relational processor

Legacy relational processors (previously called "operational processors") were plain `IProcessor` implementations that managed their own database connection:

```typescript
// Legacy
import type { InternalTransmitterUpdate, IProcessor } from "document-drive";

export class MyRelationalProcessor implements IProcessor {
  constructor(private db: any) {}

  async onStrands(strands: InternalTransmitterUpdate[]): Promise<void> {
    for (const strand of strands) {
      for (const operation of strand.operations) {
        await this.db
          .insertInto("my_table")
          .values({
            doc_id: strand.documentId,
            action: operation.type,
          })
          .execute();
      }
    }
  }

  onOperations(): Promise<void> {
    return Promise.resolve();
  }
  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }
}
```

### v6 relational database processor

The v6 Reactor provides a `RelationalDbProcessor` base class with built-in database lifecycle management:

```typescript
// v6
import { RelationalDbProcessor } from "@powerhousedao/reactor-browser";
import type { OperationWithContext } from "document-model";
import { up } from "./migrations.js";
import type { DB } from "./schema.js";

export class MyRelationalProcessor extends RelationalDbProcessor<DB> {
  // Unique namespace per drive — prevents data collisions
  static override getNamespace(driveId: string): string {
    return super.getNamespace(driveId);
  }

  // Run migrations on startup
  override async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb);
  }

  override async onOperations(
    operations: OperationWithContext[],
  ): Promise<void> {
    if (operations.length === 0) return;

    for (const { operation, context } of operations) {
      await this.relationalDb
        .insertInto("my_table")
        .values({
          doc_id: context.documentId,
          action: operation.action.type,
        })
        .onConflict((oc) => oc.column("doc_id").doNothing())
        .execute();
    }
  }

  async onDisconnect(): Promise<void> {}
}
```

### v6 relational factory

```typescript
import type {
  ProcessorRecord,
  IProcessorHostModule,
  ProcessorFilter,
} from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "document-model";
import { MyRelationalProcessor } from "./index.js";

export const myRelationalProcessorFactory =
  (module: IProcessorHostModule) =>
  async (driveHeader: PHDocumentHeader): Promise<ProcessorRecord[]> => {
    const namespace = MyRelationalProcessor.getNamespace(driveHeader.id);
    const store =
      await module.relationalDb.createNamespace<MyRelationalProcessor>(
        namespace,
      );

    const filter: ProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["powerhouse/my-doc-type"],
      scope: ["global"],
    };

    const processor = new MyRelationalProcessor(namespace, filter, store);
    return [{ processor, filter }];
  };
```

Generate the scaffolding with:

```bash
ph generate --processor my-processor --processor-type relationalDb --document-types powerhouse/my-doc-type
```

### Key additions in RelationalDbProcessor

| Feature                        | Description                                                              |
| ------------------------------ | ------------------------------------------------------------------------ |
| `RelationalDbProcessor<DB>`    | Type-safe base class with `this.relationalDb`                            |
| `getNamespace(driveId)`        | Static method for per-drive database isolation                           |
| `initAndUpgrade()`             | Lifecycle hook for running migrations on startup                         |
| `query(driveId, relationalDb)` | Static method for querying from subgraphs                                |
| Type generation                | `ph generate --migration-file migrations.ts` generates `schema.ts` types |

## Migrating a plain processor

### Legacy

```typescript
import type { InternalTransmitterUpdate, IProcessor } from "document-drive";

export class LoggerProcessor implements IProcessor {
  async onStrands(strands: InternalTransmitterUpdate[]): Promise<void> {
    for (const strand of strands) {
      for (const op of strand.operations) {
        console.log(`[${strand.driveId}] ${strand.documentId}: ${op.type}`);
      }
    }
  }

  onOperations(): Promise<void> {
    return Promise.resolve();
  }
  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }
}
```

### v6

```typescript
import type { IProcessor } from "@powerhousedao/reactor-browser";
import type { OperationWithContext } from "document-model";

export class LoggerProcessor implements IProcessor {
  constructor(private driveId: string) {}

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    for (const { operation, context } of operations) {
      console.log(
        `[${this.driveId}] ${context.documentId}: ${operation.action.type}`,
      );
    }
  }

  async onDisconnect(): Promise<void> {}
}
```

## OperationWithContext reference

Each item in the `onOperations` list destructures as `{ operation, context }`:

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

| Field            | Type     | Description                                                                        |
| ---------------- | -------- | ---------------------------------------------------------------------------------- |
| `action`         | `Action` | Contains `type` (e.g. `"ADD_TODO_ITEM"`), `input`, `timestampUtcMs`, `id`, `scope` |
| `index`          | `number` | Position in the operation history                                                  |
| `timestampUtcMs` | `string` | When the operation was created                                                     |
| `hash`           | `string` | Hash of the resulting document state                                               |

## Migration checklist

- [ ] Replace all `onStrands(strands: InternalTransmitterUpdate[])` with `onOperations(operations: OperationWithContext[])`
- [ ] Remove the `onStrands` method entirely
- [ ] Update imports from `document-drive` to `@powerhousedao/reactor-browser` (or `@powerhousedao/reactor` for server-side)
- [ ] Replace `strand.driveId` / `strand.documentId` with `context.documentId` / `context.documentType`
- [ ] Replace `operation.type` with `operation.action.type`
- [ ] Replace `operation.input` with `operation.action.input`
- [ ] Replace `operation.timestamp` with `operation.action.timestampUtcMs`
- [ ] Update factory signature to accept `IProcessorHostModule` and `PHDocumentHeader`
- [ ] For relational processors: extend `RelationalDbProcessor<DB>` and implement `initAndUpgrade()`
- [ ] Regenerate processor scaffolding with `ph generate --processor <name>`
