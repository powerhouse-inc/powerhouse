# Relational database processor

In this chapter, we will implement a **Todo-List** relational database processor. This processor receives processed operations from the reactor and can use the `prevState`, `resultingState`, or data from the operations themselves to populate a database.

**What is a Relational Database Processor?**

A relational database processor is a specialized component that listens to document changes in your Powerhouse application and transforms that data into a traditional relational database format (like PostgreSQL, MySQL, or SQLite). This is incredibly useful for:

- **Analytics and Reporting**: Running complex SQL queries on your document data
- **Integration**: Connecting with existing business intelligence tools

## Generate the Processor

To generate a relational database processor, run the following command:

```bash
ph generate --processor todo-indexer --processor-type relationalDb --document-types powerhouse/todolist
```

**Breaking down this command:**

- `--processor todo-indexer`: Creates a processor with the name "todo-indexer"
- `--processor-type relationalDb`: Specifies we want a relational database processor (vs other types like analytics or webhook processors)
- `--document-types powerhouse/todolist`: Tells the processor to only listen for changes to documents of type "powerhouse/todolist"

This command creates a processor named `todo-indexer` of type `relational database` that listens for changes from documents of type `powerhouse/todolist`.

**What gets generated:**

- A processor class file (`processors/todo-indexer/index.ts`)
- A database migration file (`processors/todo-indexer/migrations.ts`)
- A factory file for configuration (`processors/todo-indexer/factory.ts`)
- A schema file for TypeScript types (`processors/todo-indexer/schema.ts`)

## Define Your Database Schema

Next, define your database schema in the `processors/todo-indexer/migration.ts` file.

**Understanding Database Migrations**

Migrations are version-controlled database changes that ensure your database schema evolves safely over time. They contain:

- **`up()` function**: Creates or modifies database structures when the processor starts
- **`down()` function**: Safely removes changes when the processor is removed

This approach ensures your database schema stays in sync across different environments (development, staging, production).

The migration file contains `up` and `down` functions that are called when the processor is added or removed, respectively.

In the migration.ts file you'll find an example of the todo table default schema:

```ts
import { type IRelationalDb } from "document-drive/processors/types";

export async function up(db: IRelationalDb<any>): Promise<void> {
  // Create table - this runs when the processor starts
  await db.schema
    .createTable("todo") // Creates a new table named "todo"
    .addColumn("task", "varchar(255)") // Text column for the task description (max 255 characters)
    .addColumn("status", "boolean") // Boolean column for completion status (true/false)
    .addPrimaryKeyConstraint("todo_pkey", ["task"]) // Makes "task" the primary key (unique identifier)
    .ifNotExists() // Only create if table doesn't already exist
    .execute(); // Execute the SQL command
}

export async function down(db: IRelationalDb<any>): Promise<void> {
  // Drop table - this runs when the processor is removed
  await db.schema.dropTable("todo").execute();
}
```

**Design Considerations:**

- We're using `task` as the primary key, which means each task description must be unique
- The `varchar(255)` limit ensures reasonable memory usage
- The `boolean` status makes it easy to filter completed vs. incomplete tasks
- Consider adding timestamps (`created_at`, `updated_at`) for audit trails in production applications

## Generate Database Types

After defining your database schema, generate TypeScript types for type-safe queries and better IDE support:

```bash
ph generate --migration-file processors/todo-indexer/migrations.ts
```

**Why Generate Types?**

TypeScript types provide several benefits:

- **Type Safety**: Catch errors at compile time instead of runtime
- **IDE Support**: Get autocomplete and IntelliSense for your database queries
- **Documentation**: Types serve as living documentation of your database structure
- **Refactoring**: Safe renaming and restructuring of database fields

Check your `processors/todo-indexer/schema.ts` file after generation - it will contain the TypeScript types for your database schema.

**Example of generated types:**

```ts
// This is what gets auto-generated based on your migration
export interface Database {
  todo: {
    task: string;
    status: boolean;
  };
}
```

