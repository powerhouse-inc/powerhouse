# Analytics Processors

An Analytics Processor is an object that can track analytics for operations and state changes on a set of document models. These analytics can be used to generate bespoke dashboards and reports, specific to the type or implementation of the document model.

## Generating an Analytics Processor with the CLI

The `ph-cli` utility can be used to generate the scaffolding for an Analytics Processor.

```
npx @powerhousedao/ph-cli generate --processor-type analytics --document-models ./my-document-models
```

This will generate two files: a class that implements `IProcessor` and a `ProcessorFactory` function that creates an instance of your processor. We can start with the factory.

### `ProcessorFactory`

If one has not already been created, the generator will create an `index.ts` that contains a `processorFactory` function:

```typescript
export const processorFactory =
  (module: any) =>
  (driveId: string): ProcessorRecord[] => {
    return [
      {
        processor: new MyAnalyticsProcessor(module.analyticsStore),
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

The outside function (`(module: any) => ProcessorFactory`) will be called by the host application (`Reactor`, `Connect`, etc) a single time at initialization. This is intended to resolve external dependencies through the `module` object. In the case of this processor, you can see how the `module` object contains the `analyticsStore`.

Next, for each drive created, the returned function (`(driveId:string): ProcessorRecord[]`) will be called. This means that this custom function will be responsible for determining which processors are added for each drive. Applications are free to reuse processors or pass in application-specific dependencies in to each processor.

The `filter` parameter allows a user to tune which updates the processor receives. Usage is straightfoward: each field of the filter parameter can receive one to many patterns. The array for each field describes an `OR` operator. That is, `["a", "b"]` would match `"a"` or `"b"`. However, matches across fields describe an `AND` operator. That is, an update must match on `branch` `AND` `documentId` `AND` `documentType` `AND` `scope`.

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

### onStrands

The `onStrands` method is the meat of the processor. This is the function called for all the updates matching the filter. Here is what will be generated for you:

```typescript
async onStrands<TDocument extends PHDocument>(
    strands: InternalTransmitterUpdate<TDocument>[]
  ): Promise<void> {
  // nothing to update
  if (strands.length === 0) {
    return;
  }

  const analyticsInputs: AnalyticsSeriesInput[] = [];
  for (const strand of strands) {
    if (strand.operations.length === 0) {
      continue;
    }

    const firstOp = strand.operations[0];
    const source = AnalyticsPath.fromString(
      `ph/${strand.driveId}/${strand.documentId}/${strand.branch}/${strand.scope}`,
    );

    if (firstOp.index === 0) {
      await this.clearSource(source);
    }

    for (const operation of strand.operations) {
      console.log(">>> ", operation.type);

      // add analytics to the analyticsInputs array
    }
  }

  if (analyticsInputs.length > 0) {
    // batch insert all analytics data
    await this.analyticsStore.addSeriesValues(analyticsInputs);
  }
}
```

This function provides a list of `strand` objects, each with a list of document-model operations (`InternalOperationUpdate[]`) on them. Essentially, it is a list of lists. Each operation will have the previous state of the document and the next state. This allows analytics capture from new state, deltas, or the operations themselves.

> Note that on the first operation (given by `firstOp.index === 0`), it is best practice to clear any previous analytics series for that source. This is so that we do not dual insert operations.

Model-specific code will go where the `console.log` statement currently resides.

> It is best practice to batch insert all updates to the analytics system. In this example, we add all updates to an array of inputs, then insert them all at once. This is optimal over `await`-ing each separate value.

## Learn By Example: RwaAnalyticsProcessor

In the `reactor-local` package, we have implemented a processor for the `makerdao/rwa-portfolio` document type. This is a document model that tracks MakerDAO's Real World Asset (RWA) portfolio. It was initially generated using the `ph-cli` utility.

In the case of the RWA processor, we only want to process updates for the rwa-specific document type, but across all documents. This is why the filter looks like:

```js
{
  branch: ["main"],
  documentId: ["*"],
  documentType: ["makerdao/rwa-portfolio"],
  scope: ["global"],
}
```

Inside of the `onStrands` function, past the boilerplate, we see what is essentially a giant switch statement.

```typescript
if (operation.type === "CREATE_GROUP_TRANSACTION") {
  const groupTransaction = operation.input as CreateGroupTransactionInput;
  if (
    groupTransaction.type !== "AssetPurchase" &&
    groupTransaction.type !== "AssetSale" &&
    groupTransaction.type !== "PrincipalDraw" &&
    groupTransaction.type !== "PrincipalReturn"
  ) {
    continue;
  }

  // elided
}
```

Since we have knowledge of this specific document model, we can cast the operation input to a specific type. Then, since we only want to track analytics for operations that create transactions, and we can filter out a few transaction types.

Below that, we can see how we are capturing analytics data:

```typescript
// create good dimensions that we will want to filter on later
const dimensions = {
  asset: AnalyticsPath.fromString(
    `sky/rwas/assets/t-bills/${fixedIncomeTransaction.assetId}`,
  ),
  portfolio: AnalyticsPath.fromString(
    `sky/rwas/portfolios/${documentId}`,
  ),
};

