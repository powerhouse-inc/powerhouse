# Analytics processors

An Analytics Processor is an object that can track analytics for operations and state changes on a set of document models. These analytics can be used to generate bespoke dashboards and reports, specific to the type or implementation of the document model.

## Generating an analytics processor with the CLI

The `ph-cli` utility can be used to generate the scaffolding for an Analytics Processor.

```
ph generate -p MyAnalyticsProcessor --processor-type analytics
```

This will generate two files: a class that implements `IProcessor` and a `ProcessorFactory` function that creates an instance of your processor. We can start with the factory.

### `ProcessorFactory`

If one has not already been created, the generator will create a `factory.ts` that contains a `processorFactory` function:

```typescript
import type {
  ProcessorRecord,
  IProcessorHostModule,
} from "@powerhousedao/reactor-browser";
import { type PHDocumentHeader } from "document-model";
import type { ProcessorApp } from "@powerhousedao/common";
import { MyAnalyticsProcessorProcessor } from "./index.js";

export const myAnalyticsProcessorProcessorFactory =
  (module: IProcessorHostModule) =>
  (
    driveHeader: PHDocumentHeader,
    processorApp?: ProcessorApp,
  ): ProcessorRecord[] => {
    return [
      {
        processor: new MyAnalyticsProcessorProcessor(module.analyticsStore),
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

This function appears complicated at first, but provides for great flexibility.

The outside function (`(module: IProcessorHostModule) => ProcessorFactory`) will be called by the host application (`Reactor`, `Connect`, etc) a single time at initialization. This is intended to resolve external dependencies through the `module` object. In the case of this processor, you can see how the `module` object contains the `analyticsStore`.

Next, for each drive created, the returned function (`(driveHeader: PHDocumentHeader): ProcessorRecord[]`) will be called. The `driveHeader` provides access to `driveHeader.id`, `driveHeader.type`, and other document header fields. Applications are free to reuse processors or pass in application-specific dependencies in to each processor.

The `filter` parameter allows a user to tune which updates the processor receives. Usage is straightforward: each field of the filter parameter can receive one to many patterns. The array for each field describes an `OR` operator. That is, `["a", "b"]` would match `"a"` or `"b"`. However, matches across fields describe an `AND` operator. That is, an update must match on `branch` `AND` `documentId` `AND` `documentType` `AND` `scope`.

Globs are accepted as input, but not regexes.

```
{
  branch: ["main"],
  documentId: ["*"],
  documentType: ["doc-type-a", "doc-type-b"],
  scope: ["global", "local"],
}
```

This example would match updates for:

```
("main" branch) AND (any documentId) AND ("doc-type-a" OR "doc-type-b" documentType) AND ("global" OR "local" scope)
```

### `onOperations`

The `onOperations` method is the core of the processor. This is the function called for all the operations matching the filter. Here is what the generated scaffold looks like:

```typescript
import type {
  AnalyticsSeriesInput,
  IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import { AnalyticsPath } from "@powerhousedao/analytics-engine-core";
import type {
  OperationWithContext,
  IProcessor,
} from "@powerhousedao/reactor-browser";

export class MyAnalyticsProcessorProcessor implements IProcessor {
  private readonly NAMESPACE = "MyAnalyticsProcessor";

  private readonly inputs: AnalyticsSeriesInput[] = [];

  constructor(private readonly analyticsStore: IAnalyticsStore) {
    //
  }

  onOperations(operations: OperationWithContext[]): Promise<void> {
    return Promise.resolve();
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
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

This method receives a flat list of `OperationWithContext` items. Each item destructures as `{ operation, context }`:

- **`context`** carries metadata about where the operation came from:
  - `documentId` — the document this operation belongs to
  - `documentType` — the document model type (e.g. `"powerhouse/document-drive"`)
  - `scope` — the scope of the operation (e.g. `"global"`, `"local"`)
  - `branch` — the branch (e.g. `"main"`)
  - `resultingState` — JSON string of the document state after this operation
  - `ordinal` — a global monotonically increasing number for cross-document ordering

- **`operation`** carries the operation itself:
  - `action` — contains `type` (the action name) and `input` (the action payload)
  - `index` — the operation's position in the document's history
  - `timestampUtcMs` — when the operation was created
  - `hash` — hash of the resulting document data

> It is best practice to batch insert all updates to the analytics system. The examples below demonstrate buffering inputs and flushing in chunks for optimal performance.

## Learn by example: DriveAnalyticsProcessor

The `DriveAnalyticsProcessor` tracks file-system-level operations on `powerhouse/document-drive` documents — adds, moves, copies, deletes, and updates of nodes within a drive.

Source: [`packages/shared/processors/drive-analytics/drive-processor.ts`](https://github.com/powerhouse-inc/powerhouse/blob/main/packages/shared/processors/drive-analytics/drive-processor.ts)

```typescript
import { DateTime } from "luxon";
import { AnalyticsPath } from "../../analytics/analytics-path.js";
import type {
  AnalyticsSeriesInput,
  IAnalyticsStore,
} from "../../analytics/types.js";
import type { OperationWithContext } from "../../document-model/index.js";
import type { IProcessor } from "../types.js";
import type { ActionType, NodeTarget } from "./types.js";

const CREATE_NODE_ACTIONS = ["ADD_FILE", "ADD_FOLDER"];
const DUPLICATE_NODE_ACTIONS = ["COPY_NODE"];
const UPDATE_NODE_ACTIONS = ["UPDATE_FILE", "UPDATE_NODE"];
const MOVE_NODE_ACTIONS = ["MOVE_NODE"];
const REMOVE_NODE_ACTIONS = ["DELETE_NODE"];

const NODE_ACTIONS = [
  ...CREATE_NODE_ACTIONS,
  ...DUPLICATE_NODE_ACTIONS,
  ...UPDATE_NODE_ACTIONS,
  ...MOVE_NODE_ACTIONS,
  ...REMOVE_NODE_ACTIONS,
];

function getActionType(action: string): ActionType {
  if (CREATE_NODE_ACTIONS.includes(action)) return "CREATED";
  if (DUPLICATE_NODE_ACTIONS.includes(action)) return "DUPLICATED";
  if (REMOVE_NODE_ACTIONS.includes(action)) return "REMOVED";
  if (MOVE_NODE_ACTIONS.includes(action)) return "MOVED";
  return "UPDATED";
}

type NodeActionInput = { id?: string; targetId?: string; srcFolder?: string };

export class DriveAnalyticsProcessor implements IProcessor {
  constructor(private readonly analyticsStore: IAnalyticsStore) {
    //
  }

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    if (operations.length === 0) {
      return;
    }

    const CHUNK_SIZE = 50;
    const buffer: AnalyticsSeriesInput[] = [];

    for (const { operation, context } of operations) {
      const { documentType, documentId, branch, scope } = context;
      if (documentType !== "powerhouse/document-drive") {
        continue;
      }

      const {
        action: { type, input, timestampUtcMs },
      } = operation;
      const source = AnalyticsPath.fromString(
        `ph/drive/${documentId}/${branch}/${scope}`,
      );

      const revision = operation.index;
      const actionType = getActionType(type);

      const target: NodeTarget = NODE_ACTIONS.includes(type) ? "NODE" : "DRIVE";

      let targetId = documentId;
      if (target === "NODE") {
        const operationInput = input as NodeActionInput;
        targetId =
          operationInput.id ||
          operationInput.targetId ||
          operationInput.srcFolder ||
          documentId;
      }

      const seriesInput: AnalyticsSeriesInput = {
        source,
        metric: "DriveOperations",
        start: DateTime.fromISO(timestampUtcMs),
        value: 1,
        dimensions: {
          drive: AnalyticsPath.fromString(
            `ph/drive/${documentId}/${branch}/${scope}/${revision}`,
          ),
          operation: AnalyticsPath.fromString(
            `ph/drive/operation/${operation.action.type}/${operation.index}`,
          ),
          target: AnalyticsPath.fromString(
            `ph/drive/target/${target}/${targetId}`,
          ),
          actionType: AnalyticsPath.fromString(
            `ph/drive/actionType/${actionType}/${targetId}`,
          ),
        },
      };

      buffer.push(seriesInput);

      while (buffer.length >= CHUNK_SIZE) {
        const batch = buffer.splice(0, CHUNK_SIZE);
        await this.analyticsStore.addSeriesValues(batch);
      }
    }

    if (buffer.length > 0) {
      await this.analyticsStore.addSeriesValues(buffer);
    }
  }

  async onDisconnect() {}
}
```

Key things to notice:

- **Destructuring**: `for (const { operation, context } of operations)` — each item in the flat list provides both the operation and its context.
- **Context fields**: `context.documentType`, `context.documentId`, `context.branch`, `context.scope` identify which document and scope the operation belongs to.
- **Operation fields**: `operation.action.type` and `operation.action.input` give you the action name and payload. `operation.index` is the operation's position in the document history. `operation.timestampUtcMs` is the creation timestamp.
- **Chunked batch insert**: Operations are buffered into an array and flushed in chunks of `CHUNK_SIZE` for optimal database performance.

## Learn by example: DocumentAnalyticsProcessor

The `DocumentAnalyticsProcessor` is a simpler variant that tracks operations across _all_ document types, not just drives. It records per-document operation metrics.

Source: [`packages/shared/processors/drive-analytics/document-processor.ts`](https://github.com/powerhouse-inc/powerhouse/blob/main/packages/shared/processors/drive-analytics/document-processor.ts)

```typescript
import { DateTime } from "luxon";
import { AnalyticsPath } from "../../analytics/analytics-path.js";
import type {
  AnalyticsSeriesInput,
  IAnalyticsStore,
} from "../../analytics/types.js";
import type { OperationWithContext } from "../../document-model/index.js";
import type { IProcessor } from "../types.js";
import type { NodeTarget } from "./types.js";

export class DocumentAnalyticsProcessor implements IProcessor {
  constructor(private readonly analyticsStore: IAnalyticsStore) {
    //
  }

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    if (operations.length === 0) {
      return;
    }

    const CHUNK_SIZE = 50;
    const buffer: AnalyticsSeriesInput[] = [];

    for (const { operation, context } of operations) {
      const { documentType, documentId, branch, scope } = context;

      const source = AnalyticsPath.fromString(
        `ph/doc/${documentId}/${branch}/${scope}`,
      );

      const target: NodeTarget =
        documentType === "powerhouse/document-drive" ? "DRIVE" : "NODE";

      const revision = operation.index;

      const seriesInput: AnalyticsSeriesInput = {
        source,
        metric: "DocumentOperations",
        start: DateTime.fromISO(operation.timestampUtcMs),
        value: 1,
        dimensions: {
          drive: AnalyticsPath.fromString(
            `ph/doc/drive/${documentId}/${branch}/${scope}/${revision}`,
          ),
          operation: AnalyticsPath.fromString(
            `ph/doc/operation/${operation.action.type}/${operation.index}`,
          ),
          target: AnalyticsPath.fromString(
            `ph/doc/target/${target}/${documentId}`,
          ),
        },
      };

      buffer.push(seriesInput);

      while (buffer.length >= CHUNK_SIZE) {
        const batch = buffer.splice(0, CHUNK_SIZE);
        await this.analyticsStore.addSeriesValues(batch);
      }
    }

    if (buffer.length > 0) {
      await this.analyticsStore.addSeriesValues(buffer);
    }
  }

  async onDisconnect() {}
}
```

This processor follows the same `onOperations` pattern but tracks a different metric (`DocumentOperations`) and uses a different source/dimension design. It demonstrates how multiple processors can coexist, each capturing different analytics from the same operation stream.

## Factory: registering multiple processors per drive

The factory below shows how both processors are registered together, so a single factory produces multiple `ProcessorRecord` entries per drive:

Source: [`packages/shared/processors/drive-analytics/index.ts`](https://github.com/powerhouse-inc/powerhouse/blob/main/packages/shared/processors/drive-analytics/index.ts)

```typescript
import type { IAnalyticsStore } from "../../analytics/types.js";
import type { PHDocumentHeader } from "../../document-model/core/documents.js";
import type { ProcessorRecord } from "../types.js";
import { DocumentAnalyticsProcessor } from "./document-processor.js";
import { DriveAnalyticsProcessor } from "./drive-processor.js";

export const processorFactory =
  (module: { analyticsStore: IAnalyticsStore }) =>
  (driveHeader: PHDocumentHeader): ProcessorRecord[] => {
    return [
      {
        processor: new DriveAnalyticsProcessor(module.analyticsStore),
        filter: {
          branch: ["main"],
          documentId: ["*"],
          scope: ["*"],
          documentType: ["powerhouse/document-drive"],
        },
      },
      {
        processor: new DocumentAnalyticsProcessor(module.analyticsStore),
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

Note how the `DriveAnalyticsProcessor` filters only for `powerhouse/document-drive` documents, while the `DocumentAnalyticsProcessor` listens to all document types (`"*"`). Each processor gets its own filter, and the factory returns them all in a single array.