## Configure the Processor Filter

This give you the opportunity to configure the processor filter in `processors/todo-indexer/factory.ts`:

**Understanding Processor Filters**

Filters determine which document changes your processor will respond to. This is crucial for performance and functionality:

- **Performance**: Only process relevant changes to avoid unnecessary work
- **Isolation**: Different processors can handle different document types
- **Scalability**: Distribute processing load across multiple processors

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
    // Namespaces prevent data collisions between different drives
    const namespace = TodoIndexerProcessor.getNamespace(driveId);

    // Create a namespaced db for the processor
    // This ensures each drive gets its own isolated database tables
    const store =
      await module.relationalDb.createNamespace<TodoIndexerProcessor>(
        namespace,
      );

    // Create a filter for the processor
    // This determines which document changes trigger the processor
    const filter: RelationalDbProcessorFilter = {
      branch: ["main"], // Only process changes from the "main" branch
      documentId: ["*"], // Process changes from any document ID (* = wildcard)
      documentType: ["powerhouse/todolist"], // Only process todolist documents
      scope: ["global"], // Process global changes (not user-specific)
    };

    // Create the processor instance
    const processor = new TodoIndexerProcessor(namespace, filter, store);
    return [
      {
        processor,
        filter,
      },
    ];
  };
```

**Filter Options Explained:**

- **`branch`**: Which document branches to monitor (usually "main" for production data)
- **`documentId`**: Specific document IDs to watch ("\*" means all documents)
- **`documentType`**: Document types to process (ensures type safety)
- **`scope`**: Whether to process global changes or user-specific ones

## Implement the Processor Logic

Now implement the actual processor logic in `processors/todo-indexer/index.ts` by copying the code underneath:

**Understanding the Processor Lifecycle**

The processor has several key methods:

- **`initAndUpgrade()`**: Runs once when the processor starts (perfect for running migrations)
- **`onStrands()`**: Runs every time relevant document changes occur (this is where the main logic goes)
- **`onDisconnect()`**: Cleanup when the processor shuts down

**What are "Strands"?**
Strands represent a batch of operations that happened to documents. Each strand contains:

- Document ID and metadata
- Array of operations (create, update, delete, etc.)
- Previous and resulting document states

```ts
import { type IRelationalDb } from "document-drive/processors/types";
import { RelationalDbProcessor } from "document-drive/processors/relational";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import type { ToDoListDocument } from "../document-models/to-do-list/index.js";

import { up } from "./todo-indexer/migrations.js";
import { type DB } from "./todo-indexer/schema.js";

// Define the document type this processor handles
type DocumentType = ToDoListDocument;

export class TodoIndexerProcessor extends RelationalDbProcessor<DB> {
  // Generate a unique namespace for this processor based on the drive ID
  // This prevents data conflicts between different drives
  static override getNamespace(driveId: string): string {
    // Default namespace: `${this.name}_${driveId.replaceAll("-", "_")}`
    return super.getNamespace(driveId);
  }

