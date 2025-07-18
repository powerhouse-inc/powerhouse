# Build a Todo-List Relational Database Processor 

In this chapter, we will implement a **Todo-List** relational database processor. This processor receives processed operations from the reactor and can use the `prevState`, `resultingState`, or data from the operations themselves to populate a database.

## Table of Contents

1. [Generate the Processor](#generate-the-processor)
2. [Define Your Database Schema](#define-your-database-schema)
3. [Generate Database Types](#generate-database-types)
4. [Configure the Processor Filter](#configure-the-processor-filter)
5. [Implement the Processor Logic](#implement-the-processor-logic)
6. [Test Your Processor](#test-your-processor)
7. [Expose Data Through a Subgraph](#expose-data-through-a-subgraph)
8. [Use the Data in Frontend Applications](#use-the-data-in-frontend-applications)

## Generate the Processor

To generate a relational database processor, run the following command:

```bash
ph generate --processor todo-processor --processor-type relationalDb --document-types powerhouse/todolist
```

This command creates a processor named `todo-processor` of type `relational database` that listens for changes from documents of type `powerhouse/todolist`.

## Define Your Database Schema

Next, define your database schema in the `processors/todo-processor/migration.ts` file.

The migration file contains `up` and `down` functions that are called when the processor is added or removed, respectively.

Here's an example of a todo table schema:

```ts
import { type IBaseRelationalDb } from "document-drive/processors/types"

export async function up(db: IRelationalDb<any>): Promise<void> {
  // Create table
  await db.schema
    .createTable("todo")
    .addColumn("task", "varchar(255)")
    .addColumn("status", "boolean")
    .addPrimaryKeyConstraint("todo_pkey", ["task"])
    .ifNotExists()
    .execute();
}

export async function down(db: IRelationalDb<any>): Promise<void> {
  // drop table
  await db.schema.dropTable("todo").execute();
}
```

## Generate Database Types

After defining your database schema, generate TypeScript types for type-safe queries and better IDE support:

```bash
ph generate --migration-file processors/todo-processor/migrations.js --schema-file processors/todo-processor/schema.ts
```

Check your `processors/todo-processor/schema.ts` file after generation - it will contain the TypeScript types for your database schema.

## Configure the Processor Filter

Configure the processor filter in `processors/todo-processor/factory.ts`:

```ts
import {
  type ProcessorRecord,
  type IProcessorHostModule,
} from "document-drive/processors/types";
import { type RelationalDbProcessorFilter } from "document-drive/processors/relational";
import { TodoIndexerProcessor } from "./index.js";

export const todoIndexerProcessorFactory =
  (module: IProcessorHostModule) =>
  async (driveId: string): Promise<ProcessorRecord[]> => {
    // Create a namespace for the processor and the provided drive id
    const namespace = TodoIndexerProcessor.getNamespace(driveId);

    // Create a namespaced db for the processor
    const store =
      await module.relationalDb.createNamespace<TodoIndexerProcessor>(
        namespace,
      );

    // Create a filter for the processor
    const filter: RelationalDbProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["powerhouse/todolist"],
      scope: ["global"],
    };

    // Create the processor
    const processor = new TodoIndexerProcessor(namespace, filter, store);
    return [
      {
        processor,
        filter,
      },
    ];
  };

```

## Implement the Processor Logic

Now implement the actual processor logic in `processors/todo-processor/processor.ts`:

```ts
import { type IRelationalDb } from "document-drive/processors/types";
import { RelationalDbProcessor } from "document-drive/processors/relational";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import type { ToDoListDocument } from "../../document-models/to-do-list/index.js";

import { up } from "./migrations.js";
import { type DB } from "./schema.js";

type DocumentType = ToDoListDocument;

export class TodoIndexerProcessor extends RelationalDbProcessor<DB> {
  static override getNamespace(driveId: string): string {
    // Default namespace: `${this.name}_${driveId.replaceAll("-", "_")}`
    return super.getNamespace(driveId);
  }

  override async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb);
  }

  override async onStrands(
    strands: InternalTransmitterUpdate<DocumentType>[],
  ): Promise<void> {
    if (strands.length === 0) {
      return;
    }

    for (const strand of strands) {
      if (strand.operations.length === 0) {
        continue;
      }

      for (const operation of strand.operations) {
        await this.relationalDb
          .insertInto("todo")
          .values({
            task: `${strand.documentId}-${operation.index}: ${operation.type}`,
            status: true,
          })
          .onConflict((oc) => oc.column("task").doNothing())
          .execute();
      }
    }
  }

  async onDisconnect() {}
}

```

## Test Your Processor

Create tests for your processor in `processors/todo-processor/processor.test.ts`:

```ts

import { type InternalTransmitterUpdate } from "document-drive";

import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { TodoIndexerProcessor } from "../processors/todo-indexer/index.js";

describe("todo-list", () => {
  let processor: TodoIndexerProcessor;
  const namespace = "search-indexer-test";

  beforeAll(async () => {
    try {
      const { dialect } = await KyselyPGlite.create();
      const db = new Kysely<unknown>({ dialect });
      processor = (await TodoIndexerProcessor.build(
        namespace,
        db,
      )) as TodoIndexerProcessor;
      await processor.initAndUpgrade();
    } catch (error) {
      console.error(error);
    }
  });

  it("should instantiate the processor", () => {
    expect(processor).toBeDefined();
  });

  it("should have a kysely instance as operational store", () => {
    expect(processor.operationalStore).toBeDefined();
    expect(processor.operationalStore).toBeInstanceOf(Kysely);
  });

  it("should create the db table", async () => {
    const tables = await processor.operationalStore.introspection.getTables();
    const tableNames = tables.map((table) => table.name);
    expect(tableNames).toContain("todo");
  });

  describe("Todo List", () => {
    it("should handle add todo", async () => {
      const strand: InternalTransmitterUpdate<TodoListDocument> = {
        driveId: "powerhouse",
        documentId: "todolist-document-id",
        documentType: "powerhouse/todolist",
        scope: "global" as const,
        branch: "main",
        operations: [{
          index: 0,
          type: "ADD_TODO"
        }],
       
      };

      await processor.onStrands([strand]);

      try {
        const result = await processor.operationalStore
          .selectFrom("atlas_scope_docs")
          .selectAll()
          .where("drive_id", "=", "powerhouse")
          .where("document_id", "=", "atlas-scope-document-id")
          .executeTakeFirst();
        expect(result).toBeDefined();
      } catch (e) {
        expect(e).toBeUndefined();
      }
    });
  })
});
```

## Expose Data Through a Subgraph

### Generate a Subgraph

Generate a new subgraph to expose your processor data:

```bash
ph generate --subgraph todo-subgraph
```

### Configure the Subgraph

Open `./subgraphs/todo-subgraph/index.ts` and configure the resolvers:

```ts
import { Subgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";
import { TodoIndexerProcessor } from "../../processors/todo-indexer/index.js";

export class SearchSubgraph extends Subgraph {
  name = "search";

  resolvers = {
    Query: {
      todos: {
        resolve: async (_: any, args: {driveId: string}) => {
          const todos = await TodoIndexerProcessor.query(args.driveId, this.relationalDb).selectFrom("todo").selectAll().execute();
          return todos.map((todo) => ({
            task: todo.task,
            status: todo.status,
          }));
        },
      },
    },
  };

  typeDefs = gql`

  type ToDoListEntry {
    task: String!
    status: Boolean!
  }

    type Query {
      todos(driveId: ID!): [ToDoListEntry]
    }
  `;

  async onDisconnect() {}
}

```

## Use the Data in Frontend Applications

### React Hooks

...

### Next.js API Route Example

```ts
// pages/api/todos.ts
import { type NextApiRequest, type NextApiResponse } from "next"

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { driveId = "powerhouse" } = req.query;

  try {
    // Query your subgraph or database directly
    const response = await fetch("http://localhost:4001/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query GetTodoList($driveId: String) {
            todoList(driveId: $driveId) {
              id
              name
              completed
              createdAt
              updatedAt
            }
          }
        `,
        variables: { driveId },
      }),
    });

    const data = await response.json();
    res.status(200).json(data.data.todoList);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch todos" });
  }
}
```

## Summary

You've successfully created a relational database processor that:

1. ✅ Listens for document changes
2. ✅ Stores data in a structured database
3. ✅ Provides type-safe database operations
4. ✅ Exposes data through GraphQL
5. ✅ Can be consumed by frontend applications

This processor will automatically sync your document changes to the relational database, making the data available for complex queries, reporting, and integration with other systems.


