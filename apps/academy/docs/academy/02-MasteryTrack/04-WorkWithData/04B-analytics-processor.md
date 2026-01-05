# Todo-List Analytics Processor

In this chapter, we will implement a **Todo-List** analytics processor. This processor tracks productivity metrics from todo operations, enabling dashboards and reports that show task creation patterns, completion rates, and overall productivity trends.

**What is an Analytics Processor?**

An Analytics Processor is a specialized component that listens to document changes in your Powerhouse application and transforms that data into time-series analytics. Unlike relational database processors that store structured data, analytics processors are optimized for:

- **Time-Series Data**: Track metrics over time (daily, weekly, monthly, yearly)
- **Aggregations**: Sum, count, and group data across multiple dimensions
- **Dashboards**: Power real-time productivity and business intelligence dashboards
- **Trend Analysis**: Identify patterns and trends in your document operations

## Generate the Processor

To generate an analytics processor, run the following command:

```bash
ph generate --processor todo-analytics --processor-type analytics --document-types powerhouse/todo-list
```

**Breaking down this command:**

- `--processor todo-analytics`: Creates a processor with the name "todo-analytics"
- `--processor-type analytics`: Specifies we want an analytics processor (vs relational database or webhook processors)
- `--document-types powerhouse/todo-list`: Tells the processor to only listen for changes to documents of type "powerhouse/todo-list"

**What gets generated:**

- A processor class file (`processors/todo-analytics/index.ts`)
- A factory file for configuration (`processors/index.ts` or updates to existing)

## Understanding the Generated Code

### The ProcessorFactory

The generator creates an `index.ts` containing a `processorFactory` function:

```typescript
import { type ProcessorRecord } from "document-drive/processors/types";
import { TodoAnalyticsProcessor } from "./todo-analytics/index.js";

export const processorFactory =
  (module: any) =>
  (driveId: string): ProcessorRecord[] => {
    return [
      {
        processor: new TodoAnalyticsProcessor(module.analyticsStore),
        filter: {
          branch: ["main"],
          documentId: ["*"],
          scope: ["global"],
          documentType: ["powerhouse/todo-list"],
        },
      },
    ];
  };
```

**Understanding the Factory Pattern:**

The factory uses a two-level function pattern for flexibility:

1. **Outer function** `(module: any) => ...`: Called once at initialization to resolve external dependencies (like `analyticsStore`)
2. **Inner function** `(driveId: string) => ...`: Called for each drive created, allowing per-drive processor configuration

**Filter Options Explained:**

- **`branch`**: Which document branches to monitor (usually "main" for production data)
- **`documentId`**: Specific document IDs to watch (`"*"` means all documents)
- **`documentType`**: Document types to process (ensures type safety)
- **`scope`**: Whether to process global changes or user-specific ones

The filter uses `AND` logic across fields and `OR` logic within arrays:

```typescript
// This matches: ("main" branch) AND (any documentId) AND ("powerhouse/todo-list") AND ("global" scope)
{
  branch: ["main"],
  documentId: ["*"],
  documentType: ["powerhouse/todo-list"],
  scope: ["global"],
}
```

### The onStrands Method

The `onStrands` method is the core of your processor—it's called for all updates matching your filter:

```typescript
async onStrands<TDocument extends PHDocument>(
  strands: InternalTransmitterUpdate<TDocument>[]
): Promise<void> {
  // Early return if nothing to process
  if (strands.length === 0) {
    return;
  }

  const analyticsInputs: AnalyticsSeriesInput[] = [];
  
  for (const strand of strands) {
    if (strand.operations.length === 0) {
      continue;
    }

    // Create a unique source path for this document
    const firstOp = strand.operations[0];
    const source = AnalyticsPath.fromString(
      `ph/${strand.driveId}/${strand.documentId}/${strand.branch}/${strand.scope}`,
    );

    // Clear previous analytics on first operation to avoid duplicates
    if (firstOp.index === 0) {
      await this.clearSource(source);
    }

    for (const operation of strand.operations) {
      // Your custom analytics logic goes here
      console.log(">>> ", operation.type);
    }
  }

  // Batch insert all analytics for optimal performance
  if (analyticsInputs.length > 0) {
    await this.analyticsStore.addSeriesValues(analyticsInputs);
  }
}
```