  // Initialize the processor and run database migrations
  // This method runs once when the processor starts up
  override async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb); // Run the database migration to create tables
  }

  // Main processing logic - handles incoming document changes
  // This method is called whenever there are new document operations
  override async onStrands(
    strands: InternalTransmitterUpdate<DocumentType>[],
  ): Promise<void> {
    // Early return if no changes to process
    if (strands.length === 0) {
      return;
    }

    // Process each strand (batch of changes) individually
    for (const strand of strands) {
      // Skip strands with no operations
      if (strand.operations.length === 0) {
        continue;
      }

      // Process each operation within the strand
      for (const operation of strand.operations) {
        // Insert a record for each operation into the database
        // This is a simple example - you might want more sophisticated logic
        await this.relationalDb
          .insertInto("todo")
          .values({
            // Create a unique task identifier combining document ID, operation index, and type
            task: `${strand.documentId}-${operation.index}: ${operation.type}`,
            status: true, // Default to completed status
          })
          // Handle conflicts by doing nothing if the task already exists
          // This prevents duplicate entries if operations are replayed
          .onConflict((oc) => oc.column("task").doNothing())
          .execute(); // Execute the database query
      }
    }
  }

  // Cleanup method called when the processor disconnects
  // Use this for closing connections, clearing caches, etc.
  async onDisconnect() {
    // Add any cleanup logic here
    // For example: await this.relationalDb.destroy();
  }
}
```

## Expose Data Through a Subgraph

### Generate a Subgraph

Generate a new subgraph to expose your processor data:

```bash
ph generate --subgraph todo
```

**What is a Subgraph?**

A subgraph is a GraphQL schema that exposes your processed data to clients. It:

- Provides a standardized API for accessing your relational database data
- Integrates with the Powerhouse supergraph for unified data access
- Supports both queries (reading data) and mutations (modifying data)
- Can join data across multiple processors and document types

### Configure the Subgraph

Open `./subgraphs/todo/schema.ts` and configure the schema:

```ts
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  # Define the structure of a todo item as returned by GraphQL
  type ToDoListEntry {
    task: String! # The task description (! means required/non-null)
    status: Boolean! # The completion status (true = done, false = pending)
  }

  # Define available queries
  type Query {
    todos(driveId: ID!): [ToDoListEntry] # Get array of todos for a specific drive
  }
`;
```

Open `./subgraphs/todo/resolvers.ts` and configure the resolvers:

```ts
// subgraphs/search-todos/resolvers.ts
import { type Subgraph } from "@powerhousedao/reactor-api";
import { type ToDoListDocument } from "document-models/to-do-list/index.js";
import { TodoIndexerProcessor } from "../../processors/todo-indexer/index.js";

export const getResolvers = (subgraph: Subgraph) => {
  const reactor = subgraph.reactor;
  const relationalDb = subgraph.relationalDb;

  return {
    Query: {
      todos: {
        // Resolver function for the "todos" query
        // Arguments: parent object, query arguments, context, GraphQL info
        resolve: async (_: any, args: { driveId: string }) => {
          // Query the database using the processor's static query method
          // This gives us access to the namespaced database for the specific drive
          const todos = await TodoIndexerProcessor.query(
            args.driveId,
            relationalDb,
          )
            .selectFrom("todo") // Select from the "todo" table
            .selectAll() // Get all columns
            .execute(); // Execute the query

          // Transform database results to match GraphQL schema
          return todos.map((todo) => ({
            task: todo.task, // Map database "task" column to GraphQL "task" field
            status: todo.status, // Map database "status" column to GraphQL "status" field
          }));
        },
      },
    },
  };
};
```

## Now query the data via the supergraph.

**Understanding the Supergraph**

The Powerhouse supergraph is a unified GraphQL endpoint that combines:

- **Document Models**: Direct access to your Powerhouse documents
- **Subgraphs**: Custom data views from your processors
- **Built-in APIs**: System functionality like authentication and drives

This unified approach means you can query document state AND processed data in a single request, which is perfect for building rich user interfaces.

The Powerhouse supergraph for any given remote drive or reactor can be found under `http://localhost:4001/graphql`. The gateway / supergraph available on `/graphql` combines all the subgraphs, except for the drive subgraph (which is accessible via `/d/:driveId`). To access the endpoint, start the reactor and navigate to the URL with `graphql` appended. The following commands explain how you can test & try the supergraph.

- Start the reactor:

  ```bash
  ph reactor
  ```

- This will return an endpoint, but you'll need to change the url of the endpoint to the following URL:

  ```
  http://localhost:4001/graphql
  ```

  The supergraph allows you to both query & mutate data from the same endpoint.
  Read more about [subgraphs](/academy/MasteryTrack/WorkWithData/UsingSubgraphs)

<details>
<summary>**Example: Complete Data Flow from Document Operations to Relational Database**</summary>

**Understanding the Complete Data Pipeline**

