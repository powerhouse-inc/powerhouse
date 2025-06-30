# Analytics processors

An Analytics Processor is an object that can track analytics for operations and state changes on a set of document models. These analytics can be used to generate bespoke dashboards and reports, specific to the type or implementation of the document model.

## Generating an analytics processor with the CLI

The `ph-cli` utility can be used to generate the scaffolding for an Analytics Processor.

```
ph generate -p MyAnalyticsProcessor --processor-type analytics
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

## Learn by example: RwaAnalyticsProcessor

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

## Learn by example: Document operations

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

## Learn by example: Contributor Billing

Here we have documented the entire development process for the contributor billing processor.

First, we setup the repository locally.

```
$ git clone git@github.com:powerhouse-inc/contributor-billing.git
$ cd contributor-billing
~/contributor-billing $ pnpm install
```

Now we can generate an analytics processor, using default settings.

```
~/contributor-billing $ ph generate -p LineItemProcessor --processor-type analytics
```

We can see what was generated:

```
~/contributor-billing $ tree processors
processors
├── index.ts
└── line-item-processor
    └── index.ts
```

> Note that `processors/index.ts` will only be created if it does not already exist. In this case, you will be responsible for adding the processor to the `processorFactory` function.

### `IProcessorFactory`

Let's check out the generated `index.ts` file.

```ts
/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { ProcessorRecord } from "document-drive/processors/types";
import { LineItemProcessorProcessor } from "./line-item-processor/index.js";