**Key Concepts:**

- **Strands**: Batches of operations that happened to documents, containing document ID, metadata, and operations
- **Source clearing**: On the first operation (`index === 0`), clear previous analytics to avoid duplicate entries
- **Batch inserts**: Always collect analytics inputs and insert them in a single batch for optimal performance

## Implement the Todo Analytics Processor

Now let's implement a complete analytics processor for the todo-list document model. This processor will track:

- **TodosCreated**: Count of todos added
- **TodosCompleted**: Count of todos marked as checked
- **TodosUncompleted**: Count of todos marked as unchecked
- **TodosDeleted**: Count of todos removed

### Design Your Analytics Dimensions

Before implementing, think about how you'll want to query the data. For todo productivity analytics, useful groupings include:

- **By document**: Track metrics per todo list
- **By drive**: Aggregate across all todo lists in a drive
- **Over time**: Daily, weekly, monthly trends

We'll use these dimension paths:

```typescript
// Dimension structure for todo analytics
const dimensions = {
  document: `/todo-list/document/${documentId}`,  // Per-document metrics
  drive: `/todo-list/drive/${driveId}`,           // Per-drive aggregates
  operation: `/todo-list/operation/${operationType}`, // By operation type
};
```

### Implement the Processor Logic

Open `processors/todo-analytics/index.ts` and replace the contents with:

```typescript
import { IAnalyticsStore } from "@powerhousedao/reactor-api";
import { AnalyticsPath, AnalyticsSeriesInput } from "@powerhousedao/reactor-api";
import { InternalTransmitterUpdate, IProcessor } from "document-drive";
import { PHDocument } from "document-model";
import { DateTime } from "luxon";
import type {
  AddTodoItemInput,
  UpdateTodoItemInput,
  DeleteTodoItemInput,
} from "../../document-models/todo-list/index.js";

export class TodoAnalyticsProcessor implements IProcessor {
  constructor(private readonly analyticsStore: IAnalyticsStore) {}

  async onStrands<TDocument extends PHDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void> {
    // Early return if nothing to process
    if (strands.length === 0) {
      return;
    }

    const analyticsInputs: AnalyticsSeriesInput[] = [];

    for (const strand of strands) {
      const { driveId, documentId, operations } = strand;
      
      if (operations.length === 0) {
        continue;
      }

      // Create a unique source path for tracking data origin
      const source = AnalyticsPath.fromString(
        `todo-list/${driveId}/${documentId}`,
      );

      // Clear previous analytics on first operation to avoid duplicates
      const firstOp = operations[0];
      if (firstOp.index === 0) {
        await this.analyticsStore.clearSeriesBySource(source);
      }

      // Process each operation
      for (const operation of operations) {
        const timestamp = DateTime.fromISO(operation.timestamp);
        
        // Base dimensions for all metrics
        const baseDimensions = {
          document: AnalyticsPath.fromString(`todo-list/document/${documentId}`),
          drive: AnalyticsPath.fromString(`todo-list/drive/${driveId}`),
        };

        switch (operation.type) {
          case "ADD_TODO_ITEM": {
            const input = operation.input as AddTodoItemInput;
            
            analyticsInputs.push({
              source,
              start: timestamp,
              value: 1,
              metric: "TodosCreated",
              dimensions: {
                ...baseDimensions,
                operation: AnalyticsPath.fromString("todo-list/operation/add"),
              },
            });
            break;
          }

          case "UPDATE_TODO_ITEM": {
            const input = operation.input as UpdateTodoItemInput;
            
            // Track completion status changes
            if (input.checked === true) {
              analyticsInputs.push({
                source,
                start: timestamp,
                value: 1,
                metric: "TodosCompleted",
                dimensions: {
                  ...baseDimensions,
                  operation: AnalyticsPath.fromString("todo-list/operation/complete"),
                },
              });
            } else if (input.checked === false) {
              analyticsInputs.push({
                source,
                start: timestamp,
                value: 1,
                metric: "TodosUncompleted",
                dimensions: {
                  ...baseDimensions,
                  operation: AnalyticsPath.fromString("todo-list/operation/uncomplete"),
                },
              });
            }
            break;
          }

          case "DELETE_TODO_ITEM": {
            const input = operation.input as DeleteTodoItemInput;
            
            analyticsInputs.push({
              source,
              start: timestamp,
              value: 1,
              metric: "TodosDeleted",
              dimensions: {
                ...baseDimensions,
                operation: AnalyticsPath.fromString("todo-list/operation/delete"),
              },
            });
            break;
          }
        }
      }
    }

    // Batch insert all analytics for optimal performance
    if (analyticsInputs.length > 0) {
      await this.analyticsStore.addSeriesValues(analyticsInputs);
    }
  }

  async onDisconnect(): Promise<void> {
    // Cleanup logic if needed
  }
}
```