This comprehensive example demonstrates the **entire data flow** in a Powerhouse application:

1. **Storage Layer**: Create a drive (document storage container)
2. **Document Layer**: Create a todo document and add operations
3. **Processing Layer**: Watch the relational database processor automatically index changes
4. **API Layer**: Query both original document state AND processed relational data
5. **Analysis**: Compare the different data representations

---

### **Step 1: Create a Drive (Storage Container)**

**What's Happening**: Every document needs a "drive" - think of it as a folder or database that contains related documents. This is where your todo documents will live.

```graphql
mutation DriveCreation($name: String!) {
  addDrive(name: $name) {
    name
  }
}
```

Variables:

```json
{
  "driveId": "powerhouse",
  "name": "tutorial"
}
```

💡 **Behind the Scenes**: This creates a new drive namespace. Your relational database processor will create isolated tables for this drive using the namespace pattern we defined earlier.

---

### **Step 2: Create a Todo Document**

**What's Happening**: Now we're creating an actual todo list document inside our drive. This uses the document model we built in previous chapters.

```graphql
mutation Mutation($driveId: String, $name: String) {
  ToDoList_createDocument(driveId: $driveId, name: $name)
}
```

Variables:

```json
{
  "driveId": "powerhouse",
  "name": "tutorial"
}
```

Result:

```json
{
  "data": {
    "ToDoList_createDocument": "72b73d31-4874-4b71-8cc3-289ed4cfbe2b"
  }
}
```

💡 **Key Insight**: The returned UUID (`72b73d31-4874-4b71-8cc3-289ed4cfbe2b`) is crucial - this is the document ID that will appear in our processor's database records, linking operations back to their source document. You will receive a different UUID.

---

### **Step 3: Add Todo Items (Generate Operations)**

**What's Happening**: Each time we add a todo item, we're creating a new **operation** in the document's history. Our relational database processor is listening for these operations in real-time.

```graphql
mutation Mutation(
  $driveId: String
  $docId: PHID
  $input: ToDoList_AddTodoItemInput
) {
  ToDoList_addTodoItem(driveId: $driveId, docId: $docId, input: $input)
}
```

Variables:

```json
{
  "driveId": "powerhouse",
  "name": "tutorial",
  "docId": "72b73d31-4874-4b71-8cc3-289ed4cfbe2b",
  "input": {
    "id": "1",
    "text": "complete mutation"
  }
}
```

Result:

```json
{
  "data": {
    "ToDoList_addTodoItem": 1
  }
}
```

💡 **What Happens Next**:

1. **Document Model**: Stores the operation and updates document state
2. **Reactor**: Broadcasts the operation to all listening processors
3. **Our Processor**: Automatically receives the operation and creates a database record
4. **Database**: Now contains: `"72b73d31-4874-4b71-8cc3-289ed4cfbe2b-0: ADD_TODO_ITEM"`

🔄 **Repeat this step 2-3 times** with different todo items to see multiple operations get processed. Each operation will have an incrementing index (0, 1, 2...).

---

### **Step 4: Query Both Data Sources**

**The Power of Dual Data Access**: Now we can query BOTH the original document state AND our processed relational data in a single GraphQL request. This demonstrates the flexibility of the Powerhouse architecture.

```graphql
query Query($driveId: ID!) {
  todos(driveId: $driveId) {
    task
    status
  }
  ToDoList {
    getDocuments {
      state {
        items {
          text
        }
      }
    }
  }
}
```

Variables:

```json
{
  "driveId": "powerhouse"
}
```

Response:

```json
{
  "data": {
    "todos": [
      {
        "task": "72b73d31-4874-4b71-8cc3-289ed4cfbe2b-0: ADD_TODO_ITEM",
        "status": true
      },
      {
        "task": "72b73d31-4874-4b71-8cc3-289ed4cfbe2b-1: ADD_TODO_ITEM",
        "status": true
      },
      {
        "task": "72b73d31-4874-4b71-8cc3-289ed4cfbe2b-2: ADD_TODO_ITEM",
        "status": true
      }
    ],
    "ToDoList": {
      "getDocuments": [
        {
          "state": {
            "items": [
              {
                "text": "complete mutation"
              },
              {
                "text": "add another todo"
              },
              {
                "text": "Now check the data"
              }
            ]
          }
        }
      ]
    }
  }
}
```