export const processorFactory =
  (module: any) =>
  (driveId: string): ProcessorRecord[] => {
    return [
      {
        processor: new LineItemProcessorProcessor(module.analyticsStore),
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

This is described in more detail in the [ProcessorFactory](#processorfactory) section, but for our purposes, we only want our processor to run on our document type, so we should update the filter accordingly.

```ts
filter: {
  branch: ["main"],
  documentId: ["*"],
  scope: ["*"],
  documentType: ["powerhouse/billing-statement"],
},
```

### Dimension Design

Before we get into the meat of the processor, we should be sure to spend some upfront time designing the data we want to query. One way to do this is to start at the end: what do we want to see? In the case of billing statements, we will want to be able to generate reports that show:

- Total spent on headcount vs non-headcount
- Total spent across all budgets
- Stacked bar chart of total spent each month, grouped by budget
- Stacked bar chart of total spent each month, grouped by expense category
- Total spent each year across all budgets
- Total spent each year, grouped by budget
- Total spent per month, grouped by budget
- Total spent last 30 days, grouped by budget

From here, we can deconstruct the different criteria we would like to group data across:

- time period
- budget
- category
- contributor

The analytics engine gives us a good way to bucket based on time period, so we can focus on the other criteria, which we will specify as _dimensions_. Let's use these dimentions to stub out some of the queries we would want to run, using the `useAnalyticsQuery` hook.

### Query Design

Let's start with "Total spent on headcount vs non-headcount". First, we need to define the time-based criteria.

> Time and Dates can be very confusing. This is why we use the `DateTime` class from `luxon`-- see the [luxon docs](https://moment.github.io/luxon/#/math) for a quickstart.

```ts
// easy way to get the start and end of the current year
const start = DateTime.now().startOf("year");
const end = DateTime.now().endOf("year");

// this means we'll aggregate results across the entire time period
const granularity = "total";
```

Next, we want to define the metrics we want to analyze. These are the numerical values we will be aggregating over.

```ts
// the two numerical values we want to analyze are cash and powt, which are declared separately in the document model
const metrics = ["Cash", "Powt"];
```

Now, we can define the dimensions we want to group by. We can imagine that we will have a `contributor` dimension, which will tell us whether or not the contributor is headcount: `/billing-statement/contributor/headcount` or `/billing-statement/contributor/non-headcount`.

> It's best practice to namespace dimensions so that we are sure our data is not colliding with other processors. In this case, we will prepend the `billing-statement` namespace, which is simply a prefix we made up.

```ts
const totalSpendOnHeadcount = useAnalyticsQuery({
  start, end, granularity, metrics,
  select: {
    contributor: "/billing-statement/contributor"
  },
  lod: {
    contributor: 3,
  },
});
```

It is very important to note that the `lod` parameter is used to specify the level of detail we want to see. In this case, we want to see results grouped by contributor, so we set `lod` to `3`. This means we will get separate metric results for `/billing-statement/contributor/headcount` and `/billing-statement/contributor/non-headcount`.

We can use these same strategies to create queries for the other criteria we want to group by.

```ts
const totalSpend = useAnalyticsQuery({
  start,
  end,
  granularity: "total", // <--- this means we'll get results for the entire time period
  metrics: ["Cash", "Powt"],
  select: {
    budget: "/billing-statement"
  },
  lod: {
    budget: 0, // <--- this means we'll get all results lumped together
  },
});

const monthlySpendByBudget = useAnalyticsQuery({
  start,
  end,
  granularity: "monthly", // <--- this means we'll get results grouped by month
  metrics: ["Cash", "Powt"],
  select: {
    budget: "/billing-statement/budget"
  },
  lod: {
    budget: 3, // <--- this means we'll get results grouped by "/billing-statement/budget/budget1", "/billing-statement/budget/budget2", etc.
  },
});

const monthlySpendByCategory = useAnalyticsQuery({
  start,
  end,
  granularity: "monthly", // <--- this means we'll get results grouped by month
  metrics: ["Cash", "Powt"],
  select: {
    category: "/billing-statement/category"
  },
  lod: {
    category: 3, // <--- this means we'll get results grouped by "/billing-statement/category/category1", "/billing-statement/category/category2", etc.
  },
});

const yearlySpendByBudget = useAnalyticsQuery({
  start: DateTime.fromObject({ year: 2022 }),
  end: DateTime.now().endOf("year"),
  granularity: "yearly", // <--- this means we'll get results grouped by year
  metrics: ["Cash", "Powt"],
  select: {
    budget: "/billing-statement/budget"
  },
  lod: {
    budget: 3, // <--- this means we'll get results grouped by "/billing-statement/budget/budget1", "/billing-statement/budget/budget2", etc.
  },
});

const monthlySpendByBudget = useAnalyticsQuery({
  start,
  end,
  granularity: "monthly", // <--- this means we'll get results grouped by month
  metrics: ["Cash", "Powt"],
  select: {
    budget: "/billing-statement/budget"
  },
  lod: {
    budget: 3, // <--- this means we'll get results grouped by "/billing-statement/budget/budget1", "/billing-statement/budget/budget2", etc.
  },
});

const last30DaysSpendByBudget = useAnalyticsQuery({
  start: DateTime.now().minus({ days: 30 }),
  end: DateTime.now(),
  granularity: "day", // <--- this means we'll get results grouped by day
  metrics: ["Cash", "Powt"],
  select: {
    budget: "/billing-statement/budget"
  },
  lod: {
    budget: 3, // <--- this means we'll get results grouped by "/billing-statement/budget/budget1", "/billing-statement/budget/budget2", etc.
  },
});
```

### Source Design

The final consideration is the source design. While dimensions and sources both use path syntax, _the paths are unrelated_. That is, a path used in an AnalyticsSeries `source` does not affect a path used in a `dimension`, and vice versa. The `source` attribute of an analytics series is a composable mechanism to track down _where the data came from_.

This turns out to be an important consideration, as when we query data, we will likely also want to subscribe to a set of sources to later update the data.

For instance, say we take our monthly spend by category query:

```ts
const monthlySpendByCategory = useAnalyticsQuery({
  start,
  end,
  granularity: "monthly", 
  metrics: ["Cash", "Powt"],
  select: {
    category: "/billing-statement/category"
  },
  lod: {
    category: 3,
  },
});
```

This gives us the results we're looking for but, by design, there may be many different `AnalyticsSeries` objects that relate to affect this query. Thus, the hook does not know what to listen to. This is where our `source` design comes in. Generally, we will want to relate analytics by drive and/or document.

```ts
// this source will match all analytics updates from any document in the drive
const driveSource = AnalyticsPath.fromString(`billing-statement/${drive.header.id}`);

// this source will match all analytics updates from a specific document in a drive
const documentSource = AnalyticsPath.fromString(`billing-statement/${drive.header.id}/${document.header.id}`);
```

```ts
const { state, data: drive } = useSelectedDrive();

const results = useAnalyticsQuery({
  start, end,
  granularity: "monthly", 
  metrics: ["Cash", "Powt"],
  select: {
    category: "/billing-statement/category"
  },
  lod: {
    category: 3,
  },
},
{
  sources: [
   `/billing-statement/${drive.header.id}/` 
  ],
});
```

### `IProcessor`

Now that we have designed out our data, we can open up `line-item-processor/index.ts` to add the custom logic we're looking for. This will be in the `onStrands` function.

```ts

```