**What's Happening:**

- **Source path**: Uniquely identifies where data came from (`todo-list/{driveId}/{documentId}`)
- **Dimensions**: Allow grouping by document, drive, or operation type
- **Metrics**: Named numerical values we're tracking
- **Timestamp**: When the operation occurred (for time-series queries)
- **Batch inserts**: All analytics are collected and inserted together for performance

## Expose Analytics Through a Subgraph

### Generate a Subgraph

Generate a new subgraph to expose your analytics data:

```bash
ph generate --subgraph todo-analytics
```

### Configure the Schema

Open `./subgraphs/todo-analytics/schema.ts` and define the GraphQL schema:

```typescript
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  """
  Analytics data point with time and value
  """
  type TodoAnalyticsRow {
    start: String!
    end: String!
    metric: String!
    value: Float!
    dimensions: [AnalyticsDimension!]!
  }

  type AnalyticsDimension {
    name: String!
    path: String!
  }

  """
  Todo productivity analytics queries
  """
  type Query {
    """
    Get todo analytics for a specific time range and granularity
    """
    todoAnalytics(
      driveId: ID!
      start: String!
      end: String!
      granularity: String!
    ): [TodoAnalyticsRow!]!
  }
`;
```

### Implement the Resolvers

Open `./subgraphs/todo-analytics/resolvers.ts` and implement the resolver:

```typescript
import { type ISubgraph } from "@powerhousedao/reactor-api";
import { AnalyticsPath } from "@powerhousedao/reactor-api";

export const getResolvers = (subgraph: ISubgraph) => {
  const analyticsStore = subgraph.analyticsStore;

  return {
    Query: {
      todoAnalytics: async (
        _: any,
        args: {
          driveId: string;
          start: string;
          end: string;
          granularity: string;
        },
      ) => {
        // Query analytics for the specified drive and time range
        const results = await analyticsStore.getSeriesValues({
          start: args.start,
          end: args.end,
          granularity: args.granularity as "daily" | "weekly" | "monthly" | "yearly" | "total",
          metrics: ["TodosCreated", "TodosCompleted", "TodosUncompleted", "TodosDeleted"],
          dimensions: [
            {
              name: "drive",
              select: AnalyticsPath.fromString(`todo-list/drive/${args.driveId}`),
              lod: 3,
            },
          ],
        });

        return results.rows.map((row) => ({
          start: row.start,
          end: row.end,
          metric: row.metric,
          value: row.value,
          dimensions: row.dimensions.map((dim) => ({
            name: dim.name,
            path: dim.path.toString(),
          })),
        }));
      },
    },
  };
};
```

## Query Analytics via the Supergraph

Start the reactor and test your analytics:

```bash
ph reactor
```

Open the GraphQL playground at `http://localhost:4001/graphql` and try these queries:

### Query: Get Monthly Todo Analytics

```graphql
query GetTodoAnalytics($driveId: ID!, $start: String!, $end: String!) {
  todoAnalytics(
    driveId: $driveId
    start: $start
    end: $end
    granularity: "monthly"
  ) {
    start
    end
    metric
    value
    dimensions {
      name
      path
    }
  }
}
```

Variables:

```json
{
  "driveId": "powerhouse",
  "start": "2025-01-01",
  "end": "2025-12-31"
}
```

### Using the Built-in Analytics Query