// create the series values
const args = {
  dimensions,
  metric: "AssetBalance",
  source,
  start: DateTime.fromISO(fixedIncomeTransaction.entryTime),
  value:
    groupTransaction.type === "AssetPurchase"
      ? fixedIncomeTransaction.amount
      : -fixedIncomeTransaction.amount,
};

analyticsInputs.push(args);
```

With this processor implementation, we can now write queries against processor analytics updates. For example, a GQL query might look like the following:

```graphql
query Analytics($filter: AnalyticsFilter) {
  analytics {
    series(filter: $filter) {
      start
      end
      rows {
        dimensions {
          name
          path
        }
        metric
        value
        unit
      }
    }
  }
}
```

With variables:

```json
{
  "filter": {
    "granularity": "annual",
    "start": "2024-01-01",
    "end": "2025-01-01",
    "metrics": [
      "AssetBalance",
    ],
    "dimensions": [
      {
        "name": "asset",
        "select": "sky/rwas",
        "lod": 2
      }
    ]
  }
}
```

## Learn By Example: Document Operations

The RWA processor example pulls information from operation _inputs_ to insert analytics data. Another use case might be to capture meta-analytics from the states themselves.

This processor listens to all documents of type `powerhouse/document-drive`, and since the `document-drive` is itself implemented on top of the document model core systems, this means that we can process all virtual file system operations.  This processor count basic usage metrics using document operations and states.

```typescript
import { IAnalyticsStore } from "@powerhousedao/reactor-api";
import { AnalyticsPath } from "@powerhousedao/reactor-api";
import { AnalyticsSeriesInput } from "@powerhousedao/reactor-api";
import { InternalTransmitterUpdate, IProcessor } from "document-drive";
import { AddFileInput, DeleteNodeInput } from "document-drive/drive-document-model/gen/types";
import { PHDocument } from "document-model";
import { DateTime } from "luxon";

// iterates over state nodes and retrieves one by id
const findNode = (state: any, id: string) => {
  const { nodes } = state;
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
  }

  return null;
};

export class DriveProcessorProcessor implements IProcessor {
  constructor(private readonly analyticsStore: IAnalyticsStore) {
    //
  }
  
  async onStrands<TDocument extends PHDocument>(
    strands: InternalTransmitterUpdate<TDocument>[]
  ): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    const values:AnalyticsSeriesInput[] = [];

    for (const strand of strands) {
      const operations = strand.operations;
      await Promise.all(operations.map((operation) => {
        const source = AnalyticsPath.fromString(`switchboard/default/${strand.driveId}`);
    
        const start = DateTime.fromISO(operation.timestamp);
        const dimensions: any = {
          documentType: AnalyticsPath.fromString(`document/type/powerhouse/document-drive`),
        };

        if (operation.index === 0) {
          this.analyticsStore.clearSeriesBySource(source);
        }
    
        switch (operation.type) {
          case "ADD_FILE": {
            // count documents of each type (ADD_FILE, input.documentType)
    
            // lookup node in state
            const input = operation.input as AddFileInput;
            const node = findNode(strand.state, input.id);
            if (!node) {
              return Promise.resolve();
            }
    
            dimensions["kind"] = AnalyticsPath.fromString(`document/kind/${node.kind}`);
    
            // increment by adding a 1
            values.push({
              source,
              start,
              value: 1,
              metric: "Count",
              dimensions,
            });
            
            break;
          }
          case "ADD_FOLDER": {
            dimensions["kind"] = AnalyticsPath.fromString("document/kind/folder");
    
            // increment by adding a 1
            values.push({
              source,
              start,
              value: 1,
              metric: "Count",
              dimensions,
            });
            
            break;
          }
          case "DELETE_NODE": {
            // the operation only contains the id, so lookup deleted item type in previous state
            const input = operation.input as DeleteNodeInput;
            const node = findNode(operation.previousState, input.id);
            if (!node) {
              return Promise.resolve();
            }
    
            dimensions["kind"] = AnalyticsPath.fromString(`document/kind/${node.kind}`);
    
            // decrement by adding a -1
            values.push({
              source,
              start,
              value: -1,
              metric: "Count",
              dimensions,
            });
    
            break;
          }
        }
      }));
    }

    await this.analyticsStore.addSeriesValues(values);
  }

  async onDisconnect() {}
}
```