---

### **🔍 Data Analysis: Understanding What You're Seeing**

**Document Model Data (`ToDoList.getDocuments`):**

- ✅ **Current State**: Shows the final todo items as they exist in the document
- ✅ **User-Friendly**: Displays actual todo text like "complete mutation"
- ✅ **Real-Time**: Always reflects the latest document state
- ❌ **Limited History**: Doesn't show how the document changed over time

**Processed Relational Data (`todos`):**

- ✅ **Operation History**: Shows each individual operation that occurred
- ✅ **Audit Trail**: You can see the sequence (0, 1, 2) of operations
- ✅ **Analytics Ready**: Perfect for counting operations, tracking changes
- ✅ **Integration Friendly**: Standard SQL database that other tools can access
- ❌ **Less User-Friendly**: Shows operation metadata rather than final state

---

**Key Differences:**

- **Document Query**: Gets the current state directly from the document model
- **Subgraph Query**: Gets processed/transformed data from your relational database
- **Combined Power**: You can query both in a single GraphQL request for rich UIs

This demonstrates how the supergraph provides a unified interface to both your document models and your custom subgraphs, allowing you to query and mutate data from the same endpoint.

</details>

## Use the Data in Frontend Applications

**Integration Options**

Your processed data can now be consumed by any GraphQL client:

- **React**: Using Apollo Client, urql, or Relay
- **Next.js**: API routes, getServerSideProps, or app router
- **Mobile Apps**: React Native, Flutter, or native iOS/Android
- **Desktop Apps**: Electron, Tauri, or other frameworks
- **Third-party Tools**: Any tool that supports GraphQL APIs

### React Hooks

**Coming Soon**: This section will cover how to use React hooks to consume your subgraph data in React applications. For now, you can use standard GraphQL clients like Apollo or urql to query your supergraph endpoint.

### Next.js API Route Example

**Why API Routes?**

Next.js API routes are useful when you need to:

- Add server-side authentication or authorization
- Transform data before sending to the client
- Implement caching or rate limiting
- Proxy requests to avoid CORS issues
- Add logging or monitoring

```ts
// pages/api/todos.ts
import { type NextApiRequest, type NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Only allow GET requests for this endpoint
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Extract driveId from query parameters, default to "powerhouse"
  const { driveId = "powerhouse" } = req.query;

  try {
    // Query your subgraph or database directly
    // In production, you might want to add authentication headers here
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

    // Return the todos array from the GraphQL response
    res.status(200).json(data.data.todoList);
  } catch (error) {
    // Log the error for debugging (in production, use proper logging)
    console.error("Failed to fetch todos:", error);

    // Return a generic error message to the client
    res.status(500).json({ error: "Failed to fetch todos" });
  }
}
```

## Summary

You've successfully created a relational database processor that:

1. ✅ **Listens for document changes** - Automatically detects when todo documents are modified
2. ✅ **Stores data in a structured database** - Transforms document operations into relational data
3. ✅ **Provides type-safe database operations** - Uses TypeScript for compile-time safety
4. ✅ **Exposes data through GraphQL** - Makes processed data available via a unified API
5. ✅ **Can be consumed by frontend applications** - Ready for integration with any GraphQL client

This processor will automatically sync your document changes to the relational database, making the data available for complex queries, reporting, and integration with other systems.

**Real-World Applications:**

This pattern is commonly used for:

- **Analytics dashboards** showing document usage patterns
- **Business intelligence** reports on document data
- **Integration** with existing enterprise systems
- **Search and filtering** with complex SQL queries
- **Data archival** and compliance requirements