You can also query analytics directly through the built-in analytics subgraph:

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
    "granularity": "monthly",
    "start": "2025-01-01",
    "end": "2025-12-31",
    "metrics": ["TodosCreated", "TodosCompleted"],
    "dimensions": [
      {
        "name": "drive",
        "select": "todo-list/drive",
        "lod": 3
      }
    ]
  }
}
```

---

## QA Testing Scenario: End-to-End Analytics Validation

This scenario provides a comprehensive test flow for validating the analytics processor works correctly. Use this for QA testing of new releases.

### QA Test Plan: Todo Analytics Processor

**Objective**: Validate that the analytics processor correctly captures and aggregates todo operations.

---

### Step 1: Setup - Create a Test Drive

```graphql
mutation CreateTestDrive {
  addDrive(name: "qa-analytics-test") {
    id
    slug
    name
  }
}
```

**Expected**: Returns a new drive ID. Save this for subsequent steps.

**Verification**: Drive appears in the system and is accessible.

---

### Step 2: Create a Todo Document

```graphql
mutation CreateTodoDocument($driveId: String!) {
  TodoList_createDocument(driveId: $driveId, name: "QA Test List")
}
```

Variables:

```json
{
  "driveId": "<drive-id-from-step-1>"
}
```

**Expected**: Returns a document ID.

**Verification**: Document is created and accessible via `TodoList.getDocument`.

---

### Step 3: Generate Test Operations

Perform a series of operations to generate analytics data:

**3a. Add 5 todo items:**

```graphql
mutation AddTodo($driveId: String, $docId: PHID, $input: TodoList_AddTodoItemInput) {
  TodoList_addTodoItem(driveId: $driveId, docId: $docId, input: $input)
}
```

Run 5 times with different inputs:

```json
{ "text": "QA Test Item 1" }
{ "text": "QA Test Item 2" }
{ "text": "QA Test Item 3" }
{ "text": "QA Test Item 4" }
{ "text": "QA Test Item 5" }
```

**Expected**: 5 `TodosCreated` analytics entries.

**3b. Complete 3 todos:**

```graphql
mutation UpdateTodo($driveId: String, $docId: PHID, $input: TodoList_UpdateTodoItemInput) {
  TodoList_updateTodoItem(driveId: $driveId, docId: $docId, input: $input)
}
```

Run 3 times with `checked: true` for items 1, 2, and 3.

**Expected**: 3 `TodosCompleted` analytics entries.

**3c. Uncomplete 1 todo:**

Run update with `checked: false` for item 2.

**Expected**: 1 `TodosUncompleted` analytics entry.

**3d. Delete 1 todo:**

```graphql
mutation DeleteTodo($driveId: String, $docId: PHID, $input: TodoList_DeleteTodoItemInput) {
  TodoList_deleteTodoItem(driveId: $driveId, docId: $docId, input: $input)
}
```

Delete item 5.

**Expected**: 1 `TodosDeleted` analytics entry.

---

### Step 4: Verify Analytics Data

Query the analytics to verify all operations were captured:

```graphql
query VerifyAnalytics($filter: AnalyticsFilter) {
  analytics {
    series(filter: $filter) {
      rows {
        metric
        value
      }
    }
  }
}
```

Variables:

```json
{
  "filter": {
    "granularity": "total",
    "start": "2025-01-01",
    "end": "2025-12-31",
    "metrics": ["TodosCreated", "TodosCompleted", "TodosUncompleted", "TodosDeleted"],
    "dimensions": [
      {
        "name": "drive",
        "select": "todo-list/drive/<drive-id>",
        "lod": 3
      }
    ]
  }
}
```

**Expected Results:**

| Metric | Expected Value |
|--------|----------------|
| TodosCreated | 5 |
| TodosCompleted | 3 |
| TodosUncompleted | 1 |
| TodosDeleted | 1 |

---

### Step 5: Verify Time-Based Aggregation

Test that analytics aggregate correctly over time:

```graphql
query TimeBasedAnalytics($filter: AnalyticsFilter) {
  analytics {
    series(filter: $filter) {
      start
      end
      rows {
        metric
        value
      }
    }
  }
}
```

Variables:

```json
{
  "filter": {
    "granularity": "daily",
    "start": "2025-01-01",
    "end": "2025-01-31",
    "metrics": ["TodosCreated"],
    "dimensions": []
  }
}
```

**Expected**: Daily breakdown showing operations grouped by day.

---

### Step 6: Verify Document-Level Analytics

Test filtering by specific document:

```graphql
query DocumentAnalytics($filter: AnalyticsFilter) {
  analytics {
    series(filter: $filter) {
      rows {
        metric
        value
        dimensions {
          name
          path
        }
      }
    }
  }
}
```

Variables:

```json
{
  "filter": {
    "granularity": "total",
    "start": "2025-01-01",
    "end": "2025-12-31",
    "metrics": ["TodosCreated"],
    "dimensions": [
      {
        "name": "document",
        "select": "todo-list/document/<document-id>",
        "lod": 3
      }
    ]
  }
}
```

**Expected**: Analytics filtered to the specific document.

---

### Step 7: Cleanup

Delete the test drive and verify analytics are properly cleared:

```graphql
mutation DeleteTestDrive($driveId: String!) {
  deleteDrive(id: $driveId)
}
```

**Verification**: Analytics source data is cleared when processor handles drive deletion.

---

### QA Checklist

- [ ] Analytics processor starts without errors
- [ ] `TodosCreated` metric increments on `ADD_TODO_ITEM`
- [ ] `TodosCompleted` metric increments when `checked` changes to `true`
- [ ] `TodosUncompleted` metric increments when `checked` changes to `false`
- [ ] `TodosDeleted` metric increments on `DELETE_TODO_ITEM`
- [ ] Time-based granularity works (daily, weekly, monthly, yearly, total)
- [ ] Dimension filtering works (by drive, by document)
- [ ] Analytics clear correctly on first operation replay
- [ ] Batch inserts complete without errors
- [ ] Subgraph queries return expected data

---

## Advanced Topics

### Understanding Level of Detail (LOD)

The `lod` (Level of Detail) parameter controls how analytics are grouped:

```typescript
// LOD examples for path: "/todo-list/drive/my-drive-id"
lod: 0  // Returns: "/todo-list" (root level - all todo analytics)
lod: 1  // Returns: "/todo-list/drive" (by type - all drive-level analytics)
lod: 2  // Returns: "/todo-list/drive/my-drive-id" (specific drive)
```

Higher LOD values give more granular groupings. Use lower values for broad aggregations.

### Source vs Dimensions

Understanding the difference is crucial:

- **Source**: Identifies WHERE data came from (for clearing, subscriptions)
- **Dimensions**: Identifies HOW to group data (for queries, aggregations)

```typescript
// Source: Unique path to the data origin
const source = AnalyticsPath.fromString(`todo-list/${driveId}/${documentId}`);

// Dimensions: Grouping criteria for queries
const dimensions = {
  drive: AnalyticsPath.fromString(`todo-list/drive/${driveId}`),
  document: AnalyticsPath.fromString(`todo-list/document/${documentId}`),
};
```

---

## Summary

You've successfully learned how to create an analytics processor that:

1. ✅ **Listens for document changes** - Automatically detects when todo documents are modified
2. ✅ **Captures time-series metrics** - Tracks operations with timestamps for trend analysis
3. ✅ **Supports dimensional queries** - Group data by document, drive, or custom criteria
4. ✅ **Exposes data through GraphQL** - Makes analytics available via the supergraph
5. ✅ **Enables QA testing** - Provides a reproducible test scenario for release validation

**Key Concepts Recap:**

| Concept | Purpose |
|---------|---------|
| **Source** | Identifies data origin (for clearing, subscriptions) |
| **Dimensions** | Groups data for queries (by document, drive, etc.) |
| **Metrics** | Named numerical values being tracked |
| **LOD** | Level of detail for grouping granularity |
| **Granularity** | Time-based aggregation (daily, monthly, yearly, total) |

**Real-World Applications:**

Analytics processors are commonly used for:

- **Productivity dashboards** showing task completion rates
- **Business intelligence** reports on document activity
- **Trend analysis** identifying patterns over time
- **Resource planning** based on historical data
- **Compliance reporting** with audit trails

